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
              // Consumes ?code=… (PKCE callback, Google return leg, password
              // recovery link) on page load and fires onAuthStateChange.
              detectSessionInUrl: true,
              // Namespaced so a Firebase-era localStorage key can never collide.
              storageKey: 'prepmaster-supabase-auth',
          },
      });

/** Throws a readable error instead of a `null.foo` TypeError deep in a handler. */
export function requireSupabase() {
    if (!supabase) throw new Error(supabaseConfigError || 'Supabase is not available.');
    return supabase;
}

export default supabase;
