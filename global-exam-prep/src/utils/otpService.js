/**
 * OTP Service — generates, stores, and verifies one-time passwords.
 *
 * Security model:
 *  - OTP is cryptographically random (crypto.getRandomValues)
 *  - Only the SHA-256 hash is stored in Firestore — raw OTP is never persisted
 *  - Email is used as document key (base64-encoded) → 1 active OTP per email at all times
 *  - Expires in 10 minutes; max 3 wrong attempts before automatic invalidation
 */

import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

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

/** Converts an email address to a safe Firestore document ID */
function emailToDocId(email) {
    return btoa(email.trim().toLowerCase())
        .replace(/\//g, '-')
        .replace(/\+/g, '_')
        .replace(/=/g, '');
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Creates an OTP record in Firestore and sends the email via the /api/send-otp serverless function.
 * Any previous OTP for this email is atomically overwritten.
 *
 * @param {string} email - Recipient email address
 * @param {string} userName - Display name for the email greeting
 * @returns {Promise<true>}
 */
export async function createAndSendOTP(email, userName) {
    const otp     = generateOTP();
    const otpHash = await sha256(otp);
    const docId   = emailToDocId(email);

    const now       = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // +10 min

    // Overwrite any existing OTP for this email (1-per-email guarantee)
    await setDoc(doc(db, 'otp_tokens', docId), {
        email:     email.trim().toLowerCase(),
        otpHash,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        attempts:  0,
    });

    const res = await fetch('/api/send-otp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, otp, userName }),
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // Roll back Firestore write so user can try again
        await deleteDoc(doc(db, 'otp_tokens', docId)).catch(() => {});
        throw new Error(body.error || 'Failed to send verification email. Please try again.');
    }

    return true;
}

/**
 * Verifies a submitted OTP against the stored hash.
 *
 * @param {string} email - The email address to verify
 * @param {string} submittedOTP - The raw 6-digit code entered by the user
 * @returns {Promise<true>} Resolves on success
 * @throws {Error} With a user-friendly message on failure
 */
export async function verifyOTP(email, submittedOTP) {
    const docId  = emailToDocId(email);
    const docRef = doc(db, 'otp_tokens', docId);
    const snap   = await getDoc(docRef);

    if (!snap.exists()) {
        throw new Error('No verification code found. Please request a new one.');
    }

    const data = snap.data();

    // ── Expiry check ──
    if (new Date() > new Date(data.expiresAt)) {
        await deleteDoc(docRef);
        throw new Error('Your code has expired. Please request a new one.');
    }

    // ── Max attempts check ──
    if (data.attempts >= 3) {
        await deleteDoc(docRef);
        throw new Error('Too many incorrect attempts. Please request a new code.');
    }

    // ── Hash comparison ──
    const submittedHash = await sha256(submittedOTP.trim());

    if (submittedHash !== data.otpHash) {
        const newAttempts = data.attempts + 1;
        await setDoc(docRef, { ...data, attempts: newAttempts });

        if (newAttempts >= 3) {
            await deleteDoc(docRef);
            throw new Error('Too many incorrect attempts. Please request a new code.');
        }

        const remaining = 3 - newAttempts;
        throw new Error(`Incorrect code — ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
    }

    // ── Success: delete the used token ──
    await deleteDoc(docRef);
    return true;
}
