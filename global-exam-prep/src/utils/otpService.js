/**
 * otpService.js — the browser's side of signup verification.
 *
 * It is deliberately small now. The whole point of moving the challenge from
 * Firestore to Postgres (supabase/migrations/20260905120000_auth_otp.sql, reached
 * through /api/send-otp and /api/verify-otp) is that the client:
 *
 *   - does not generate the code,
 *   - does not hold a digest, a nonce, or a document id,
 *   - does not connect to the database that stores any of it,
 *   - and cannot influence any of it.
 *
 * What stays is the part only the browser can own, and it is the part that used to
 * hang production: every request is bounded, abortable, de-duplicated, and ends in
 * either a value or a thrown, user-facing message. An unsettled promise here once
 * meant a spinner that never stopped, because `Signup.jsx` clears its loading state
 * in a `finally` that only runs when this function settles.
 *
 * The password never appears in this file. It is held in AuthContext's memory and
 * goes only to `supabase.auth.signUp`, after `verifyOTP` resolves.
 */

// Fallback display values, used only if the API does not answer with its own. The
// server is authoritative (it enforces them), and returns expiresIn/resendAfter.
const OTP_TTL_MS       = 600_000;
const RESEND_COOLDOWN  = 60;          // seconds
const MAX_ATTEMPTS     = 3;

const SEND_TIMEOUT_MS   = 25_000;     // cold start + SMTP handshake
const VERIFY_TIMEOUT_MS = 15_000;
const RETRY_AFTER_CAP   = 900;        // never show a countdown longer than the TTL

/** One request per address in flight, for either step. */
const inFlight = new Map();

/**
 * POSTs JSON and returns `{ status, body }`, bounded by `timeoutMs`.
 *
 * The timeout aborts the actual request (AbortController), which is the difference
 * between this and the code it replaced: a hung serverless call used to be a hung
 * UI. `extra` lets the caller add nothing else — there is no header, credential or
 * cookie in this request, so an attacker-influenced value cannot be smuggled in.
 */
async function postJson(path, payload, timeoutMs) {
    if (typeof fetch !== 'function') {
        throw new Error('This browser cannot reach the verification service.');
    }

    const controller = new AbortController();
    const TIMEOUT = Symbol('deadline');
    let timer;

    // The deadline races the request itself rather than only aborting it. Aborting is
    // what a real browser needs to release the socket, but `signal` is a courtesy the
    // transport can decline (a polyfill, a proxy that holds the connection open) — and
    // a client that waits on a courtesy is precisely how "Create Account" hung.
    const deadline = new Promise((resolve) => {
        timer = setTimeout(() => {
            try { controller.abort(); } catch { /* already settled */ }
            resolve(TIMEOUT);
        }, timeoutMs);
    });

    try {
        const attempt = (async () => {
            const res = await fetch(path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal,
                // A verification response must never be served from a cache, and no
                // credentials belong on it.
                cache: 'no-store',
                credentials: 'omit',
            });

            // The body is read inside the bounded operation too: a response that
            // arrives and then stalls mid-download is the same bug wearing a hat.
            const text = await res.text().catch(() => '');
            let body = null;
            if (text) {
                try { body = JSON.parse(text); } catch { body = null; }
            }
            return { status: res.status, ok: res.ok, body: body || {} };
        })();

        const outcome = await Promise.race([attempt, deadline]);
        if (outcome === TIMEOUT) {
            // Leave the orphaned attempt on the floor on purpose: nothing awaits it,
            // and singleFlight's finally still clears the key when it lands.
            throw new Error('The verification service took too long to answer. Please try again.');
        }
        return outcome;
    } catch (err) {
        if (err?.message?.includes?.('too long to answer')) throw err;
        if (err?.name === 'AbortError') {
            throw new Error('The verification service took too long to answer. Please try again.');
        }
        // TypeError('Failed to fetch') is the offline / DNS / blocked-request case.
        throw new Error('We could not reach the verification service. Check your connection and try again.');
    } finally {
        clearTimeout(timer);
    }
}

/** Shared wrapper that turns "same address, second click" into a join, not a retry. */
function singleFlight(kind, email, work) {
    const key = `${kind}:${email}`;
    const running = inFlight.get(key);
    if (running) return running;

    const attempt = work().finally(() => {
        if (inFlight.get(key) === attempt) inFlight.delete(key);
    });
    inFlight.set(key, attempt);
    return attempt;
}

/**
 * A server `error` string is written for students, and the API is built so that it
 * only ever emits such strings. This filter is the second line, not the first: a
 * deployment that puts a proxy, a WAF, or a raw PostgREST failure in front of the
 * endpoint must still not be able to print a table name on the signup card.
 */
const LOOKS_INTERNAL = /supabase|postgrest|nodemailer|smtp|relation .*does not exist|constraint|violat|sqlstate|permission denied|function |[{[]|<\s*\/?\s*[a-z]|\b\d{5}\b|\bat [A-Z]\w+[.]\w+/i;

function userMessage(body, fallback) {
    const msg = typeof body?.error === 'string' ? body.error.trim() : '';
    if (!msg || msg.length > 300 || LOOKS_INTERNAL.test(msg)) return fallback;
    return msg;
}

function clampWait(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.min(Math.ceil(n), RETRY_AFTER_CAP);
}

/**
 * Step 1. Asks the server for a code and reports when the student may ask again.
 *
 * @returns {Promise<{sentAt:number, resendAfter:number, expiresAt:number, expiresInMs:number}>}
 * @throws {Error} a message safe to render
 */
export async function createAndSendOTP(email, userName) {
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
        throw new Error('Please enter a valid email address.');
    }

    // A double click used to mail two codes. Now the second caller joins the first
    // request, and the server would in any case refuse a second challenge for the
    // same address inside the cooldown window.
    return singleFlight('send', cleanEmail, async () => {
        const { status, ok, body } = await postJson(
            '/api/send-otp',
            // Exactly these two fields. Never the password, never a client-chosen
            // code — the server generates and stores it.
            { email: cleanEmail, userName: String(userName || '').trim().slice(0, 60) },
            SEND_TIMEOUT_MS,
        );

        if (!ok) {
            const wait = clampWait(body.retry_after_seconds, RESEND_COOLDOWN);
            if (status === 429) {
                throw new Error(userMessage(body, `Please wait ${wait}s before requesting another code.`));
            }
            throw new Error(userMessage(
                body,
                status >= 500
                    ? 'We could not send the code right now. Please try again.'
                    : 'We could not verify that email address. Please check it and try again.',
            ));
        }

        const resendAfter = clampWait(body.resendAfter, RESEND_COOLDOWN);
        const expiresInMs = Math.min(Math.max(Number(body.expiresIn) || OTP_TTL_MS / 1000, 60), RETRY_AFTER_CAP) * 1000;
        const sentAt = Date.now();
        const expiresAt = Number(Date.parse(body.expiresAt || '')) || sentAt + expiresInMs;

        return { sentAt, resendAfter, expiresAt, expiresInMs };
    });
}

/**
 * Step 2. Sends the typed code to the server; a resolve means "verified, and the
 * challenge is gone". Only then may the caller create the Supabase account.
 *
 * @returns {Promise<string>} the normalised email that was verified
 * @throws {Error} a message safe to render
 */
export async function verifyOTP(email, submittedOTP) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const code = String(submittedOTP || '').trim().replace(/[\s-]/g, '');

    if (!/^[1-9]\d{5}$/.test(code)) {
        const err = new Error('Enter the 6-digit code from the email.');
        err.retryable = true;
        throw err;
    }

    // Verifying twice with the same code would burn the attempt ceiling in
    // Postgres; two submits in one tick must be one request.
    return singleFlight('verify', cleanEmail, async () => {
        const { status, ok, body } = await postJson(
            '/api/verify-otp',
            { email: cleanEmail, code },
            VERIFY_TIMEOUT_MS,
        );

        if (ok && body?.verified) return cleanEmail;

        // Reasons the UI branches on. `resendAllowed` unlocks the resend button so
        // an expired code is never a dead end.
        const err = new Error(userMessage(
            body,
            status === 429
                ? 'Too many incorrect attempts. Please request a new code.'
                : 'We could not check your code just now. Please try again.',
        ));
        err.reason = body?.reason || (status >= 500 ? 'store_unavailable' : 'invalid');
        err.remaining = Number(body?.remaining) || 0;
        err.resendAllowed = Boolean(body?.resendAllowed) || err.reason === 'expired' || err.reason === 'locked';
        err.retryable = err.reason !== 'store_unavailable';
        throw err;
    });
}

/** Pure helper for the resend button's countdown. */
export function resendCooldownRemaining(msSinceSent) {
    return Math.max(0, Math.ceil(msSinceSent < 0 ? 0 : (RESEND_COOLDOWN * 1000 - msSinceSent) / 1000));
}

export { OTP_TTL_MS, MAX_ATTEMPTS, RESEND_COOLDOWN };
