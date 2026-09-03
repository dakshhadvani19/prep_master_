/**
 * AuthContext.jsx
 *
 * Student authentication for PrepMaster.
 *
 * Firestore collection: `students` (doc ID = Firebase Auth UID)
 * {
 *   studentId:    number
 *   uid:          string
 *   fullName:     string
 *   email:        string
 *   passwordHash: string | null
 *   isSpam:       boolean
 *   provider:     string   ('email' | 'google')
 *   providers:    string[]
 *   createdAt:    string   (ISO)
 *   photoURL:     string | null
 * }
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
    useState,
} from 'react';

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    getAdditionalUserInfo,
    sendPasswordResetEmail,
} from 'firebase/auth';

import {
    doc,
    setDoc,
    getDoc,
    collection,
    query,
    where,
    getDocs,
} from 'firebase/firestore';

import { auth, db } from '../firebase';
import { hashPassword, getNextStudentId } from '../utils/hashUtil';

const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
    prompt: 'select_account',
});

const AuthContext = createContext();

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [studentData, setStudentData] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);

    // ─── Load student profile from Firestore ─────────────────────────────────
    const loadStudentProfile = useCallback(async (user) => {
        if (!user) {
            setStudentData(null);
            return null;
        }

        try {
            const snap = await getDoc(doc(db, 'students', user.uid));
            const data = snap.exists() ? snap.data() : null;
            setStudentData(data);
            return data;
        } catch {
            setStudentData(null);
            return null;
        }
    }, []);

    // ─── Email / Password Sign-Up (called AFTER OTP is verified) ─────────────
    const signupWithEmail = useCallback(async (email, password, displayName) => {
        const cleanEmail = email.trim().toLowerCase();
        const cleanName = displayName.trim();

        const { user } = await createUserWithEmailAndPassword(
            auth,
            cleanEmail,
            password
        );

        await updateProfile(user, {
            displayName: cleanName,
        });

        const [studentId, passwordHash] = await Promise.all([
            getNextStudentId(),
            hashPassword(password, cleanEmail),
        ]);

        const studentDoc = {
            studentId,
            uid: user.uid,
            fullName: cleanName,
            email: cleanEmail,
            passwordHash,
            isSpam: false,
            provider: 'email',
            providers: ['email'],
            createdAt: new Date().toISOString(),
            photoURL: user.photoURL || null,
        };

        await setDoc(
            doc(db, 'students', user.uid),
            studentDoc
        );

        setStudentData(studentDoc);

        return user;
    }, []);

    // ─── Email / Password Login ─────────────────────────────────────────────
    const login = useCallback((email, password) => {
        return signInWithEmailAndPassword(
            auth,
            email.trim().toLowerCase(),
            password
        );
    }, []);

    // ─── Existing Google Login (popup) ───────────────────────────────────────
    // Kept for backward compatibility with Login.jsx.
    const signInWithGoogle = useCallback(async () => {
        const result = await signInWithPopup(
            auth,
            googleProvider
        );

        const user = result.user;

        const snap = await getDoc(
            doc(db, 'students', user.uid)
        );

        const isNewUser = !snap.exists();

        return {
            user,
            isNewUser,
        };
    }, []);

    // ─── Complete Google Profile (first-time Google users) ──────────────────
    const completeGoogleProfile = useCallback(async (
        user,
        displayName,
        password = null
    ) => {
        const resolvedName =
            (displayName && displayName.trim())
                ? displayName.trim()
                : (user.email
                    ? user.email.split('@')[0]
                    : 'Student');

        /*
         * Idempotency guard:
         * If the profile already exists, do not allocate another studentId.
         */
        const existingSnap = await getDoc(
            doc(db, 'students', user.uid)
        );

        if (existingSnap.exists()) {
            const existingData = existingSnap.data();
            setStudentData(existingData);
            return user;
        }

        await updateProfile(user, {
            displayName: resolvedName,
        });

        const [studentId, passwordHash] = await Promise.all([
            getNextStudentId(),
            password
                ? hashPassword(password, user.email)
                : Promise.resolve(null),
        ]);

        const studentDoc = {
            studentId,
            uid: user.uid,
            fullName: resolvedName,
            email: user.email.trim().toLowerCase(),
            passwordHash,
            isSpam: false,
            provider: 'google',
            providers: ['google'],
            createdAt: new Date().toISOString(),
            photoURL: user.photoURL || null,
        };

        await setDoc(
            doc(db, 'students', user.uid),
            studentDoc
        );

        setStudentData(studentDoc);

        return user;
    }, []);

    // ─── Google Signup: start redirect ───────────────────────────────────────
    const startGoogleRedirect = useCallback(() => {
        return signInWithRedirect(
            auth,
            googleProvider
        );
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
        const profileSnap = await getDoc(
            doc(db, 'students', user.uid)
        );

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

        return {
            user,
            isNewUser,
        };
    }, [completeGoogleProfile]);

    // ─── Check if email is already registered ────────────────────────────────
    const checkEmailExists = useCallback(async (email) => {
        try {
            const q = query(
                collection(db, 'students'),
                where('email', '==', email.trim().toLowerCase())
            );

            const snap = await getDocs(q);

            return !snap.empty;
        } catch {
            return false;
        }
    }, []);

    // ─── Password Reset ──────────────────────────────────────────────────────
    const sendPasswordReset = useCallback((email) => {
        return sendPasswordResetEmail(
            auth,
            email.trim().toLowerCase()
        );
    }, []);

    // ─── Sign Out ─────────────────────────────────────────────────────────────
    const logout = useCallback(() => {
        localStorage.removeItem('userExamHistory');
        setStudentData(null);
        return signOut(auth);
    }, []);

    // ─── Auth State Observer ──────────────────────────────────────────────────
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(
            auth,
            async (user) => {
                setCurrentUser(user);
                await loadStudentProfile(user);
                setAuthLoading(false);
            }
        );

        return unsubscribe;
    }, [loadStudentProfile]);

    const value = {
        currentUser,
        studentData,
        authLoading,

        // Backward compatibility
        isAdmin: false,
        isSuperAdmin: false,

        // Auth methods
        login,
        logout,
        signupWithEmail,

        // Existing popup Google login
        signInWithGoogle,

        // New redirect Google signup
        startGoogleRedirect,
        completeGoogleRedirect,

        // Google profile creation
        completeGoogleProfile,

        checkEmailExists,
        sendPasswordReset,

        // Legacy alias
        signup: signupWithEmail,
    };

    return (
        <AuthContext.Provider value={value}>
            {authLoading ? (
                <div
                    style={{
                        minHeight: '100vh',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'var(--bg-primary, #0f1115)',
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
                </div>
            ) : (
                children
            )}
        </AuthContext.Provider>
    );
}
