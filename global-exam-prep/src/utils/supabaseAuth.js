/**
 * supabaseAuth.js — every Supabase Auth call the app makes, in one place.
 *
 * Kept as pure functions that take the client, so AuthContext stays readable and
 * the tests can drive the real code paths with a stub client.
 *
 * Hard rules this module enforces:
 *  - It never writes `public.students` from the browser. The `on_auth_user_created`
 *    trigger owns profile creation (and RLS grants no INSERT to `authenticated`).
 *  - It never sends `role`, `is_spam`, `student_id` or `auth_uid` anywhere. Signup
 *    metadata is limited to `full_name`.
 *  - It never handles or compares passwords: the credential lives only in Supabase
 *    Auth (`auth.users.encrypted_password`), which this module cannot read. The
 *    password is forwarded to `auth.signUp`/`updateUser` and nowhere else — in
 *    particular never to the OTP mailer, and never stored or logged.
 *  - It does NOT deliver the signup one-time code and must not start to: signup is
 *    gated by the existing Nodemailer/Gmail flow in `src/utils/otpService.js`
 *    (`/api/send-otp`). `auth.verifyOtp()` is never called for signup, and
 *    `auth.resend({ type: 'signup' })` is kept only for the separate "account
 *    exists but is unconfirmed" case the Log in tab offers.
 *  - It never surfaces a raw server message to the UI.
 */

// The signup code is issued by src/utils/otpService.js. These are the *display*
// values the OTP screen counts down and must stay equal to that module's
// OTP_TTL_MS / RESEND_COOLDOWN, or the countdown would lie about the real code.
export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 600;
export const RESEND_COOLDOWN = 60;

/**
 * Only for `resendSignupCode` below: the Supabase verification mail for an account
 * that already exists but was never confirmed (reachable from the Log in tab).
 * Not part of the signup OTP flow, which never asks Supabase to mail anything.
 */
export const SIGNUP_OTP_TYPE = 'signup';

// One regex, used for both the copy and the flag, so they cannot drift apart.
const RATE_LIMITED = /rate ?limit|too many requests|over_.*_rate_limit|only request this after/;

const FRIENDLY = [
    [/email not confirmed|could not confirm your email/, 'Please verify your email before signing in.'],
    [/already registered|already exists|user_already_exists/, 'This email is already registered. Try logging in instead.'],
    [/invalid login credentials|invalid credentials/, 'Incorrect email or password. Please try again.'],
    [/email confirmed.*already|already confirmed/, 'This email address is already verified.'],
    [/token has expired|expired|otp_expired/, 'That code has expired. Request a new one.'],
    [/invalid token|token_not_found|otp_expired|verification failed/, 'That code is invalid. Check the digits and try again.'],
    [RATE_LIMITED, 'Too many attempts. Please wait a minute and try again.'],
    [/password.*(at least|too short|weak)/, 'Please choose a stronger password (Supabase requires at least 6 characters).'],
    [/email (address )?is invalid|invalid email/, 'That email address is not valid.'],
    [/signup .*not (allowed|enabled)|signups? are not allowed/, 'Sign-ups are disabled for this project.'],
    [/provider .*not enabled|oauth provider/, 'Google sign-in is not enabled on the Supabase project yet.'],
    [/reauthenticat/, 'For your security, please sign in again before changing your password.'],
    [/network|failed to fetch|fetch failed|timeout/, 'Connection issue. Check your internet and try again.'],
    [/redirect.*not allowed|redirect uri/, 'This site URL is not in the Supabase redirect allow-list.'],
];

/**
 * Supabase errors arrive as `{ message, code?, status? }` with human-readable but
 * sometimes internal text. Translate them once, here, and hang the flags the UI
 * branches on off the resulting Error.
 */
export function normalizeAuthError(err) {
    const code = String(err?.code || err?.error_code || err?.status || '').toLowerCase();
    const raw = String(err?.message || err?.error_description || '').trim();
    const hay = `${code} ${raw}`.toLowerCase();

    const match = FRIENDLY.find(([re]) => re.test(hay));

    // Anything that still looks like an internal message (driver names, stack
    // fragments, JSON) is replaced; only short human sentences reach the UI.
    const INTERNAL = /supabase|postgrest|authapi|constraint|database|[{[]/i;
    let message = raw;
    if (match) message = match[1];
    else if (!raw || INTERNAL.test(raw)) message = 'Something went wrong. Please try again.';

    const out = new Error(message);
    out.code = code || 'auth/error';
    out.emailExists = /already registered|already exists|user_already_exists/.test(hay);
    out.needsVerification = /email not confirmed|could not confirm your email/.test(hay);
    out.expired = /expired/.test(hay);
    out.rateLimited = RATE_LIMITED.test(hay);
    return out;
}

const cleanEmail = (email) => String(email || '').trim().toLowerCase();

/**
 * Creates the Supabase Auth account for a student whose emailed code has just been
 * verified by `verifyOTP()` in src/utils/otpService.js. Ordering is the whole point:
 * nothing in this file can mint an auth.users row before that verification, so an
 * unverified address never leaves a half-created account behind.
 *
 * Whether the caller gets a session back is decided by the project's
 * "Confirm email" toggle, not by the client: with it OFF (the setting this flow
 * needs — our own OTP already proved the address) Supabase returns a session and
 * the student is signed in immediately, and no second verification mail is sent.
 * With it ON there is no session, so `needs_verification` is reported instead of
 * pretending success or retrying.
 */
export async function createAuthUserAfterOtp(client, { email, password, fullName }) {
    const { data, error } = await client.auth.signUp({
        email: cleanEmail(email),
        password: String(password || ''),
        // Only the display name travels. No role, no is_spam, no ids: the DB
        // trigger fixes those, and the client must not get to suggest them.
        options: {
            data: { full_name: String(fullName || '').trim().slice(0, 100) },
        },
    });

    if (error) {
        const norm = normalizeAuthError(error);
        if (norm.emailExists) return { status: 'email_exists', message: norm.message };
        throw norm;
    }

    const user = data?.user ?? null;

    // Anti-enumeration shape: user returned but not linked to this credential.
    // Reported as the same neutral "already registered?" hint, never as a
    // definitive existence answer, and no account is created a second time.
    if (!user) return { status: 'email_exists', message: 'This email is already registered. Try logging in instead.' };
    if (Array.isArray(user.identities) && user.identities.length === 0) {
        return { status: 'email_exists', message: 'This email is already registered. Try logging in instead.' };
    }

    if (data?.session) return { status: 'signed_in', user, session: data.session };

    const err = new Error(
        'Account created, but this Supabase project still confirms email addresses itself. '
        + 'Confirm the address from that email, or turn "Confirm email" off (AUTH.md §9) so '
        + 'the code we already sent is the only gate.'
    );
    err.needsSupabaseConfirmation = true;
    throw err;
}

/**
 * Re-send the *Supabase* verification mail for an existing, unconfirmed account.
 * Only the Log in tab uses this; the signup OTP is resent by otpService.
 */
export async function resendSignupCode(client, email) {
    const { error } = await client.auth.resend({ type: SIGNUP_OTP_TYPE, email: cleanEmail(email) });
    if (error) throw normalizeAuthError(error);
    return true;
}

export async function loginWithPassword(client, { email, password }) {
    const { data, error } = await client.auth.signInWithPassword({
        email: cleanEmail(email),
        password: String(password || ''),
    });
    if (error) throw normalizeAuthError(error);
    return data?.session ?? null;
}

export async function logout(client) {
    if (!client) return true;
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw normalizeAuthError(error);
    return true;
}

/** Password reset: emails a recovery link that returns to `redirectTo`. */
export async function sendPasswordReset(client, { email, redirectTo }) {
    const options = redirectTo ? { redirectTo } : {};
    const { error } = await client.auth.resetPasswordForEmail(cleanEmail(email), options);
    if (error) throw normalizeAuthError(error);
    return true;
}

/**
 * Completes a password reset from inside the app: the recovery link lands on the
 * site URL, detectSessionInUrl exchanges the code, onAuthStateChange reports
 * PASSWORD_RECOVERY, and this writes the new password on that short-lived session.
 */
export async function completePasswordRecovery(client, newPassword) {
    const password = String(newPassword || '');
    if (password.length < 6) {
        throw new Error('Please choose a stronger password (at least 6 characters).');
    }
    const { error } = await client.auth.updateUser({ password });
    if (error) throw normalizeAuthError(error);
    return true;
}

/** Password change for a signed-in account. Supabase verifies the session itself. */
export async function changePassword(client, newPassword) {
    return completePasswordRecovery(client, newPassword);
}

/** Starts the Google redirect. Returns nothing useful: the browser leaves. */
export async function startGoogleOAuth(client, { redirectTo } = {}) {
    const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: redirectTo ? { redirectTo } : {},
    });
    if (error) throw normalizeAuthError(error);
    if (!data?.url) throw new Error('Google sign-in could not be started. Please try again.');
    if (typeof window !== 'undefined') window.location.assign(data.url);
    return data.url;
}

/**
 * A cancelled or failed OAuth round-trip comes back as
 * `?error_code=access_denied&error_description=…` (or in the hash). Supabase clears
 * the session, so without this the user just sees the login page again.
 */
export function readOAuthErrorFromUrl(href) {
    if (!href) return null;
    const [beforeHash, hash = ''] = String(href).split('#');
    let code = '';
    let description = '';

    for (const part of [beforeHash.split('?')[1] || '', hash.split('?')[1] || hash]) {
        if (!part) continue;
        const params = new URLSearchParams(part);
        code ||= params.get('error_code') || params.get('error') || '';
        description ||= params.get('error_description') || '';
    }

    if (!code && !description) return null;
    if (/access_denied|cancelled|user closed/i.test(`${code} ${description}`)) {
        return { cancelled: true, message: 'Google sign-in was cancelled.' };
    }
    return { cancelled: false, message: 'Google sign-in did not complete. Please try again.' };
}

/** True when the URL still carries a code Supabase has not exchanged yet. */
export function hasPendingAuthCode(href) {
    if (!href) return false;
    return /[?&#]code=/.test(String(href));
}

/**
 * Reads the signed-in student's own profile. RLS decides what comes back; a
 * rejected read is reported as such rather than as "no profile".
 */
export async function fetchStudentProfile(client, authUid) {
    if (!client || !authUid) return { row: null, error: null };

    const { data, error } = await client
        .from('students')
        .select('student_id, auth_uid, full_name, email, is_spam, role, created_at')
        .eq('auth_uid', authUid)
        .maybeSingle();

    if (error) {
        const norm = normalizeAuthError(error);
        // PostgREST reports an RLS/privilege rejection as a permission error.
        norm.isProfileBlocked = /permission denied|42501|row-level security/.test(
            `${error.code || ''} ${error.message || ''}`.toLowerCase()
        );
        throw norm;
    }
    return { row: data ?? null, error: null };
}

/** The one write a student is allowed: their own display name. */
export async function updateStudentFullName(client, authUid, fullName) {
    const clean = String(fullName || '').trim().slice(0, 100);
    if (!clean) throw new Error('Please enter your full name.');

    const { error } = await client
        .from('students')
        .update({ full_name: clean })
        .eq('auth_uid', authUid);

    if (error) throw normalizeAuthError(error);
    return clean;
}

/**
 * Maps the Phase-1 row to the shape the rest of the app already consumed
 * (camelCase, plus `uid`), so no dashboard/exam file needed changing.
 * `provider`/`photoURL` are read from the auth user, never stored in public.students.
 */
export function mapStudentProfile(row, user) {
    if (!row && !user) return null;
    const provider = user?.app_metadata?.provider === 'google' ? 'google' : 'email';
    return {
        studentId: row?.student_id ?? null,
        uid: row?.auth_uid ?? user?.id ?? null,
        fullName: row?.full_name ?? user?.user_metadata?.full_name ?? '',
        email: row?.email ?? cleanEmail(user?.email),
        isSpam: row?.is_spam ?? false,
        role: row?.role ?? 'student',
        provider,
        providers: [provider],
        createdAt: row?.created_at ?? user?.created_at ?? null,
        photoURL: user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture ?? null,
    };
}
