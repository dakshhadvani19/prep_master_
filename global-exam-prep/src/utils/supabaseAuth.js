/**
 * supabaseAuth.js — every Supabase Auth call the app makes, in one place.
 *
 * Kept as pure functions that take the client, so AuthContext stays readable and
 * the tests can drive the real code paths with a stub client.
 *
 * Hard rules this module enforces:
 *  - It never writes `public."Students"` from the browser. The `on_auth_user_created`
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
 *  - Admin status is resolved ONLY from public."Admins" keyed by the authenticated
 *    uid (see resolveAuthorization/deriveRole at the bottom). Nothing in this module
 *    reads a password, an email-to-role table, or a client-side flag to decide it.
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
 * site URL, the auth callback is handled by the app, and this writes the new
 * password on that short-lived session.
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

/**
 * Starts the Google redirect.
 *
 * `skipBrowserRedirect: true` matters: by default the SDK assigns `location.href`
 * itself *and* returns the URL, so a caller that also navigates fires the
 * navigation twice — two `/authorize` calls, two PKCE flow rows, and whichever
 * code comes back may not match the verifier this tab stored. We ask for the URL,
 * then leave exactly once.
 */
export async function startGoogleOAuth(client, { redirectTo, shouldStart } = {}) {
    if (!client) throw new Error('Supabase is not available on this deployment.');
    if (shouldStart && !shouldStart()) {
        throw new Error('Another sign-in is already finishing in this tab. Please wait for it.');
    }

    const options = { skipBrowserRedirect: true };
    if (redirectTo) options.redirectTo = redirectTo;

    const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options,
    });
    if (error) throw normalizeAuthError(error);
    if (!data?.url) throw new Error('Google sign-in could not be started. Please try again.');
    if (typeof window !== 'undefined') window.location.assign(data.url);
    return data.url;
}

// ─── The return leg: one owner, real reasons ─────────────────────────────────

const EXCHANGE_FRIENDLY = [
    [/flow_state_not_found|invalid flow state/, 'The Google sign-in request expired before it could be finished. Please try again.'],
    [/bad_verifier|unable to exchange external code|code verifier/, 'This browser\'s sign-in state no longer matches the request — usually a second sign-in started, or another tab finished it. Please try again in one tab.'],
    [/code.*already|already (been )?used|invalid grant/, 'That sign-in link has already been used on this page. Please try again.'],
    [/otp_expired|expired/, 'The sign-in link expired. Please try again.'],
    [/over_request_limit|rate ?limit|too many requests/, 'Too many sign-in attempts. Please wait a minute and try again.'],
    [/provider .*not enabled|oauth provider/, 'Google sign-in is not enabled on the Supabase project yet.'],
    [/redirect.*not allowed|redirect uri/, 'This site URL is not in the Supabase redirect allow-list.'],
    [/network|failed to fetch|fetch failed|timeout|aborted/, 'Connection issue while finishing sign-in. Check your internet and try again.'],
];

function safeDetail(text) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean || clean.length > 90) return '';
    if (!/^[A-Za-z0-9 .,:;'\-_()]+$/.test(clean)) return '';
    if (/supabase|postgrest|GoTrue|constraint|[{[]/i.test(clean)) return '';
    return clean;
}

export function describeAuthExchangeError(err) {
    const code = String(err?.code || err?.error_code || '').toLowerCase();
    const raw = String(err?.message || err?.error_description || err?.msg || '').trim();
    const hay = `${code} ${raw}`.toLowerCase();
    const match = EXCHANGE_FRIENDLY.find(([re]) => re.test(hay));
    const detail = safeDetail(raw);

    const out = new Error(match ? match[1] : (detail
        ? `Google sign-in did not complete: ${detail}. Please try again.`
        : 'Google sign-in did not complete. Please try again.'));
    out.code = code || 'auth/exchange_failed';
    out.retryable = true;
    return out;
}

export function describeAuthCallback(callback) {
    if (!callback) return null;
    if (callback.kind === 'code') {
        return { kind: 'code', code: callback.code, type: callback.type || '' };
    }
    const hay = `${callback.errorCode || ''} ${callback.errorDescription || ''}`.toLowerCase();
    if (!hay.trim()) {
        return { kind: 'error', cancelled: false, message: 'Sign-in returned nothing usable. Please try again.' };
    }
    if (/access_denied|user_cancelled|cancelled|denied/.test(hay)) {
        return { kind: 'error', cancelled: true, message: 'Google sign-in was cancelled. Nothing was created — you can try again.' };
    }
    const mapped = normalizeAuthError({ code: callback.errorCode, message: callback.errorDescription });
    const detail = safeDetail(callback.errorDescription)
        || safeDetail(mapped?.message)
        || 'the provider rejected the request';
    return {
        kind: 'error',
        cancelled: false,
        message: `Google sign-in did not complete (${detail}). Please try again.`,
    };
}

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
    return describeAuthCallback({ kind: 'error', errorCode: code, errorDescription: description });
}

export function hasPendingAuthCode(href) {
    if (!href) return false;
    return /[?&#]code=/.test(String(href));
}

const OAUTH_ATTEMPT_KEY     = 'prepmaster_oauth_attempt_v1';
const OAUTH_TAB_FLAG_KEY    = 'prepmaster_google_signup_pending';
const OAUTH_ATTEMPT_TTL_MS  = 15 * 60 * 1000;

function eachStorage(fn) {
    if (typeof window === 'undefined') return;
    for (const store of [window.localStorage, window.sessionStorage]) {
        try { if (store) fn(store); } catch { /* private mode, disabled storage */ }
    }
}

export function rememberOAuthAttempt() {
    const now = Date.now();
    eachStorage((store) => {
        store.setItem(OAUTH_ATTEMPT_KEY, String(now));
        store.setItem(OAUTH_TAB_FLAG_KEY, '1');
    });
}

export function clearOAuthAttempt() {
    eachStorage((store) => {
        store.removeItem(OAUTH_ATTEMPT_KEY);
        store.removeItem(OAUTH_TAB_FLAG_KEY);
    });
}

export function oauthAttemptInFlight(now = Date.now()) {
    if (typeof window === 'undefined') return false;
    for (const store of [window.localStorage, window.sessionStorage]) {
        let raw = null;
        try { raw = store?.getItem(OAUTH_ATTEMPT_KEY) ?? null; } catch { raw = null; }
        const started = Number(raw);
        if (Number.isFinite(started) && started > 0 && now - started <= OAUTH_ATTEMPT_TTL_MS) return true;
    }
    return false;
}

export async function exchangeAuthCode(client, code, { timeoutMs = 12000 } = {}) {
    if (!client) throw new Error('Supabase is not available on this deployment.');
    if (!code) throw new Error('The sign-in link was missing its verification code. Please try again.');

    let timer;
    try {
        const race = await Promise.race([
            Promise.resolve(client.auth.exchangeCodeForSession(String(code))),
            new Promise((_res, rej) => {
                timer = setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'exchange_timeout' })), timeoutMs);
            }),
        ]);

        const { data, error } = race || {};
        if (error) throw describeAuthExchangeError(error);
        const session = data?.session ?? null;
        if (!session) throw describeAuthExchangeError(new Error('no session returned by the exchange'));
        return session;
    } catch (err) {
        if (err?.code === 'exchange_timeout') {
            throw new Error('Finishing sign-in took too long. Please try again.');
        }
        throw err?.code && err.code !== 'auth/error' ? err : describeAuthExchangeError(err);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Reads the signed-in student's own profile. RLS decides what comes back; a
 * rejected read is reported as such rather than as "no profile".
 */
export async function fetchStudentProfile(client, authUid) {
    if (!client || !authUid) return { row: null, error: null };

    const { data, error } = await client
        .from('Students')
        .select('StudentId, auth_uid, FullName, Email, IsSpam, role, created_at')
        .eq('auth_uid', authUid)
        .maybeSingle();

    if (error) {
        const norm = normalizeAuthError(error);
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
        .from('Students')
        .update({ FullName: clean })
        .eq('auth_uid', authUid);

    if (error) throw normalizeAuthError(error);
    return clean;
}

export function mapStudentProfile(row, user) {
    if (!row && !user) return null;
    const provider = user?.app_metadata?.provider === 'google' ? 'google' : 'email';

    // The database now follows the ER naming exactly. The legacy fallbacks are kept
    // only so previously stored test fixtures do not break during this schema rename.
    const studentId = row?.StudentId ?? row?.student_id ?? null;
    const authUid = row?.auth_uid ?? user?.id ?? null;
    const fullName = row?.FullName ?? row?.full_name ?? user?.user_metadata?.full_name ?? '';
    const email = row?.Email ?? row?.email ?? cleanEmail(user?.email);
    const isSpam = row?.IsSpam ?? row?.is_spam ?? false;
    const createdAt = row?.created_at ?? user?.created_at ?? null;

    return {
        studentId,
        uid: authUid,
        fullName,
        email,
        isSpam,
        role: row?.role ?? 'student',
        provider,
        providers: [provider],
        createdAt,
        photoURL: user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture ?? null,
    };
}

// ─── Admin authorization (public."Admins") ───────────────────────────────────
//
// An admin is not a different kind of login. It is the same Supabase Auth user,
// plus a row in public."Admins" whose auth_uid is that user's auth.users id.

export const ADMIN_LOOKUP_FUNCTION = 'admin_role_for_uid';
export const ADMIN_STAFF_FUNCTION = 'manage_admin_staff';

/** Whitelisted on purpose: only what the app may show, never a credential. */
const ADMIN_COLUMNS = 'AdminId, auth_uid, FullName, Email, isSuperAdmin';

export const ADMIN_UID_MISMATCH =
    'The admin-role lookup returned a row for a different account, so it was ignored and this session is treated as a student.';

function normalizeAdminRow(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

    const flag = raw.isSuperAdmin ?? raw.is_super_admin ?? false;

    return {
        adminId: raw.AdminId ?? raw.admin_id ?? null,
        authUid: raw.auth_uid ?? raw.authUid ?? null,
        fullName: raw.FullName ?? raw.full_name ?? '',
        email: cleanEmail(raw.Email ?? raw.email) || '',
        isSuperAdmin: flag === true || flag === 'true' || flag === 1 || flag === 't',
    };
}

function acceptAdminRow(raw, authUid) {
    const row = normalizeAdminRow(raw);
    if (!row) return { row: null, mismatch: false };
    if (String(row.authUid ?? '') !== String(authUid ?? '')) return { row: null, mismatch: true };
    return { row, mismatch: false };
}

function isMissingLookupFunction(error) {
    const hay = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
    return /pgrst202|could not find the function|function .* does not exist|schema does not exist/.test(hay);
}

export async function resolveAuthorization(client, authUid) {
    if (!client || !authUid) return { row: null, error: null, source: 'anonymous' };

    if (typeof client.rpc === 'function') {
        let out = null;
        try {
            out = await client.rpc(ADMIN_LOOKUP_FUNCTION);
        } catch (err) {
            out = { data: null, error: err };
        }
        const { data, error } = out || {};

        if (!error) {
            const accepted = acceptAdminRow(data, authUid);
            return {
                row: accepted.row,
                error: accepted.mismatch ? new Error(ADMIN_UID_MISMATCH) : null,
                source: 'rpc',
            };
        }

        if (!isMissingLookupFunction(error)) {
            return { row: null, error: normalizeAuthError(error), source: 'rpc' };
        }
    }

    try {
        const { data, error } = await client
            .from('Admins')
            .select(ADMIN_COLUMNS)
            .eq('auth_uid', authUid)
            .maybeSingle();

        if (error) return { row: null, error: normalizeAuthError(error), source: 'self-select' };

        const accepted = acceptAdminRow(data, authUid);

        return {
            row: accepted.row,
            error: accepted.mismatch ? new Error(ADMIN_UID_MISMATCH) : null,
            source: 'self-select',
        };
    } catch (err) {
        return { row: null, error: normalizeAuthError(err), source: 'self-select' };
    }
}

/**
 * THE role rule. One function, one place, so no page can grow its own opinion.
 *
 * public."Students".role is deliberately not consulted.
 */
export function deriveRole(adminRow) {
    if (!adminRow) return 'student';
    return adminRow.isSuperAdmin ? 'superAdmin' : 'admin';
}

export async function manageAdminStaff(client, { action, email, fullName } = {}) {
    if (!client || typeof client.rpc !== 'function') {
        throw new Error('Staff management is not available.');
    }

    const act = String(action || '').trim().toLowerCase();
    if (!['add', 'remove', 'add_super'].includes(act)) {
        throw new Error('That staff action is not valid.');
    }

    let out;
    try {
        out = await client.rpc(ADMIN_STAFF_FUNCTION, {
            p_action: act,
            p_email: String(email || '').trim(),
            p_full_name: fullName == null ? null : String(fullName),
        });
    } catch (err) {
        throw normalizeAuthError(err);
    }

    const { data, error } = out || {};

    if (error) {
        const hay = `${error.code || ''} ${error.message || ''}`.toLowerCase();

        if (/42501|not_authorized|permission denied/.test(hay)) {
            throw new Error('Only a Super Admin can change staff.');
        }
        if (/no_auth_user|p0001/.test(hay)) {
            throw new Error('That email has no PrepMaster account yet. They must sign up first.');
        }
        if (/cannot_remove_self/.test(hay)) {
            throw new Error('You cannot remove your own admin row.');
        }
        if (/pgrst202|could not find the function/.test(hay)) {
            throw new Error('Staff write path is not applied on this project yet.');
        }

        throw normalizeAuthError(error);
    }

    return data;
}