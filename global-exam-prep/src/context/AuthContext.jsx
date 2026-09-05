/**
 * AuthContext.jsx
 *
 * Student authentication for PrepMaster: **Supabase Auth** (email + password, and
 * Google OAuth via PKCE) backed by the `public.students` row that the database
 * creates.
 *
 * Signup verification order (deadline-critical, so it is stated at the top):
 *   details -> /api/send-otp (Nodemailer/Gmail, src/utils/otpService.js)
 *           -> 6-digit code verified against the Firestore `otp_tokens` digest
 *           -> ONLY then supabase.auth.signUp() -> session -> trigger profile
 * Supabase never mails a signup code and `auth.verifyOtp` is never called here:
 * the custom OTP is the gate, so an unverified address never creates an account.
 *
 * public.students (Phase-1 schema, SRS Table 1.1)
 * {
 *   student_id:  bigint       // Students.StudentId, identity PK
 *   auth_uid:    uuid         // -> auth.users(id) ON DELETE CASCADE
 *   full_name:   varchar(100) // Students.FullName
 *   email:       varchar(320) // Students.Email, lowercase
 *   is_spam:     boolean      // Students.IsSpam
 *   role:        'student' | 'admin' | 'superAdmin'
 *   created_at:  timestamptz
 * }
 * Students.Password is NOT a column: the credential lives only in Supabase Auth
 * (auth.users.encrypted_password) and is never readable from this app.
 *
 * Division of labour, on purpose:
 *  - Supabase = student auth, student session, student profile.
 *  - Firebase = Firestore data (exams, syllabus, dashboard, analytics, feedback,
 *    storage, exam history). Those files keep importing `src/firebase.js`.
 *
 * What this context does NOT do:
 *  - It never inserts `public.students`. `handle_new_user()` (an AFTER INSERT
 *    trigger on auth.users) owns profile creation, so a signup can never leave a
 *    half-written profile, and RLS grants no INSERT to `authenticated` anyway.
 *  - It never accepts role/is_spam/student_id/auth_uid from the client. `role`
 *    is read from the row purely for routing decisions; it is not authoritative
 *    for anything the client is allowed to do — RLS is.
 *  - It does not pretend to be Firebase Auth. `currentUser` keeps the field names
 *    the existing pages read (uid/email/displayName/photoURL) so they did not have
 *    to change, and carries `authProvider: 'supabase'`. Anything that needs a real
 *    Firebase credential (Firestore `request.auth`, exam history, storage) does
 *    not get one — see AUTH.md "Identity bridge".
 *
 * Google authentication: redirect only (no popup), because PKCE completes in the
 * return leg. `startGoogleRedirect()` sends the browser out; the session lands via
 * `detectSessionInUrl` + onAuthStateChange, not via a "get redirect result" call.
 */

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import { supabase, supabaseConfigError } from '../supabase';
import {
    changePassword as sbChangePassword,
    completePasswordRecovery as sbCompleteRecovery,
    fetchStudentProfile,
    loginWithPassword,
    logout as sbLogout,
    mapStudentProfile,
    normalizeAuthError,
    readOAuthErrorFromUrl,
    resendSignupCode as sbResendCode,
    sendPasswordReset as sbSendReset,
    startGoogleOAuth,
    updateStudentFullName,
    createAuthUserAfterOtp,
} from '../utils/supabaseAuth';
// The existing secure OTP implementation: issues the code through /api/send-otp
// (Nodemailer + Gmail) and verifies it against the SHA-256 digest stored in the
// Firestore `otp_tokens` collection. Reused as-is; deliberately not rewritten.
import { createAndSendOTP, verifyOTP } from '../utils/otpService';

const AuthContext = createContext(null);

export function useAuth() {
    return useContext(AuthContext);
}

const ROLE_RANK = { student: 0, admin: 1, superAdmin: 2 };

/**
 * A deliberately small, Supabase-derived view of the signed-in user, using the
 * property names the rest of the app already reads. Not a Firebase `User`: there
 * is no `getIdToken()` here, and nothing that needs one should use this.
 */
function toCurrentUser(user) {
    if (!user) return null;
    const meta = user.user_metadata || {};
    const email = user.email ?? null;
    return {
        uid: user.id,
        id: user.id,
        email,
        displayName: meta.full_name || meta.name || (email ? email.split('@')[0] : null),
        photoURL: meta.avatar_url || meta.picture || null,
        emailVerified: Boolean(user.email_confirmed_at),
        isAnonymous: Boolean(user.is_anonymous),
        providerData: (user.identities || []).map((identity) => ({
            providerId: identity.provider,
            uid: identity.identity_id ?? user.id,
        })),
        metadata: { creationTime: user.created_at, lastSignInTime: user.last_sign_in_at },
        authProvider: 'supabase',
    };
}

export function AuthProvider({ children }) {
    const [session, setSession] = useState(null);
    const [supabaseUser, setSupabaseUser] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [studentData, setStudentData] = useState(null);
    // A build with no Supabase project has no session to wait for: start settled,
    // so the SPA never flashes a splash screen it cannot leave.
    const [authLoading, setAuthLoading] = useState(() => Boolean(supabase));
    const [profileError, setProfileError] = useState(() => (supabase
    ? ''
    // Known at module load: surface it on the first paint instead of after an
    // effect, so a misconfigured build never flashes a blank card.
    : (supabaseConfigError || 'Supabase is not configured for this build.')));
    const [recoveryMode, setRecoveryMode] = useState(false);

    // One profile read per user id, however many auth events arrive. TOKEN_REFRESHED
    // fires hourly; refetching on every one of those is how a refresh race with the
    // post-redirect effects gets invented.
    const loadedForRef = useRef(null);
    const settledRef = useRef(false);

    const markSettled = useCallback(() => {
        if (!settledRef.current) {
            settledRef.current = true;
            setAuthLoading(false);
        }
    }, []);

    // ─── Student profile (public.students, via RLS) ──────────────────────────
    const loadStudentProfile = useCallback(async (user) => {
        if (!user) {
            loadedForRef.current = null;
            setStudentData(null);
            setProfileError('');
            return null;
        }

        try {
            const { row } = await fetchStudentProfile(supabase, user.id);

            if (row) {
                const profile = mapStudentProfile(row, user);
                setStudentData(profile);
                setProfileError('');
                return profile;
            }

            // No row for a real session: the signup trigger did not run (or the
            // Phase-1 SQL is not deployed). The client must NOT paper over this by
            // inserting its own profile — that path is what RLS exists to close.
            setStudentData(null);
            setProfileError(
                'Your student profile is missing. The auth.users -> students trigger '
                + 'did not create it, so an operator needs to check the Supabase '
                + 'SQL migration before this account can be used.'
            );
            return null;
        } catch (err) {
            loadedForRef.current = null;
            setStudentData(null);
            setProfileError(
                err?.isProfileBlocked
                    ? 'Your profile is blocked by the database security policies. Enable RLS on public.students and apply the Phase-1 policies.'
                    : 'Could not load your profile. Please refresh and try again.'
            );
            return null;
        }
    }, []);

    // ─── Session plumbing ────────────────────────────────────────────────────
    useEffect(() => {
        if (!supabase) return undefined;   // nothing to subscribe to; see authLoading init

        let cancelled = false;

        const apply = async (event, nextSession) => {
            if (cancelled) return;

            if (event === 'SIGNED_OUT') {
                setSession(null);
                setSupabaseUser(null);
                setCurrentUser(null);
                setStudentData(null);
                setProfileError('');
                loadedForRef.current = null;
                markSettled();
                return;
            }

            const user = nextSession?.user ?? null;
            setSession(nextSession ?? null);
            setSupabaseUser(user);
            setCurrentUser(toCurrentUser(user));

            if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
            // A completed sign-in ends any recovery mode; functional form keeps
            // this callback free of a stale `recoveryMode` dependency.
            if (event === 'SIGNED_IN') setRecoveryMode((prev) => (prev ? false : prev));

            if (user && loadedForRef.current !== user.id) {
                loadedForRef.current = user.id;
                await loadStudentProfile(user);
            }

            markSettled();
        };

        const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
            // Supabase warns against awaiting auth calls inside this callback; the
            // profile read is a PostgREST read, and it is fire-and-forget either way.
            void apply(event, nextSession);
        });

        // INITIAL_SESSION is not guaranteed on every adapter, so read it directly
        // too. Whichever arrives first wins; the other is a no-op by uid.
        supabase.auth.getSession()
            .then(({ data }) => apply('INITIAL_SESSION', data?.session ?? null))
            .catch(() => markSettled());

        // A cold, offline, or misrouted auth request must never strand the app on
        // the splash screen forever.
        const failsafe = setTimeout(markSettled, 8000);

        return () => {
            cancelled = true;
            clearTimeout(failsafe);
            sub?.subscription?.unsubscribe?.();
        };
    }, [loadStudentProfile, markSettled]);

    // ─── Sign up: custom OTP first, Supabase account second ──────────────────
    /**
     * The two steps share one in-memory record: step 1 mails the code, step 2
     * verifies it and then creates the account. The password lives only here, in
     * this tab's memory, for exactly as long as the OTP screen is open — it is
     * never sent to /api/send-otp, never written to Firestore, and dropped as soon
     * as the code has been consumed (or the student goes back).
     */
    const pendingSignupRef = useRef(null);
    // In-flight signUp promise, so a double submit cannot create two accounts.
    const signupAttemptRef = useRef(null);

    /** Step 1: ask the existing Gmail/Nodemailer path for a code. No Supabase call. */
    const requestSignup = useCallback(async (email, password, displayName) => {
        const cleanEmail = String(email || '').trim().toLowerCase();
        const fullName = String(displayName || '').trim();

        // Deliberately no supabase.auth.* here: the account must not exist before
        // the code is verified.
        const info = await createAndSendOTP(cleanEmail, fullName);
        pendingSignupRef.current = {
            email: cleanEmail,
            password: String(password || ''),
            fullName,
        };
        return { status: 'otp_sent', ...info };
    }, []);

    /** Resend: the same Nodemailer path. otpService supersedes the old code and
     *  enforces the 60 s cooldown, which is also what the UI counts down. */
    const resendSignupOtp = useCallback(async (email) => {
        const pending = pendingSignupRef.current;
        const target = String(email || pending?.email || '').trim().toLowerCase();
        // A new code supersedes the old one inside otpService, so the pending
        // record needs no change: the password it holds is still the right one.
        const info = await createAndSendOTP(target, pending?.fullName);
        return { status: 'otp_sent', ...info };
    }, []);

    /**
     * Step 2. `verifyOTP` throws for a wrong, expired, over-attempt or missing code
     * and consumes it on success (single use); Supabase is only reached after that,
     * exactly once, with `full_name` as its only metadata. The profile row is the
     * trigger's job — there is no client-side insert and no rollback to write.
     */
    const verifySignupOtp = useCallback(async (email, token) => {
        if (!supabase) throw new Error(supabaseConfigError || 'Supabase is not available.');

        const pending = pendingSignupRef.current;
        const target = String(email || pending?.email || '').trim().toLowerCase();
        if (!pending || pending.email !== target) {
            throw new Error('Your signup session expired. Please enter your details again.');
        }

        // 1. the gate — throws before anything is created
        await verifyOTP(target, token);

        // 2. The challenge is spent. The credentials leave memory at once and the
        //    one in-flight attempt is shared, so a double submit cannot create two
        //    accounts (requirement: signUp is called exactly once per verified code).
        if (!signupAttemptRef.current) {
            const { password, fullName } = pending;
            signupAttemptRef.current = (async () => {
                try {
                    const created = await createAuthUserAfterOtp(supabase, { email: target, password, fullName });
                    // Terminal either way (account created, or it already exists):
                    // the password leaves memory as soon as it has been used. A
                    // *failed* request keeps the pending record, so the student can
                    // resend a code and retry — the spent code can never be replayed.
                    pendingSignupRef.current = null;
                    return created;
                } finally {
                    signupAttemptRef.current = null;
                }
            })();
        }

        const result = await signupAttemptRef.current;

        if (result.status === 'email_exists') {
            // Same neutral signal Supabase gives (an identity-less user); no second
            // account is attempted and no existence verdict is implied.
            return { status: 'email_exists', message: result.message };
        }

        const { user, session: nextSession } = result;
        // onAuthStateChange normally lands first; this covers the tick where it has
        // not, so the success overlay and the redirect see one consistent state.
        if (user && loadedForRef.current !== user.id) {
            loadedForRef.current = user.id;
            setSession(nextSession ?? null);
            setSupabaseUser(user);
            setCurrentUser(toCurrentUser(user));
            await loadStudentProfile(user);
        }
        markSettled();
        return { status: result.status };
    }, [loadStudentProfile, markSettled]);

    /** Back out of the OTP screen without leaving a password or a live challenge
     *  around: the code itself is superseded the next time one is requested. */
    const cancelSignupOtp = useCallback(() => {
        pendingSignupRef.current = null;
    }, []);

    /** The Log in tab's "my address is not confirmed" escape hatch. This is the one
     *  place Supabase is asked to mail anything, and it is not the signup OTP. */
    const resendSupabaseVerification = useCallback(async (email) => {
        if (!supabase) throw new Error(supabaseConfigError || 'Supabase is not available.');
        return sbResendCode(supabase, email || supabaseUser?.email);
    }, [supabaseUser]);

    /** Kept so an old call site fails loudly instead of silently mailing a code and
     *  stopping. The flow is requestSignup() -> verifySignupOtp(). */
    const signupWithEmail = useCallback(async () => {
        throw new Error(
            'signupWithEmail is no longer one call: request the code with requestSignup() '
            + 'and create the account with verifySignupOtp().'
        );
    }, []);

    // ─── Log in / out ────────────────────────────────────────────────────────
    const login = useCallback(async (email, password) => {
        if (!supabase) throw new Error(supabaseConfigError || 'Supabase is not available.');
        try {
            const nextSession = await loginWithPassword(supabase, { email, password });
            return { user: nextSession?.user ?? null, session: nextSession };
        } catch (err) {
            throw err?.code ? err : normalizeAuthError(err);
        }
    }, []);

    const logout = useCallback(async () => {
        // Exam history cache lives in localStorage; clearing it on logout is the
        // existing behaviour and stays here (the data itself is still Firestore's).
        try { localStorage.removeItem('userExamHistory'); } catch { /* noop */ }
        try { sessionStorage.removeItem('prepmaster_google_signup_pending'); } catch { /* noop */ }

        loadedForRef.current = null;
        setStudentData(null);
        setCurrentUser(null);
        setSupabaseUser(null);
        setSession(null);
        setProfileError('');

        if (!supabase) return;
        await sbLogout(supabase);
    }, []);

    // ─── Google (redirect + PKCE) ────────────────────────────────────────────
    /**
     * @param {'login'|'signup'} [mode] which auth tab to come back to. It decides
     * nothing about the account (the trigger created the profile either way and a
     * returning Google student is signed in regardless), but a student who cancels
     * consent should land back on the tab they left, not on Log in.
     */
    const startGoogleRedirect = useCallback((mode) => {
        if (!supabase) throw new Error(supabaseConfigError || 'Supabase is not available.');
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const tab = mode === 'signup' ? 'signup' : 'login';
        // Must match a Supabase redirect allow-list entry (`<origin>/**`).
        const redirectTo = origin ? `${origin}/signup?mode=${tab}` : undefined;
        return startGoogleOAuth(supabase, { redirectTo });
    }, []);

    /** Redirect-only now: `signInWithGoogle` is the same flow, kept for callers. */
    const signInWithGoogle = useCallback(async () => {
        await startGoogleRedirect('login');
        return null;
    }, [startGoogleRedirect]);

    /**
     * The return leg is handled by `detectSessionInUrl` + onAuthStateChange, so
     * there is no "getRedirectResult" step any more. Kept as a no-op shape for any
     * caller that still awaits it, and it reports a URL-level OAuth failure
     * (cancelled consent) which is otherwise silent.
     */
    const completeGoogleRedirect = useCallback(async () => {
        const problem = readOAuthErrorFromUrl(
            typeof window !== 'undefined' ? window.location.href : ''
        );
        if (problem) throw normalizeAuthError(new Error(problem.message));
        const current = await supabase?.auth?.getSession?.() ?? null;
        return current?.data?.session ? { user: current.data.session.user } : null;
    }, []);

    // ─── Password reset / change ─────────────────────────────────────────────
    const sendPasswordReset = useCallback(async (email) => {
        if (!supabase) throw new Error(supabaseConfigError || 'Supabase is not available.');
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        return sbSendReset(supabase, {
            email,
            redirectTo: origin ? `${origin}/signup?mode=login` : undefined,
        });
    }, []);

    /** Writes a new password on the short-lived PASSWORD_RECOVERY session. */
    const completePasswordRecovery = useCallback(async (newPassword) => {
        if (!supabase) throw new Error(supabaseConfigError || 'Supabase is not available.');
        await sbCompleteRecovery(supabase, newPassword);
        setRecoveryMode(false);
        try {
            const { data } = await supabase.auth.getUser();
            if (data?.user) await loadStudentProfile(data.user);
        } catch { /* the session may have ended by design */ }
        return true;
    }, [loadStudentProfile]);

    /**
     * Password change for a signed-in account. There is no current-password check
     * here on purpose: the client cannot and must not verify a credential it
     * cannot read. If the project enables "require reauthentication", Supabase
     * rejects the call and the mapped message asks the student to sign in again.
     */
    const changePassword = useCallback(async (newPassword) => {
        if (!supabase) throw new Error(supabaseConfigError || 'Supabase is not available.');
        return sbChangePassword(supabase, newPassword);
    }, []);

    // ─── Profile helpers ──────────────────────────────────────────────────────
    const refreshStudentProfile = useCallback(async () => {
        if (!supabase) return null;
        const { data } = await supabase.auth.getUser();
        if (!data?.user) return null;
        setSupabaseUser(data.user);
        setCurrentUser(toCurrentUser(data.user));
        loadedForRef.current = data.user.id;
        return loadStudentProfile(data.user);
    }, [loadStudentProfile]);

    const updateFullName = useCallback(async (fullName) => {
        if (!supabase || !supabaseUser) throw new Error('You are not signed in.');
        const clean = await updateStudentFullName(supabase, supabaseUser.id, fullName);
        setStudentData((prev) => (prev ? { ...prev, fullName: clean } : prev));
        return clean;
    }, [supabaseUser]);

    /**
     * Profile creation moved into the database. Anything that used to "complete" a
     * Google profile now just re-reads it; the trigger has already made it.
     */
    const completeGoogleProfile = useCallback(async () => refreshStudentProfile(), [refreshStudentProfile]);

    const needsEmailVerification = Boolean(currentUser) && !currentUser.emailVerified;

    // ─── Roles (RBAC) ─────────────────────────────────────────────────────────
    const role = studentData?.role ?? 'student';

    const value = useMemo(() => ({
        authProvider: 'supabase',
        currentUser,
        supabaseUser,
        session,
        studentData,
        studentId: studentData?.studentId ?? null,
        authLoading,
        profileError,
        recoveryMode,
        needsEmailVerification,

        role,
        isAdmin: ROLE_RANK[role] >= ROLE_RANK.admin,
        isSuperAdmin: role === 'superAdmin',
        /** hasRole('admin') => admin or above; hasRole('superAdmin') => exact. */
        hasRole: (required) =>
            !required
            || (required === 'superAdmin'
                ? role === 'superAdmin'
                : ROLE_RANK[role] >= ROLE_RANK[required]),

        // Student auth surface
        requestSignup,
        signupWithEmail,
        verifySignupOtp,
        resendSignupOtp,
        cancelSignupOtp,
        resendSupabaseVerification,
        login,
        logout,
        startGoogleRedirect,
        signInWithGoogle,
        completeGoogleRedirect,
        completeGoogleProfile,
        sendPasswordReset,
        completePasswordRecovery,
        changePassword,
        refreshStudentProfile,
        updateFullName,
        clearRecoveryMode: () => setRecoveryMode(false),

        // Legacy aliases, so no caller has to change in this same step:
        //   signup                 -> throws (see signupWithEmail); signup is two steps now
        //   resendVerificationEmail-> resendSupabaseVerification (Log in tab only)
        //   checkEmailExists       -> stays unavailable on purpose; answering it from
        //                             the client would need a public read on students,
        //                             which is an account-enumeration oracle.
        signup: signupWithEmail,
        resendVerificationEmail: resendSupabaseVerification,
        checkEmailExists: async () => {
            throw new Error('Email availability is reported by Supabase Auth at signup.');
        },
    }), [
        currentUser, supabaseUser, session, studentData, authLoading, profileError,
        recoveryMode, needsEmailVerification, role, requestSignup, signupWithEmail,
        verifySignupOtp, resendSignupOtp, cancelSignupOtp, resendSupabaseVerification,
        login, logout, startGoogleRedirect,
        signInWithGoogle, completeGoogleRedirect, completeGoogleProfile,
        sendPasswordReset, completePasswordRecovery, changePassword,
        refreshStudentProfile, updateFullName,
    ]);

    return (
        <AuthContext.Provider value={value}>
            {authLoading ? (
                <div
                    style={{
                        minHeight: '100vh',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'var(--bg-primary, #0f1115)',
                        color: '#e5e7eb',
                        fontFamily: 'inherit',
                        padding: '2rem',
                        textAlign: 'center',
                    }}
                >
                    <style>{`
                        @keyframes spin {
                            to { transform: rotate(360deg); }
                        }
                    `}</style>

                    <div
                        style={{
                            width: 40,
                            height: 40,
                            border: '3px solid rgba(255,255,255,0.1)',
                            borderTopColor: 'var(--accent-primary, #3b82f6)',
                            borderRadius: '50%',
                            animation: 'spin 0.8s linear infinite',
                        }}
                    />

                    {profileError && (
                        <p style={{ margin: 0, color: '#fca5a5', fontSize: 14, lineHeight: 1.6, maxWidth: 420 }}>
                            {profileError}
                        </p>
                    )}
                </div>
            ) : (
                children
            )}
        </AuthContext.Provider>
    );
}
