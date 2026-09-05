/**
 * supabase.js — the browser Supabase client, used for STUDENT AUTHENTICATION ONLY.
 *
 * Scope (deliberate): Supabase owns auth + the `public.students` profile. It does
 * NOT own Firestore data, exams, syllabus, dashboard data, analytics, feedback,
 * storage or exam history — those still go through `src/firebase.js`.
 *
 * Credentials come from Vite env vars and are never hardcoded here:
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_PUBLISHABLE_KEY
 *
 * Both are public-by-design values: RLS is the enforcement layer, so whatever a
 * browser can do is bounded by the policies, not by the key. A *secret* key
 * (sb_secret_… / the service_role key) must never appear in a VITE_* variable —
 * it is refused below rather than silently used, because a bundled secret is a
 * full database bypass.
 */
import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const rawKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const PLACEHOLDER_URL = /your-project|localhost:54321|supabase\.co\/project/i;

/**
 * A public credential is either the new `sb_publishable_…` format or a legacy
 * anon JWT. A service_role/secret credential is either `sb_secret_…` or a JWT
 * whose payload says `"role":"service_role"`. Decoding the payload is not a
 * secret check — the payload of a JWT is base64url text anyone can read — it is
 * a guard against pasting the wrong box.
 */
function isPrivateCredential(value) {
    const key = String(value || '');
    if (!key) return false;
    if (/^sb_secret[_-]/i.test(key)) return true;

    const parts = key.split('.');
    if (parts.length === 3) {
        try {
            const payload = JSON.parse(
                atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
            );
            if (payload?.role && payload.role !== 'anon') return true;
        } catch {
            /* not a JWT we can read — fall through to the prefix verdict */
        }
    }
    return false;
}

// ─── OAuth / recovery callback: captured HERE, before anything else can ─────────
//
// A Supabase redirect lands on `?code=…&state=…` (or, for a rejection,
// `?error_code=…`). That code can be exchanged exactly once, and whoever holds it
// must be the only consumer. Two consumers is what broke Google sign-in in
// production: the SDK's own `detectSessionInUrl` parses and *strips* those params
// during its async bootstrap, while this app's routing (react-router, the auth
// guards, the return-leg effect in Signup.jsx) is already reading and rewriting the
// same URL. Whichever of them won the tick decided whether the student got signed
// in — and when the SDK lost, the page fell through to a generic
// "Google sign-in did not complete" that hid the real reason.
//
// So the params are read synchronously at module evaluation, which happens before
// React mounts and before any navigation can rewrite the address bar, and
// `detectSessionInUrl` is turned off below. The exchange then happens in one place
// (AuthContext), where its error can be reported to the student instead of the
// console.
const CALLBACK_PARAMS = [
    'code', 'state', 'type',
    'error', 'error_code', 'error_description',
    'access_token', 'refresh_token', 'expires_in', 'token_type',
    'provider_token', 'id_token',
];

function readCallbackParams() {
    if (typeof window === 'undefined' || !window.location) return null;

    const query = new URLSearchParams(window.location.search || '');
    const hash = String(window.location.hash || '').replace(/^#/, '');
    const hashQuery = new URLSearchParams(hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : hash);
    const read = (key) => query.get(key) || hashQuery.get(key) || '';

    const found = {};
    for (const key of CALLBACK_PARAMS) {
        const value = read(key);
        if (value) found[key] = value;
    }

    const hasCode = Boolean(found.code);
    const hasFailure = Boolean(found.error || found.error_code || found.error_description);
    const hasTokens = Boolean(found.access_token);
    if (!hasCode && !hasFailure && !hasTokens) return null;

    return {
        kind: hasCode ? 'code' : hasTokens ? 'implicit' : 'error',
        code: found.code || '',
        state: found.state || '',
        // `type=recovery` is how a password-reset link announces itself; the same
        // one-time code path serves it, so the flag has to survive the capture.
        type: found.type || '',
        errorCode: found.error_code || found.error || '',
        errorDescription: (found.error_description || '').replace(/\+/g, ' '),
        raw: window.location.href,
    };
}

function scrubCallbackFromUrl() {
    if (typeof window === 'undefined' || !window.history?.replaceState) return;
    try {
        const url = new URL(window.location.href);
        for (const key of CALLBACK_PARAMS) url.searchParams.delete(key);
        const search = url.searchParams.toString();
        window.history.replaceState({}, '', `${url.pathname}${search ? `?${search}` : ''}`);
    } catch {
        // A browser that will not let us rewrite the address bar is not worth
        // failing sign-in over: the params stay, and the exchange is still the
        // only consumer of them in this tab.
    }
}

let pendingCallback = readCallbackParams();
if (pendingCallback) scrubCallbackFromUrl();

/**
 * The callback this page load arrived on, or null. Read once via
 * `consumeAuthCallback()` so a remount, a StrictMode double-effect or a stray
 * re-render can never exchange the same code twice.
 */
export function consumeAuthCallback() {
    const value = pendingCallback;
    pendingCallback = null;
    return value;
}

/** Peek, without consuming: used to refuse starting a *new* OAuth flow mid-callback. */
export function peekAuthCallback() {
    return pendingCallback;
}

/**
 * True while an OAuth/recovery code is waiting to be exchanged. Any code path that
 * would start a fresh flow must check this first: a second `signInWithOAuth`
 * overwrites the PKCE code verifier in storage, which is precisely how a valid,
 * still-unexchanged code becomes "Unable to exchange external code".
 */
export function hasPendingAuthCallback() {
    return Boolean(pendingCallback && pendingCallback.kind !== 'error');
}

/**
 * Non-null when this build has no usable Supabase project. AuthContext reads it
 * so the UI can explain the problem instead of hanging on a loader (same job
 * `firebaseConfigError` does for Firestore).
 */
export const supabaseConfigError = (() => {
    if (!rawUrl || !rawKey) {
        return 'Supabase is not configured for this deployment. Set VITE_SUPABASE_URL '
             + 'and VITE_SUPABASE_PUBLISHABLE_KEY (see .env.example) and redeploy.';
    }
    if (PLACEHOLDER_URL.test(String(rawUrl))) {
        return 'VITE_SUPABASE_URL still contains a placeholder value. Set it to your '
             + 'project URL (https://<project-ref>.supabase.co) and redeploy.';
    }
    if (isPrivateCredential(rawKey)) {
        return 'VITE_SUPABASE_PUBLISHABLE_KEY contains a SECRET/service-role credential, '
             + 'which must never be shipped to a browser. Replace it with the publishable '
             + '(anon) key. Rotate the exposed key in the Supabase dashboard.';
    }
    return null;
})();

/**
 * The client, or null when unconfigured. Every caller must tolerate null — that
 * is what keeps a misconfigured preview build importable instead of crashing the
 * whole bundle at module-evaluation time.
 */
export const supabase = supabaseConfigError
    ? null
    : createClient(String(rawUrl).replace(/\/+$/, ''), String(rawKey), {
          auth: {
              // Restore the session from storage on load, keep the access token
              // fresh, and use PKCE so the OAuth/recovery code exchange happens
              // in this browser without a client secret.
              persistSession: true,
              autoRefreshToken: true,
              flowType: 'pkce',
              // Deliberately OFF: see the capture above. The one-time code in the
              // URL is exchanged once, by AuthContext, which can then report the
              // actual reason to the student. With this left on, the SDK and the
              // app race to consume the same code and the loser wins the UI.
              detectSessionInUrl: false,
              // Namespaced so a Firebase-era localStorage key can never collide.
              storageKey: 'prepmaster-supabase-auth',
          },
      });
      // Password recovery gets its own PKCE storage namespace.
// This prevents a Google OAuth verifier from colliding with a password-reset
// verifier when both flows are used in the same browser.
export const recoverySupabase = supabaseConfigError
    ? null
    : createClient(String(rawUrl).replace(/\/+$/, ''), String(rawKey), {
          auth: {
              persistSession: true,
              autoRefreshToken: true,
              flowType: 'pkce',
              detectSessionInUrl: false,
              storageKey: 'prepmaster-supabase-recovery',
          },
      });

/** Throws a readable error instead of a `null.foo` TypeError deep in a handler. */
export function requireSupabase() {
    if (!supabase) throw new Error(supabaseConfigError || 'Supabase is not available.');
    return supabase;
}

export default supabase;
