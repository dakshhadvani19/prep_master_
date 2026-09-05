/**
 * otpService.js — email one-time codes for student registration.
 *
 * Security model
 *  - OTP is 6 digits from crypto.getRandomValues (never Math.random).
 *  - Only the SHA-256 digest is written to Firestore; the raw code is never
 *    persisted and is sent straight to the /api/send-otp serverless function.
 *  - Document ID is `<base64url(email)>~<random nonce>`.
 *      The email half keeps one active challenge per address.
 *      The nonce half is held by *this* browser in sessionStorage, so another
 *      client cannot locate, read, overwrite, or pre-seed your pending
 *      challenge, and cannot enumerate who is mid-signup. `otp_tokens` also has
 *      `list` denied in firestore.rules, so the collection is unscrapeable.
 *  - Expires after 10 minutes; 3 wrong attempts then the record is destroyed.
 *    The attempt counter is advanced with a Firestore atomic increment because
 *    firestore.rules only permits `attempts` to move up by 1, so a client can
 *    no longer reset the lockout by rewriting the document.
 */

import {
    doc,
    setDoc,
    getDoc,
    deleteDoc,
    updateDoc,
    increment,
} from 'firebase/firestore';
import { db, firebaseConfigError } from '../firebase';

const OTP_TTL_MS      = 10 * 60 * 1000; // 10 minutes, matches the email copy
const MAX_ATTEMPTS    = 3;
const RESEND_COOLDOWN = 60;           // seconds; UI must not block for the TTL
const NONCE_PREFIX    = 'pm_otp_nonce_';

// Every await in this module used to be unbounded. Firestore behaves exactly as
// designed when it cannot reach its backend — it queues the write and leaves the
// returned promise pending forever — so a deployment missing the VITE_FIREBASE_*
// variables (or an offline client, or a serverless call that never answers) froze
// "Create Account" on a spinner with no error and no timeout. Each step now has a
// deadline, so the UI always ends up on the OTP screen or on a message.
const STORE_TIMEOUT_MS       = 8000;  // digest write / challenge read
const STORE_OPS_TIMEOUT_MS   = 5000;  // best-effort delete + attempt increment
const MAIL_TIMEOUT_MS        = 25000; // /api/send-otp: cold start + SMTP can be slow

/**
 * Rejects with a user-facing message if `promise` has not settled in `ms`. The
 * underlying work is NOT cancelled (a late write is harmless: the next request
 * supersedes it); only the caller's wait is bounded.
 */
function withTimeout(promise, ms, message) {
    let timer;
    return Promise.race([
        Promise.resolve(promise),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
    ]).finally(() => clearTimeout(timer));
}

/** One challenge per address in flight, however often the button is fired. */
const inFlight = new Map();

/** Firestore is unreachable by construction in this build: say so, don't hang. */
function assertStoreConfigured() {
    if (firebaseConfigError) {
        throw new Error(
            'Verification service is unavailable right now (the app is missing its '
            + 'Firebase configuration). Please try again shortly.'
        );
    }
}

// ─── Crypto helpers ────────────────────────────────────────────────────────────

function generateOTP() {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return String(100000 + (arr[0] % 900000)); // always 6 digits
}

async function sha256(str) {
    const data = new TextEncoder().encode(str);
    const buf  = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

function randomNonce() {
    const arr = new Uint8Array(12);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** base64url of the normalised email — the stable half of the document key. */
function emailToKeyPart(email) {
    return btoa(email.trim().toLowerCase())
        .replace(/\//g, '-')
        .replace(/\+/g, '_')
        .replace(/=/g, '');
}

function nonceStorageKey(email) {
    return NONCE_PREFIX + emailToKeyPart(email);
}

function rememberNonce(email, nonce) {
    try { sessionStorage.setItem(nonceStorageKey(email), nonce); } catch { /* private mode */ }
}

function recallNonce(email) {
    try { return sessionStorage.getItem(nonceStorageKey(email)); } catch { return null; }
}

function forgetNonce(email) {
    try { sessionStorage.removeItem(nonceStorageKey(email)); } catch { /* noop */ }
}

/**
 * Resolves the document ID for an in-flight challenge.
 * A fresh ID is derived for issuing; verification requires the nonce this
 * browser was given, so a challenge can never be resolved "blind".
 */
function docIdFor(email, nonce) {
    return `${emailToKeyPart(email)}~${nonce}`;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Issues a challenge, then emails it. A previous OTP for this address is
 * superseded (its doc is deleted first) so exactly one is ever live.
 *
 * @param {string} email
 * @param {string} userName - first name used in the email greeting
 * @returns {Promise<{sentAt: number, resendAfter: number, expiresAt: number}>}
 * @throws {Error} user-facing message
 */
export async function createAndSendOTP(email, userName) {
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
        throw new Error('Please enter a valid email address.');
    }

    assertStoreConfigured();

    // A second click while the first request is still running must not mail a
    // second code or start a second challenge; it joins the same attempt instead.
    const running = inFlight.get(cleanEmail);
    if (running) return running;

    const attempt = issueOtp(cleanEmail, userName).finally(() => inFlight.delete(cleanEmail));
    inFlight.set(cleanEmail, attempt);
    return attempt;
}

async function issueOtp(cleanEmail, userName) {

    // Throttle rapid re-issues (the API also rate-limits, this saves the round-trip).
    const previousNonce = recallNonce(cleanEmail);
    const now = Date.now();
    if (previousNonce) {
        const prev = await withTimeout(
            getDoc(doc(db, 'otp_tokens', docIdFor(cleanEmail, previousNonce))),
            STORE_TIMEOUT_MS, 'Could not check the previous code. Please try again.',
        ).catch(() => null);
        const prevCreatedAt = prev?.exists() ? Date.parse(prev.data().createdAt) : 0;
        if (prevCreatedAt && now - prevCreatedAt < RESEND_COOLDOWN * 1000) {
            const wait = Math.ceil((RESEND_COOLDOWN * 1000 - (now - prevCreatedAt)) / 1000);
            throw new Error(`Please wait ${wait}s before requesting another code.`);
        }
        // Supersede the old challenge so the emailed code stops working. Best
        // effort: a stalled delete must not hold up issuing the new code.
        await withTimeout(
            deleteDoc(doc(db, 'otp_tokens', docIdFor(cleanEmail, previousNonce))),
            STORE_OPS_TIMEOUT_MS, 'timeout',
        ).catch(() => {});
    }

    const otp       = generateOTP();
    const otpHash   = await sha256(otp);
    const nonce     = randomNonce();
    const docId     = docIdFor(cleanEmail, nonce);
    const createdAt = new Date(now);
    const expiresAt = new Date(now + OTP_TTL_MS);

    await withTimeout(
        setDoc(doc(db, 'otp_tokens', docId), {
            email:     cleanEmail,
            otpHash,
            createdAt: createdAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
            attempts:  0,
        }),
        STORE_TIMEOUT_MS,
        'Could not save the verification code. Please try again.',
    );

    // The body is deliberately { email, otp, userName } and nothing else: the
    // password never reaches this endpoint (nor does it need to).
    const controller = new AbortController();
    const mailTimer = setTimeout(() => controller.abort(), MAIL_TIMEOUT_MS);
    try {
        const res = await withTimeout(
            fetch('/api/send-otp', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ email: cleanEmail, otp, userName }),
                signal:  controller.signal,
            }),
            MAIL_TIMEOUT_MS,
            'The email service is taking too long to respond. Please try again.',
        );

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || 'Failed to send the verification email.');
        }
    } catch (err) {
        controller.abort();
        // Roll back so the address is free to retry immediately. Bounded, because
        // a rollback that itself hangs is what we are trying to avoid.
        await withTimeout(
            deleteDoc(doc(db, 'otp_tokens', docId)), STORE_OPS_TIMEOUT_MS, 'timeout',
        ).catch(() => {});
        forgetNonce(cleanEmail);
        throw new Error(
            err instanceof Error && err.message
                ? err.message
                : 'Could not reach the email service. Please try again.'
        );
    } finally {
        clearTimeout(mailTimer);
    }

    // Only remember the nonce once the code is demonstrably in flight.
    rememberNonce(cleanEmail, nonce);

    return {
        sentAt:      now,
        resendAfter: RESEND_COOLDOWN,
        expiresAt:   expiresAt.getTime(),
    };
}

/**
 * Checks a submitted code against the stored digest.
 * Resolves with the verified email on success and destroys the challenge
 * (single use). Throws a user-facing Error otherwise.
 *
 * @param {string} email
 * @param {string} submittedOTP
 * @returns {Promise<string>} the verified, normalised email
 */
export async function verifyOTP(email, submittedOTP) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const code       = String(submittedOTP || '').trim();

    if (!/^\d{6}$/.test(code)) {
        throw new Error('Enter the 6-digit code from your email.');
    }

    const nonce = recallNonce(cleanEmail);
    if (!nonce) {
        throw new Error('No verification is in progress. Please request a new code.');
    }

    const docRef = doc(db, 'otp_tokens', docIdFor(cleanEmail, nonce));
    const snap   = await withTimeout(
        getDoc(docRef), STORE_TIMEOUT_MS,
        'Could not reach the verification service. Please try again.',
    );

    if (!snap.exists()) {
        forgetNonce(cleanEmail);
        throw new Error('No verification code found. Please request a new one.');
    }

    const data = snap.data();

    // Defence in depth: the digest must belong to this address.
    if (data.email && data.email !== cleanEmail) {
        await withTimeout(deleteDoc(docRef), STORE_OPS_TIMEOUT_MS, 'timeout').catch(() => {});
        forgetNonce(cleanEmail);
        throw new Error('This verification request is invalid. Please start again.');
    }

    if (Date.now() > Date.parse(data.expiresAt)) {
        await withTimeout(deleteDoc(docRef), STORE_OPS_TIMEOUT_MS, 'timeout').catch(() => {});
        forgetNonce(cleanEmail);
        throw new Error('Your code has expired. Please request a new one.');
    }

    const attempts = Number(data.attempts ?? 0);
    if (attempts >= MAX_ATTEMPTS) {
        await withTimeout(deleteDoc(docRef), STORE_OPS_TIMEOUT_MS, 'timeout').catch(() => {});
        forgetNonce(cleanEmail);
        throw new Error('Too many incorrect attempts. Please request a new code.');
    }

    const submittedHash = await sha256(code);

    if (submittedHash !== data.otpHash) {
        const remaining = MAX_ATTEMPTS - (attempts + 1);

        // Atomic increment: rules allow attempts to advance by exactly 1. If the
        // store is unreachable this is best effort — the code still has to match.
        await withTimeout(
            updateDoc(docRef, { attempts: increment(1) }), STORE_OPS_TIMEOUT_MS, 'timeout',
        ).catch(() => {});

        if (remaining <= 0) {
            await withTimeout(deleteDoc(docRef), STORE_OPS_TIMEOUT_MS, 'timeout').catch(() => {});
            forgetNonce(cleanEmail);
            throw new Error('Too many incorrect attempts. Please request a new code.');
        }

        throw new Error(
            `Incorrect code — ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
        );
    }

    // Single use: burn the challenge before the caller creates the account.
    await withTimeout(deleteDoc(docRef), STORE_OPS_TIMEOUT_MS, 'timeout').catch(() => {});
    forgetNonce(cleanEmail);

    return cleanEmail;
}

/** Milliseconds left before a resend is allowed (0 when allowed now). */
export function resendCooldownRemaining(msSinceSent) {
    return Math.max(0, RESEND_COOLDOWN * 1000 - msSinceSent);
}

export { OTP_TTL_MS, MAX_ATTEMPTS, RESEND_COOLDOWN };
