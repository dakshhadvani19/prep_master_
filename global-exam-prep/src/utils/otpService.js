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
import { db } from '../firebase';

const OTP_TTL_MS      = 10 * 60 * 1000; // 10 minutes, matches the email copy
const MAX_ATTEMPTS    = 3;
const RESEND_COOLDOWN = 60;           // seconds; UI must not block for the TTL
const NONCE_PREFIX    = 'pm_otp_nonce_';

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

    // Throttle rapid re-issues (the API also rate-limits, this saves the round-trip).
    const previousNonce = recallNonce(cleanEmail);
    const now = Date.now();
    if (previousNonce) {
        const prev = await getDoc(doc(db, 'otp_tokens', docIdFor(cleanEmail, previousNonce)))
            .catch(() => null);
        const prevCreatedAt = prev?.exists() ? Date.parse(prev.data().createdAt) : 0;
        if (prevCreatedAt && now - prevCreatedAt < RESEND_COOLDOWN * 1000) {
            const wait = Math.ceil((RESEND_COOLDOWN * 1000 - (now - prevCreatedAt)) / 1000);
            throw new Error(`Please wait ${wait}s before requesting another code.`);
        }
        // Supersede the old challenge so the emailed code stops working.
        await deleteDoc(doc(db, 'otp_tokens', docIdFor(cleanEmail, previousNonce)))
            .catch(() => {});
    }

    const otp       = generateOTP();
    const otpHash   = await sha256(otp);
    const nonce     = randomNonce();
    const docId     = docIdFor(cleanEmail, nonce);
    const createdAt = new Date(now);
    const expiresAt = new Date(now + OTP_TTL_MS);

    await setDoc(doc(db, 'otp_tokens', docId), {
        email:     cleanEmail,
        otpHash,
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        attempts:  0,
    });

    try {
        const res = await fetch('/api/send-otp', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ email: cleanEmail, otp, userName }),
        });

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || 'Failed to send the verification email.');
        }
    } catch (err) {
        // Roll back so the address is free to retry immediately.
        await deleteDoc(doc(db, 'otp_tokens', docId)).catch(() => {});
        forgetNonce(cleanEmail);
        throw new Error(
            err instanceof Error && err.message
                ? err.message
                : 'Could not reach the email service. Please try again.'
        );
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
    const snap   = await getDoc(docRef);

    if (!snap.exists()) {
        forgetNonce(cleanEmail);
        throw new Error('No verification code found. Please request a new one.');
    }

    const data = snap.data();

    // Defence in depth: the digest must belong to this address.
    if (data.email && data.email !== cleanEmail) {
        await deleteDoc(docRef).catch(() => {});
        forgetNonce(cleanEmail);
        throw new Error('This verification request is invalid. Please start again.');
    }

    if (Date.now() > Date.parse(data.expiresAt)) {
        await deleteDoc(docRef).catch(() => {});
        forgetNonce(cleanEmail);
        throw new Error('Your code has expired. Please request a new one.');
    }

    const attempts = Number(data.attempts ?? 0);
    if (attempts >= MAX_ATTEMPTS) {
        await deleteDoc(docRef).catch(() => {});
        forgetNonce(cleanEmail);
        throw new Error('Too many incorrect attempts. Please request a new code.');
    }

    const submittedHash = await sha256(code);

    if (submittedHash !== data.otpHash) {
        const remaining = MAX_ATTEMPTS - (attempts + 1);

        // Atomic increment: rules allow attempts to advance by exactly 1.
        await updateDoc(docRef, { attempts: increment(1) }).catch(() => {});

        if (remaining <= 0) {
            await deleteDoc(docRef).catch(() => {});
            forgetNonce(cleanEmail);
            throw new Error('Too many incorrect attempts. Please request a new code.');
        }

        throw new Error(
            `Incorrect code — ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
        );
    }

    // Single use: burn the challenge before the caller creates the account.
    await deleteDoc(docRef).catch(() => {});
    forgetNonce(cleanEmail);

    return cleanEmail;
}

/** Milliseconds left before a resend is allowed (0 when allowed now). */
export function resendCooldownRemaining(msSinceSent) {
    return Math.max(0, RESEND_COOLDOWN * 1000 - msSinceSent);
}

export { OTP_TTL_MS, MAX_ATTEMPTS, RESEND_COOLDOWN };
