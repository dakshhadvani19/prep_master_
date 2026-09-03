/**
 * AuthContext.jsx
 *
 * Student authentication for PrepMaster: Firebase Auth (email + OTP-verified
 * signup, Google sign-in) backed by a Firestore profile document.
 *
 * Firestore collection: `students` (doc ID = Firebase Auth UID)
 * {
 *   studentId:     number   // ER: Students.StudentId (auto-increment int)
 *   uid:          string    // Firebase Auth UID
 *   fullName:     string    // ER: Students.FullName
 *   email:        string    // ER: Students.Email (lowercase trimmed)
 *   passwordHash: string|null // ER: Students.Password — salted PBKDF2 digest,
 *                             // never a raw password; Google-only accounts null
 *   isSpam:       boolean   // ER: Students.IsSpam
 *   role:         'student' | 'admin' | 'superAdmin'
 *   provider:     string    ('email' | 'google')
 *   providers:    string[]
 *   createdAt:    string    (ISO)
 *   photoURL:     string|null
 * }
 *
 * Roles are READ from the profile so <ProtectedRoute requiredRole=...> is
 * meaningful. They are never writable by the client — firestore.rules blocks
 * client-side changes to `role`. Admin *authentication* is deliberately not
 * implemented here (owner's instruction); an admin is bootstrapped by setting
 * role='admin' on their own student document in the Firebase console.
 *
 * Google authentication:
 * - Existing login callers may continue using popup through signInWithGoogle().
 * - Student signup uses redirect through startGoogleRedirect().
 * - Signup completes the redirect through completeGoogleRedirect().
 */

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile,
    deleteUser,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    getAdditionalUserInfo,
    sendPasswordResetEmail,
    sendEmailVerification,
    updatePassword,
    reauthenticateWithCredential,
    EmailAuthProvider,
} from 'firebase/auth';

import {
    doc,
    setDoc,
    getDoc,
    updateDoc,
} from 'firebase/firestore';

import { auth, db, firebaseConfigError } from '../firebase';
import { hashPassword, getNextStudentId } from '../utils/hashUtil';

const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
    prompt: 'select_account',
});

const AuthContext = createContext(null);

export function useAuth() {
    return useContext(AuthContext);
}

const ROLE_RANK = { student: 0, admin: 1, superAdmin: 2 };

/**
 * createUserWithEmailAndPassword + a Firestore profile write is not one atomic
 * operation. If the profile write fails after the auth user exists, the address
 * is permanently "in use" with no profile to show for it — the user can neither
 * sign up again nor sign in. So the auth user is deleted to roll the attempt
 * back, and only then is the error surfaced.
 *
 * @param {import('firebase/auth').User} user
 */
async function rollbackOrphanedAuthUser(user) {
    try {
        await deleteUser(user);
        return true;
    } catch {
        // Token may have expired; sign out so the app is not left "logged in".
        try { await signOut(auth); } catch { /* noop */ }
        return false;
    }
}

// ─── Profile writer (shared by signup + lazy repair) ────────────────────────
// Module scope on purpose: it touches no React state, so it cannot capture a
// stale render and is reusable from anywhere in the auth flow.
async function buildStudentProfile(user, { fullName, password, provider }) {
    const cleanEmail = String(user.email || '').trim().toLowerCase();
    const cleanName  = String(fullName || '').trim()
        || (cleanEmail ? cleanEmail.split('@')[0] : 'Student');

    const [studentId, passwordHash] = await Promise.all([
        getNextStudentId(),
        password ? hashPassword(password) : Promise.resolve(null),
    ]);

    const studentDoc = {
        studentId,
        uid: user.uid,
        fullName: cleanName,
        email: cleanEmail,
        passwordHash,
        isSpam: false,
        role: 'student',
        provider,
        providers: [provider],
        createdAt: new Date().toISOString(),
        photoURL: user.photoURL || null,
    };

    await setDoc(doc(db, 'students', user.uid), studentDoc);
    return studentDoc;
}

/**
 * Rebuilds a profile for an authenticated user who has none — the residue of an
 * interrupted signup, or a Google account returning before its profile saved.
 */
async function createMissingProfile(user) {
    const provider = user.providerData?.some(p => p.providerId === 'google.com')
        ? 'google'
        : 'email';

    return buildStudentProfile(user, {
        fullName: user.displayName,
        password: null,
        provider,
    });
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [studentData, setStudentData] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [profileError, setProfileError] = useState('');

    // ─── Load student profile from Firestore ─────────────────────────────────
    const loadStudentProfile = useCallback(async (user) => {
        if (!user) {
            setStudentData(null);
            setProfileError('');
            return null;
        }

        try {
            const snap = await getDoc(doc(db, 'students', user.uid));

            if (snap.exists()) {
                setStudentData(snap.data());
                setProfileError('');
                return snap.data();
            }

            // Authenticated but profile-less: this is the residue of an
            // interrupted signup (or a Google user returning before their
            // profile was saved). Rebuild it so the account is usable instead
            // of stranding the user on a blank dashboard.
            const rebuilt = await createMissingProfile(user);
            setStudentData(rebuilt);
            return rebuilt;
        } catch (err) {
            // Do not silently pretend the profile is absent: surface the real
            // cause, since permission-denied almost always means the deployed
            // firestore.rules are out of date.
            setStudentData(null);
            setProfileError(
                err?.code === 'permission-denied'
                    ? 'Your account profile is blocked by the database security rules. Deploy firestore.rules.'
                    : 'Could not load your profile. Please refresh and try again.'
            );
            return null;
        }
    }, []);

    // ─── Email / Password Sign-Up (called AFTER the OTP is verified) ─────────
    const signupWithEmail = useCallback(async (email, password, displayName) => {
        const cleanEmail = String(email).trim().toLowerCase();
        const cleanName  = String(displayName || '').trim();

        let user;
        try {
                ({ user } = await createUserWithEmailAndPassword(auth, cleanEmail, password));
        } catch (err) {
            throw normaliseAuthError(err);
        }

        try {
            if (cleanName) {
                await updateProfile(user, { displayName: cleanName });
            }
            const studentDoc = await buildStudentProfile(user, {
                fullName: cleanName,
                password,
                provider: 'email',
            });

            setStudentData(studentDoc);
            return user;
        } catch (err) {
            const rolledBack = await rollbackOrphanedAuthUser(user);
            if (err?.code === 'permission-denied') {
                throw new Error(
                    'Your account could not be saved because the database rules are '
                    + 'blocking it. Deploy firestore.rules to your Firebase project.'
                );
            }
            throw new Error(
                rolledBack
                    ? 'We could not finish creating your account. Please try again.'
                    : 'Your account was created but could not be saved. Please sign out and try again.'
            );
        }
    }, []);

    // ─── Email / Password Login ─────────────────────────────────────────────
    const login = useCallback(async (email, password) => {
        try {
            return await signInWithEmailAndPassword(
                auth,
                String(email).trim().toLowerCase(),
                password
            );
        } catch (err) {
            throw normaliseAuthError(err);
        }
    }, []);

    // ─── Existing Google Login (popup) ───────────────────────────────────────
    // Kept for backward compatibility with callers that expect a popup.
    const signInWithGoogle = useCallback(async () => {
        try {
            const result = await signInWithPopup(auth, googleProvider);
            const user = result.user;

            const snap = await getDoc(doc(db, 'students', user.uid));

            if (!snap.exists()) {
                return { user, isNewUser: true };
            }

            setStudentData(snap.data());
            return { user, isNewUser: false };
        } catch (err) {
            throw normaliseAuthError(err);
        }
    }, []);

    // ─── Complete Google Profile (first-time Google users) ──────────────────
    const completeGoogleProfile = useCallback(async (user, displayName, password = null) => {
        /*
         * Idempotency guard:
         * If the profile already exists, do not allocate another studentId.
         */
        const existingSnap = await getDoc(doc(db, 'students', user.uid));

        if (existingSnap.exists()) {
            setStudentData(existingSnap.data());
            return user;
        }

        const resolvedName =
            (displayName && displayName.trim())
                ? displayName.trim()
                : (user.email ? user.email.split('@')[0] : 'Student');

        if (resolvedName && user.displayName !== resolvedName) {
            await updateProfile(user, { displayName: resolvedName });
        }

        try {
            const studentDoc = await buildStudentProfile(user, {
                fullName: resolvedName,
                password,
                provider: 'google',
            });
            setStudentData(studentDoc);
            return user;
        } catch (err) {
            if (err?.code === 'permission-denied') {
                throw new Error(
                    'Your Google sign-in worked, but the database rules blocked saving '
                    + 'your profile. Deploy firestore.rules to your Firebase project.'
                );
            }
            throw err;
        }
    }, []);

    // ─── Google Signup: start redirect ───────────────────────────────────────
    const startGoogleRedirect = useCallback(() => {
        return signInWithRedirect(auth, googleProvider);
    }, []);

    // ─── Google Signup: finish redirect ──────────────────────────────────────
    const completeGoogleRedirect = useCallback(async () => {
        const result = await getRedirectResult(auth);

        if (!result?.user) {
            return null;
        }

        const user = result.user;

        /*
         * getAdditionalUserInfo() gives Firebase's provider-level new-user
         * signal. Firestore is also checked because PrepMaster requires a
         * student profile before the dashboard flow is considered complete.
         */
        const additionalInfo = getAdditionalUserInfo(result);
        const profileSnap = await getDoc(doc(db, 'students', user.uid));

        let isNewUser = additionalInfo?.isNewUser === true;

        // Fallback if provider metadata is unavailable after redirect.
        if (!additionalInfo) {
            isNewUser = !profileSnap.exists();
        }

        // Never allocate a second PrepMaster student record.
        if (isNewUser && profileSnap.exists()) {
            isNewUser = false;
        }

        if (isNewUser) {
            await completeGoogleProfile(
                user,
                user.displayName || user.email || 'Student'
            );
        } else if (profileSnap.exists()) {
            setStudentData(profileSnap.data());
        }

        return { user, isNewUser };
    }, [completeGoogleProfile]);

    // ─── Password Reset ──────────────────────────────────────────────────────
    const sendPasswordReset = useCallback(async (email) => {
        try {
            await sendPasswordResetEmail(auth, String(email).trim().toLowerCase());
            return true;
        } catch (err) {
            throw normaliseAuthError(err);
        }
    }, []);

    /**
     * Password change for a signed-in email account. Google-only accounts have
     * no Firebase password yet, in which case this links one (step-up).
     */
    const changePassword = useCallback(async (currentPassword, newPassword) => {
        const user = auth.currentUser;
        if (!user) throw new Error('You are not signed in.');

        const email = String(user.email || '').trim().toLowerCase();

        if (user.providerData?.some(p => p.providerId === 'password') && currentPassword) {
            try {
                await reauthenticateWithCredential(
                    user,
                    EmailAuthProvider.credential(email, currentPassword)
                );
            } catch (err) {
                throw normaliseAuthError(err);
            }
        }

        try {
            await updatePassword(user, newPassword);
            const passwordHash = await hashPassword(newPassword);
            await updateDoc(doc(db, 'students', user.uid), {
                passwordHash,
                passwordUpdatedAt: new Date().toISOString(),
            });
            return true;
        } catch (err) {
            throw normaliseAuthError(err);
        }
    }, []);

    const resendVerificationEmail = useCallback(async () => {
        const user = auth.currentUser;
        if (!user) throw new Error('You are not signed in.');
        await sendEmailVerification(user);
        return true;
    }, []);

    const refreshStudentProfile = useCallback(async () => {
        return loadStudentProfile(auth.currentUser);
    }, [loadStudentProfile]);

    // ─── Sign Out ─────────────────────────────────────────────────────────────
    const logout = useCallback(async () => {
        localStorage.removeItem('userExamHistory');
        try { sessionStorage.removeItem('prepmaster_google_signup_pending'); } catch { /* noop */ }
        setStudentData(null);
        await signOut(auth);
    }, []);

    // ─── Auth State Observer ──────────────────────────────────────────────────
    useEffect(() => {
        if (firebaseConfigError) {
            // No Firebase project: resolve the loader instead of leaving the
            // whole SPA hanging on a spinner with no explanation.
            setAuthLoading(false);
            setProfileError(firebaseConfigError);
            return undefined;
        }

        const unsubscribe = onAuthStateChanged(
            auth,
            async (user) => {
                setCurrentUser(user);
                try {
                    await loadStudentProfile(user);
                } finally {
                    // Never leave the app locked behind the splash screen.
                    setAuthLoading(false);
                }
            }
        );

        return unsubscribe;
    }, [loadStudentProfile]);

    // ─── Roles (RBAC) ─────────────────────────────────────────────────────────
    const role = studentData?.role ?? 'student';

    const value = useMemo(() => ({
        currentUser,
        studentData,
        authLoading,
        profileError,

        role,
        isAdmin: ROLE_RANK[role] >= ROLE_RANK.admin,
        isSuperAdmin: role === 'superAdmin',
        /** hasRole('admin') => admin or above; hasRole('superAdmin') => exact. */
        hasRole: (required) =>
            !required
            || (required === 'superAdmin'
                ? role === 'superAdmin'
                : ROLE_RANK[role] >= ROLE_RANK[required]),

        // Auth methods
        login,
        logout,
        signupWithEmail,

        // Existing popup Google login
        signInWithGoogle,

        // Redirect Google signup
        startGoogleRedirect,
        completeGoogleRedirect,

        // Google profile creation
        completeGoogleProfile,

        sendPasswordReset,
        changePassword,
        resendVerificationEmail,
        refreshStudentProfile,
    }), [
        currentUser, studentData, authLoading, profileError, role,
        login, logout, signupWithEmail, signInWithGoogle, startGoogleRedirect,
        completeGoogleRedirect, completeGoogleProfile, sendPasswordReset,
        changePassword, resendVerificationEmail, refreshStudentProfile,
    ]);

    // Legacy alias retained for any caller still using `signup`.
    value.signup = signupWithEmail;
    // checkEmailExists is intentionally gone: a client-side existence lookup
    // needs a public read on `students`, which is an account-enumeration leak.
    // Firebase's own auth/email-already-in-use error is surfaced instead.
    value.checkEmailExists = async () => {
        throw new Error('Email availability is reported by Firebase at signup.');
    };

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

/**
 * Maps Firebase error codes to user-facing copy. Never forwards a raw
 * Firebase/internal message to the UI.
 */
function normaliseAuthError(err) {
    const code = err?.code || '';
    const friendly = new Map([
        ['auth/invalid-email', 'That email address is not valid.'],
        ['auth/user-not-found', 'No account found with this email.'],
        ['auth/wrong-password', 'Incorrect password. Please try again.'],
        ['auth/invalid-credential', 'Incorrect email or password.'],
        ['auth/email-already-in-use', 'An account with this email already exists. Try logging in instead.'],
        ['auth/weak-password', 'Please choose a stronger password.'],
        ['auth/too-many-requests', 'Too many attempts. Please wait a moment and try again.'],
        ['auth/network-request-failed', 'Connection issue. Check your internet and try again.'],
        ['auth/popup-blocked', 'Pop-up was blocked. Please allow pop-ups for this site.'],
        ['auth/popup-closed-by-user', 'Sign-in was cancelled.'],
        ['auth/cancelled-popup-request', 'Sign-in was cancelled.'],
        ['auth/account-exists-with-different-credential', 'An account already exists for this email using a different sign-in method.'],
        ['auth/requires-recent-login', 'For your security, please log in again before changing your password.'],
        ['auth/operation-not-allowed', 'This sign-in method is disabled. Enable it in the Firebase console.'],
        ['auth/configuration-not-found', 'Firebase Auth is not configured for this project.'],
        ['auth/unauthorized-domain', 'This domain is not authorised in the Firebase console.'],
        ['auth/permission-denied', 'The database rules blocked this action.'],
    ]);

    const message = friendly.get(code)
        || (/Firebase|firestore|\[/.test(err?.message || '')
            ? 'Something went wrong. Please try again.'
            : err?.message || 'Something went wrong. Please try again.');

    const out = new Error(message);
    out.code = code;
    return out;
}
