/**
 * AuthContext.jsx
 *
 * Simplified auth — everyone is a student for now.
 * Admin system will be added later when admin management UI is built.
 *
 * Firestore collection: `students` (doc ID = Firebase Auth UID)
 * {
 *   studentId:    number  (int64 auto-incremented)
 *   uid:          string
 *   fullName:     string
 *   email:        string
 *   passwordHash: string  (SHA-256 of password + ":" + email)
 *   isSpam:       boolean
 *   provider:     string  ('email' | 'google')
 *   providers:    string[]
 *   createdAt:    string  (ISO)
 *   photoURL:     string | null
 * }
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile,
    GoogleAuthProvider,
    signInWithPopup,
    sendPasswordResetEmail,
} from 'firebase/auth';
import {
    doc, setDoc, getDoc,
    collection, query, where, getDocs,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { hashPassword, getNextStudentId } from '../utils/hashUtil';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const AuthContext = createContext();

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [currentUser,  setCurrentUser]  = useState(null);
    const [studentData,  setStudentData]  = useState(null);
    const [authLoading,  setAuthLoading]  = useState(true);

    // ─── Load student profile from Firestore ───────────────────────────────────
    async function loadStudentProfile(user) {
        if (!user) {
            setStudentData(null);
            return;
        }
        try {
            const snap = await getDoc(doc(db, 'students', user.uid));
            setStudentData(snap.exists() ? snap.data() : null);
        } catch {
            setStudentData(null);
        }
    }

    // ─── Email / Password Sign-Up (called AFTER OTP is verified) ──────────────
    async function signupWithEmail(email, password, displayName) {
        const { user } = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(user, { displayName });

        const [studentId, passwordHash] = await Promise.all([
            getNextStudentId(),
            hashPassword(password, email),
        ]);

        const studentDoc = {
            studentId,
            uid:          user.uid,
            fullName:     displayName,
            email:        email.trim().toLowerCase(),
            passwordHash,
            isSpam:       false,
            provider:     'email',
            providers:    ['email'],
            createdAt:    new Date().toISOString(),
            photoURL:     null,
        };

        await setDoc(doc(db, 'students', user.uid), studentDoc);
        setStudentData(studentDoc);
        return user;
    }

    // ─── Email / Password Login ────────────────────────────────────────────────
    function login(email, password) {
        return signInWithEmailAndPassword(auth, email, password);
    }

    // ─── Google Sign-In ────────────────────────────────────────────────────────
    async function signInWithGoogle() {
        const result      = await signInWithPopup(auth, googleProvider);
        const user        = result.user;
        const snap        = await getDoc(doc(db, 'students', user.uid));
        const isNewUser   = !snap.exists();
        return { user, isNewUser };
    }

    // ─── Complete Google Profile (first-time Google users) ────────────────────
    async function completeGoogleProfile(user, displayName, password = null) {
        // Fallback: if displayName is empty/null use the part before @ in email
        const resolvedName = (displayName && displayName.trim())
            ? displayName.trim()
            : (user.email ? user.email.split('@')[0] : 'Student');

        await updateProfile(user, { displayName: resolvedName });

        const [studentId, passwordHash] = await Promise.all([
            getNextStudentId(),
            password ? hashPassword(password, user.email) : Promise.resolve(null),
        ]);

        const studentDoc = {
            studentId,
            uid:          user.uid,
            fullName:     resolvedName,
            email:        user.email.trim().toLowerCase(),
            passwordHash,
            isSpam:       false,
            provider:     'google',
            providers:    ['google'],
            createdAt:    new Date().toISOString(),
            photoURL:     user.photoURL || null,
        };

        await setDoc(doc(db, 'students', user.uid), studentDoc);
        setStudentData(studentDoc);
        return user;
    }

    // ─── Check if email is already registered ─────────────────────────────────
    async function checkEmailExists(email) {
        try {
            const q    = query(
                collection(db, 'students'),
                where('email', '==', email.trim().toLowerCase()),
            );
            const snap = await getDocs(q);
            return !snap.empty;
        } catch {
            return false;
        }
    }

    // ─── Password Reset ────────────────────────────────────────────────────────
    function sendPasswordReset(email) {
        return sendPasswordResetEmail(auth, email);
    }

    // ─── Sign Out ──────────────────────────────────────────────────────────────
    function logout() {
        localStorage.removeItem('userExamHistory');
        setStudentData(null);
        return signOut(auth);
    }

    // ─── Auth State Observer ───────────────────────────────────────────────────
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setCurrentUser(user);
            await loadStudentProfile(user);
            setAuthLoading(false);
        });
        return unsubscribe;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const value = {
        // State
        currentUser,
        studentData,
        authLoading,
        // Kept for backward compat with existing callers
        isAdmin:      false,
        isSuperAdmin: false,
        // Auth methods
        login,
        logout,
        signupWithEmail,
        signInWithGoogle,
        completeGoogleProfile,
        checkEmailExists,
        sendPasswordReset,
        signup: signupWithEmail,
    };

    return (
        <AuthContext.Provider value={value}>
            {authLoading ? (
                <div style={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--bg-primary, #0f1115)',
                }}>
                    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                    <div style={{
                        width: 40, height: 40,
                        border: '3px solid rgba(255,255,255,0.1)',
                        borderTopColor: 'var(--accent-primary, #3b82f6)',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                    }} />
                </div>
            ) : children}
        </AuthContext.Provider>
    );
}
