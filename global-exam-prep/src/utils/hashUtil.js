/**
 * hashUtil.js
 *
 * Password digest + auto-increment IDs for PrepMaster auth.
 *
 * ─── Why a digest exists at all ─────────────────────────────────────────────
 * SRS/ER_Diagram_last_updated_25_8.jpg gives Students a `Password` attribute,
 * so the profile keeps a `passwordHash` field. Supabase Auth remains the
 * credential actually verified at login (signInWithEmailAndPassword); this
 * digest exists to satisfy the ER attribute and to allow out-of-band recovery.
 *
 * ─── Scheme ────────────────────────────────────────────────────────────────
 * v2 (current): PBKDF2-HMAC-SHA256, 210 000 rounds, random 16-byte per-user
 * salt, encoded as:
 *      pbkdf2$<rounds>$<saltHex>$<hashHex>
 *
 * The previous scheme was a single SHA-256(password + ":" + email). That is a
 * fast hash with a *predictable* salt, so anyone who read the collection could
 * brute-force weak passwords offline at GPU speed. PBKDF2 with a random salt
 * makes each row independently expensive to attack.
 *
 * v1 digests already written to the database still verify, so no account is
 * stranded by the upgrade; callers should re-hash on next successful login to
 * migrate lazily.
 *
 * ─── Int64 IDs ─────────────────────────────────────────────────────────────
 * A previous version used a remote transaction for counters; the temporary implementation below is browser-local.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const PBKDF2_ROUNDS = 210_000;
const SALT_BYTES    = 16;
const KEY_BITS      = 256;

// ─── Low-level helpers ────────────────────────────────────────────────────────

function toHex(buffer) {
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

async function sha256(str) {
    const data = new TextEncoder().encode(str);
    const buf  = await crypto.subtle.digest('SHA-256', data);
    return toHex(buf);
}

/**
 * Legacy v1 digest, kept only so existing rows can still be verified.
 * NOT used for new writes.
 */
async function legacyHashV1(password, email) {
    return sha256(`${password}:${email.trim().toLowerCase()}`);
}

async function pbkdf2(password, saltBytes, rounds) {
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveBits']
    );

    const bits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: saltBytes,
            iterations: rounds,
            hash: 'SHA-256',
        },
        keyMaterial,
        KEY_BITS
    );

    return toHex(bits);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Produces the value stored in `students/{uid}.passwordHash`.
 *
 * @param {string} password  – raw password (never persisted)
 * @returns {Promise<string>} "pbkdf2$<rounds>$<saltHex>$<hashHex>"
 */
export async function hashPassword(password) {
    if (!password) throw new Error('A password is required.');

    const salt       = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const derived    = await pbkdf2(password, salt, PBKDF2_ROUNDS);

    return `pbkdf2$${PBKDF2_ROUNDS}$${toHex(salt)}$${derived}`;
}

/**
 * Verifies a password against a stored digest. Understands both the current
 * v2 encoding and the legacy v1 bare-SHA-256 form.
 *
 * @returns {Promise<{valid: boolean, needsUpgrade: boolean}>}
 *          `needsUpgrade` is true when the stored value is a v1 digest, so the
 *          caller can transparently re-hash and migrate the row.
 */
export async function verifyPassword(password, email, storedHash) {
    if (!storedHash || !password) return { valid: false, needsUpgrade: false };

    const parts = String(storedHash).split('$');

    if (parts[0] === 'pbkdf2') {
        const [, roundsStr, saltHex, expected] = parts;
        const rounds = Number(roundsStr);

        if (!Number.isFinite(rounds) || rounds <= 0 || !saltHex || !expected) {
            return { valid: false, needsUpgrade: false };
        }

        const saltBytes = new Uint8Array(
            saltHex.match(/.{2}/g).map(byte => parseInt(byte, 16))
        );
        const actual = await pbkdf2(password, saltBytes, rounds);

        return {
            valid: timingSafeEqualHex(actual, expected),
            needsUpgrade: false,
        };
    }

    // Legacy 64-hex-char SHA-256(password:email)
    const legacy = await legacyHashV1(password, email || '');
    return {
        valid: timingSafeEqualHex(legacy, String(storedHash)),
        needsUpgrade: legacy === String(storedHash),
    };
}

/** Constant-time-ish comparison for two equal-length hex strings. */
function timingSafeEqualHex(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;

    let diff = 0;
    for (let i = 0; i < a.length; i += 1) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}

/** True when a stored digest predates the PBKDF2 upgrade. */
export function isLegacyHash(storedHash) {
    return !!storedHash && !String(storedHash).startsWith('pbkdf2$');
}

// ─── Temporary browser-local numeric IDs ─────────────────────────────────────
const COUNTERS_KEY = 'prepmaster_id_counters_v1';

function readCounters() {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const raw = window.localStorage.getItem(COUNTERS_KEY);
            if (raw) return JSON.parse(raw);
        }
    } catch {}
    return { studentCount: 0, adminCount: 0 };
}

function writeCounters(counters) {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(COUNTERS_KEY, JSON.stringify(counters));
        }
    } catch {}
}

function bumpCounter(field) {
    const counters = readCounters();
    counters[field] = Number(counters[field] || 0) + 1;
    writeCounters(counters);
    return counters[field];
}

export async function getNextStudentId() {
    return bumpCounter('studentCount');
}

export async function getNextAdminId() {
    return bumpCounter('adminCount');
}

export async function peekCounters() {
    const counters = readCounters();
    return { studentCount: counters.studentCount || 0, adminCount: counters.adminCount || 0 };
}
