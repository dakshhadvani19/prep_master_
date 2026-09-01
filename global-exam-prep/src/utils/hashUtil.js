/**
 * hashUtil.js
 *
 * Password hashing using the Web Crypto API (SHA-256).
 * Same engine as otpService.js — no extra dependency needed.
 *
 * Hash scheme:  SHA-256( password + ":" + email.toLowerCase() )
 * The email acts as a per-user salt so two users with identical
 * passwords never produce the same hash in the database.
 *
 * Int64 IDs:  Firestore atomic increment via FieldValue.increment(1)
 * on a single counter document.  Returns the new value as a JS
 * number (safe up to Number.MAX_SAFE_INTEGER ≈ 9 quadrillion).
 */

import { doc, runTransaction, increment, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

// ─── SHA-256 helper ────────────────────────────────────────────────────────────

async function sha256(str) {
    const data = new TextEncoder().encode(str);
    const buf  = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Hashes a plain-text password with the user's email as salt.
 * @param {string} password  – raw password string
 * @param {string} email     – the user's email (lowercased internally)
 * @returns {Promise<string>} hex-encoded SHA-256 hash
 */
export async function hashPassword(password, email) {
    const payload = `${password}:${email.trim().toLowerCase()}`;
    return sha256(payload);
}

/**
 * Compares a plain-text password against a stored hash.
 * @param {string} password      – raw password to check
 * @param {string} email         – user's email (must match what was used at signup)
 * @param {string} storedHash    – the hex hash stored in Firestore
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, email, storedHash) {
    const hash = await hashPassword(password, email);
    return hash === storedHash;
}

// ─── Auto-increment int64 IDs ──────────────────────────────────────────────────

const COUNTERS_DOC = doc(db, 'meta', 'counters');

/**
 * Atomically increments the student counter and returns the new int64 ID.
 * @returns {Promise<number>}
 */
export async function getNextStudentId() {
    return runTransaction(db, async (tx) => {
        const snap = await tx.get(COUNTERS_DOC);
        const current = snap.exists() ? (snap.data().studentCount ?? 0) : 0;
        const next = current + 1;
        if (snap.exists()) {
            tx.update(COUNTERS_DOC, { studentCount: next });
        } else {
            tx.set(COUNTERS_DOC, { studentCount: next, adminCount: 0 });
        }
        return next;
    });
}

/**
 * Atomically increments the admin counter and returns the new int64 ID.
 * @returns {Promise<number>}
 */
export async function getNextAdminId() {
    return runTransaction(db, async (tx) => {
        const snap = await tx.get(COUNTERS_DOC);
        const current = snap.exists() ? (snap.data().adminCount ?? 0) : 0;
        const next = current + 1;
        if (snap.exists()) {
            tx.update(COUNTERS_DOC, { adminCount: next });
        } else {
            tx.set(COUNTERS_DOC, { studentCount: 0, adminCount: next });
        }
        return next;
    });
}
