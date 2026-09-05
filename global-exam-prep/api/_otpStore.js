/**
 * api/_otpStore.js — server-only helpers for the signup OTP challenge.
 *
 * Everything that must never happen in a browser lives here:
 *   - generating the code,
 *   - deriving its digest (keyed HMAC, so a leaked table cannot be brute-forced
 *     offline against a 10^6 code space),
 *   - talking to Postgres (the service-role key is a server secret; it is read
 *     from env and never leaves this process),
 *   - the per-caller request budget.
 *
 * The browser's role is reduced to: ask for a code, type a code. It cannot read,
 * write, or infer the challenge row, and it never sees a digest.
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/*
 * This module only ever runs in Vercel's Node runtime, where `process` and `Buffer`
 * are globals. Naming them through globalThis keeps them resolvable without widening
 * the browser-side ESLint config (which knows nothing about Node) — a config override
 * would have muted the rule for every future file under api/.
 */
const process = globalThis.process;
const Buffer = globalThis.Buffer;

// ─── The numbers the whole flow agrees on ────────────────────────────────────
// The UI countdown and the DB expiry must not drift, so they come from here and
// are returned to the client by the API rather than being duplicated in a bundle.
export const OTP_LENGTH          = 6;
export const OTP_TTL_SECONDS     = 600;   // 10 minutes, matches the email copy
export const RESEND_COOLDOWN_S   = 60;    // enforced in Postgres, not in the tab
export const MAX_ATTEMPTS        = 3;

const RPC_TIMEOUT_MS       = 8000;
const RATE_WINDOW_MS       = 10 * 60 * 1000;
const MAX_PER_EMAIL        = 5;    // codes per address per window
const MAX_IP_PER_WINDOW    = 20;   // requests per IP per window (send + verify)
const MAX_VERIFY_PER_EMAIL = 10;   // guesses per address per window

// ─── Configuration ───────────────────────────────────────────────────────────
/**
 * Env this runtime needs. Names only — a value is never returned, because this
 * string is shown to users through an API response.
 */
export function missingConfig() {
    const needed = {
        SUPABASE_URL: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        OTP_PEPPER: process.env.OTP_PEPPER,
    };
    const missing = Object.entries(needed)
        .filter(([, value]) => !value || /your-|placeholder|changeme|xxx/i.test(String(value)))
        .map(([name]) => name);
    return missing;
}

function supabaseUrl() {
    return String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '')
        .replace(/\/+$/, '');
}

// ─── Code + digest ───────────────────────────────────────────────────────────
/**
 * Six digits, first one non-zero, from the CSPRNG (`randomInt`, not Math.random).
 * The leading digit is why the client can validate /^[1-9]\d{5}$/ and why a code
 * can never look like "000000" when someone fat-fingers the field.
 */
export function generateOtp() {
    let code = '';
    for (let i = 0; i < OTP_LENGTH; i += 1) {
        code += i === 0 ? String(randomInt(1, 10)) : String(randomInt(0, 10));
    }
    return code;
}

/**
 * digest = HMAC-SHA256(key = OTP_PEPPER, msg = email || ':' || code).
 *
 * Keying it to the address means a row only ever proves the code for THAT address,
 * and the pepper means the row proves nothing at all to whoever stole the table.
 */
export function otpDigest(email, otp) {
    const pepper = process.env.OTP_PEPPER;
    if (!pepper) throw new Error('OTP_PEPPER is not configured on the server.');
    return createHmac('sha256', String(pepper))
        .update(`${String(email).trim().toLowerCase()}:${otp}`)
        .digest('hex');
}

/** Used only by tests/diagnostics; the server never compares user input this way. */
export function digestMatches(a, b) {
    const x = Buffer.from(String(a || ''), 'utf8');
    const y = Buffer.from(String(b || ''), 'utf8');
    return x.length === y.length && timingSafeEqual(x, y);
}

// ─── Postgres (through PostgREST, with the service-role key) ──────────────────
/**
 * Calls a SECURITY DEFINER function. Bounded three ways, because an unbounded
 * await is exactly what left the signup button spinning in production:
 * an abort timer, a status check, and a shape check on the payload.
 */
export async function rpc(name, args = {}, { timeoutMs = RPC_TIMEOUT_MS } = {}) {
    const base = supabaseUrl();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!base || !key) {
        const err = new Error('The verification store is not configured on this deployment.');
        err.code = 'server_misconfigured';
        throw err;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(`${base}/rest/v1/rpc/${name}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: key,
                Authorization: `Bearer ${key}`,
                Prefer: 'return=representation',
            },
            body: JSON.stringify(args),
            signal: controller.signal,
        });

        const text = await res.text();
        const payload = text ? safeJson(text) : null;

        if (!res.ok) {
            const err = new Error(
                payload?.message || `The verification store returned ${res.status}.`
            );
            err.code = payload?.code || `rpc_${res.status}`;
            err.status = res.status;
            throw err;
        }
        if (!payload || typeof payload !== 'object') {
            const err = new Error('The verification store returned an unreadable response.');
            err.code = 'rpc_shape';
            throw err;
        }
        return payload;
    } catch (err) {
        if (err?.name === 'AbortError') {
            const wrapped = new Error('The verification store did not answer in time. Please try again.');
            wrapped.code = 'rpc_timeout';
            throw wrapped;
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

function safeJson(text) {
    try { return JSON.parse(text); } catch { return null; }
}

/** Issue/supersede. Returns the Postgres verdict verbatim (ok/reason/…). */
export function issueOtpChallenge(email, otp) {
    return rpc('auth_otp_issue', {
        p_email: email,
        p_otp_hash: otpDigest(email, otp),
        p_ttl_seconds: OTP_TTL_SECONDS,
        p_cooldown_seconds: RESEND_COOLDOWN_S,
    });
}

/** Verify and burn. The digest is recomputed here, never accepted from the client. */
export function verifyOtpChallenge(email, otp) {
    return rpc('auth_otp_verify', {
        p_email: email,
        p_otp_hash: otpDigest(email, otp),
        p_max_attempts: MAX_ATTEMPTS,
    });
}

/** Best-effort rollback after a failed send; must never throw into the response. */
export async function discardOtpChallenge(email) {
    try {
        await rpc('auth_otp_discard', { p_email: email }, { timeoutMs: 4000 });
        return true;
    } catch {
        return false;   // the row expires on its own; the student retries sooner
    }
}

// ─── Request budget ──────────────────────────────────────────────────────────
/**
 * Per-instance sliding windows. A serverless instance is short-lived and there may
 * be several, so this is a deterrent, not a wall; the durable limits (one live
 * challenge per address, 60 s resend, 3 attempts) are enforced in Postgres.
 */
const buckets = new Map();

function slide(key, max) {
    const now = Date.now();
    const kept = (buckets.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
    if (kept.length >= max) {
        const retryIn = Math.ceil((RATE_WINDOW_MS - (now - kept[0])) / 1000);
        buckets.set(key, kept);
        return retryIn;
    }
    kept.push(now);
    buckets.set(key, kept);
    if (buckets.size > 5000) buckets.clear();   // bound the map on long-lived instances
    return 0;
}

export function clientIp(req) {
    const fwd = req.headers?.['x-forwarded-for'] || req.headers?.['x-real-ip'] || '';
    return String(fwd).split(',')[0].trim() || 'unknown';
}

/** @returns {number} seconds to wait, 0 when allowed. */
export function budgetFor(email, ip, { kind = 'send' } = {}) {
    const emailMax = kind === 'verify' ? MAX_VERIFY_PER_EMAIL : MAX_PER_EMAIL;
    return Math.max(
        slide(`e:${kind}:${email}`, emailMax),
        slide(`i:${kind}:${ip}`, MAX_IP_PER_WINDOW),
    );
}

// ─── Input validation ────────────────────────────────────────────────────────
// One address shape here and in students.email's CHECK, so a value the mail
// provider would reject can never be stored, and vice versa.
const EMAIL_RE = /^[^@\s]{1,64}@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function normalizeEmail(value) {
    const email = String(value ?? '').trim().toLowerCase();
    if (!email || email.length > 320 || !EMAIL_RE.test(email)) return null;
    return email;
}

export function normalizeCode(value) {
    const code = String(value ?? '').trim().replace(/[\s-]/g, '');
    return new RegExp(`^[1-9]\\d{${OTP_LENGTH - 1}}$`).test(code) ? code : null;
}

/** The greeting name is interpolated into the email: sanitise it, cap it. */
export function safeUserName(value) {
    return escapeHtml(
        String(value ?? '')
            // Control characters are what a pasted-or-generated name brings with it;
            // stripping them is the point, so the range is intentional.
            // eslint-disable-next-line no-control-regex
            .replace(/[\u0000-\u001f\u007f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 60),
    ) || 'there';
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
