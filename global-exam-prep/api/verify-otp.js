import {
    MAX_ATTEMPTS,
    budgetFor,
    clientIp,
    missingConfig,
    normalizeCode,
    normalizeEmail,
    verifyOtpChallenge,
} from './_otpStore.js';

/**
 * POST /api/verify-otp — check the 6-digit code the student typed.
 *
 * Verification moved server-side with the Firestore -> Postgres move: the browser
 * sends `{ email, code }` and nothing else. The digest is recomputed here from the
 * pepper, compared inside `auth_otp_verify`, and a match burns the row in the same
 * statement — so a code is single-use no matter how many tabs present it, and the
 * attempt ceiling cannot be raced.
 *
 * What the response deliberately does NOT do:
 *   - It never says whether an address has a pending challenge. A missing row and a
 *     wrong code are reported identically, otherwise this endpoint becomes an
 *     "is this email signing up right now?" oracle.
 *   - It never returns the stored code, a digest, or a fragment of either.
 *
 * The caller creates the Supabase account only after a 200 here (see
 * src/context/AuthContext.jsx), which is what keeps an unverified address from ever
 * producing an auth.users row.
 */
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // `password` is not read, even though the caller has it in memory: verifying a
    // code proves control of the mailbox, nothing more.
    const { email, code } = req.body || {};

    const cleanEmail = normalizeEmail(email);
    const cleanCode = normalizeCode(code);
    if (!cleanEmail || !cleanCode) {
        return res.status(400).json({
            verified: false,
            reason: 'invalid',
            error: 'Enter the 6-digit code from the email.',
            remaining: MAX_ATTEMPTS,
        });
    }

    const missing = missingConfig();
    if (missing.length) {
        return res.status(500).json({
            verified: false,
            reason: 'unconfigured',
            error: `Verification is unavailable on this deployment (missing ${missing.join(', ')}).`,
        });
    }

    // Guessing is bounded twice: 3 tries per challenge in Postgres, and this window
    // per address/IP so a spray across many addresses is also throttled.
    const ip = clientIp(req);
    const limited = budgetFor(cleanEmail, ip, { kind: 'verify' });
    if (limited) {
        return res.status(429).json({
            verified: false,
            reason: 'rate_limited',
            error: `Too many attempts. Try again in ${limited}s.`,
            retry_after_seconds: limited,
        });
    }

    let result;
    try {
        result = await verifyOtpChallenge(cleanEmail, cleanCode);
    } catch (err) {
        console.error('[verify-otp] store error:', err?.code || err?.message);
        // A store that will not answer must not be reported as "wrong code": the
        // student would give up on a perfectly good challenge.
        return res.status(502).json({
            verified: false,
            reason: 'store_unavailable',
            error: 'We could not check your code just now. Please try again.',
        });
    }

    if (result?.ok) return res.status(200).json({ verified: true });

    switch (result?.reason) {
        case 'expired':
            return res.status(400).json({
                verified: false,
                reason: 'expired',
                error: 'Your code has expired. Request a new one.',
                resendAllowed: true,
            });
        case 'locked':
            return res.status(429).json({
                verified: false,
                reason: 'locked',
                error: 'Too many incorrect attempts. Please request a new code.',
                resendAllowed: true,
            });
        default: {
            const remaining = Number(result?.remaining) || 0;
            return res.status(400).json({
                verified: false,
                reason: 'invalid',
                error: remaining > 0
                    ? `That code is not right. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`
                    : 'That code is not right. Please request a new code.',
                remaining,
            });
        }
    }
}
