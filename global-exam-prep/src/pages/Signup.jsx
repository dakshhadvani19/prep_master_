import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Mail, Eye, EyeOff, Shield, AlertCircle,
    Clock, RefreshCw, CheckCircle2, ArrowLeft
} from 'lucide-react';
import {
    GoogleAuthProvider,
    getRedirectResult,
    signInWithRedirect
} from 'firebase/auth';
import { auth } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { createAndSendOTP, verifyOTP } from '../utils/otpService';
import { checkPasswordStrength } from '../utils/passwordStrength';
import './Auth.css';

const GOOGLE_REDIRECT_PENDING_KEY = 'prepmaster_google_signup_pending';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
    prompt: 'select_account',
});

// NOTE: This file has been patched — all animation race conditions fixed.

// ============================================================================
// 0. Success Overlay — Google Pay-inspired animated success screen
// ============================================================================

// SVG defs are placed OUTSIDE motion components to avoid re-render ID conflicts
const SVG_DEFS = (
    <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
            <linearGradient id="pm-successGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#86efac" />
                <stop offset="45%" stopColor="#34d399" />
                <stop offset="100%" stopColor="#16a34a" />
            </linearGradient>

            <linearGradient id="pm-checkGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#bbf7d0" />
                <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
        </defs>
    </svg>
);

function SuccessOverlay({ userName, isLogin, onDone }) {
    const [phase, setPhase] = useState('enter');

    useEffect(() => {
        const flyTimer = setTimeout(() => {
            setPhase('fly');
        }, 2200);

        const doneTimer = setTimeout(() => {
            onDone();
        }, 3000);

        return () => {
            clearTimeout(flyTimer);
            clearTimeout(doneTimer);
        };
    }, [onDone]);

    const firstName = (userName || 'there').split(' ')[0];

    return (
        <motion.div
            className="success-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
        >
            {SVG_DEFS}

            {phase === 'enter' && [
                { delay: 0.45, s: 1.65, o: 0.18 },
                { delay: 0.75, s: 2.25, o: 0.12 },
                { delay: 1.05, s: 2.9, o: 0.07 },
            ].map((r, i) => (
                <motion.div
                    key={i}
                    className="success-ripple"
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{
                        scale: r.s,
                        opacity: [0, r.o, 0],
                    }}
                    transition={{
                        delay: r.delay,
                        duration: 1.35,
                        ease: 'easeOut',
                    }}
                />
            ))}

            <motion.div
                className="success-card"
                initial={{
                    scale: 0.45,
                    opacity: 0,
                    y: 24,
                }}
                animate={
                    phase === 'fly'
                        ? {
                            scale: 0.22,
                            opacity: 0,
                            x: '42vw',
                            y: '-42vh',
                        }
                        : {
                            scale: 1,
                            opacity: 1,
                            x: 0,
                            y: 0,
                        }
                }
                transition={
                    phase === 'fly'
                        ? {
                            duration: 0.7,
                            ease: [0.32, 0.72, 0, 1],
                        }
                        : {
                            type: 'spring',
                            stiffness: 180,
                            damping: 16,
                            delay: 0.08,
                        }
                }
            >
                <div className="success-circle">
                    <svg
                        className="success-ring-svg"
                        viewBox="0 0 100 100"
                        fill="none"
                        style={{ transform: 'rotate(-90deg)' }}
                    >
                        <circle
                            cx="50"
                            cy="50"
                            r="44"
                            stroke="rgba(255,255,255,0.08)"
                            strokeWidth="5"
                        />

                        <motion.circle
                            cx="50"
                            cy="50"
                            r="44"
                            stroke="url(#pm-successGrad)"
                            strokeWidth="5"
                            strokeLinecap="round"
                            strokeDasharray={276.46}
                            initial={{ strokeDashoffset: 276.46 }}
                            animate={{ strokeDashoffset: 0 }}
                            transition={{
                                duration: 1,
                                ease: [0.4, 0, 0.2, 1],
                                delay: 0.2,
                            }}
                        />
                    </svg>

                    <motion.svg
                        className="success-check-svg"
                        viewBox="0 0 52 52"
                        fill="none"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{
                            delay: 0.85,
                            duration: 0.2,
                        }}
                    >
                        <motion.path
                            d="M13 27 L21 35 L39 18"
                            stroke="url(#pm-checkGrad)"
                            strokeWidth="4.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeDasharray={44}
                            initial={{ strokeDashoffset: 44 }}
                            animate={{ strokeDashoffset: 0 }}
                            transition={{
                                duration: 0.55,
                                ease: 'easeOut',
                                delay: 0.9,
                            }}
                        />
                    </motion.svg>
                </div>

                <motion.h2
                    className="success-title"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                        delay: 1.15,
                        duration: 0.45,
                    }}
                >
                    {isLogin
                        ? `Welcome back, ${firstName}!`
                        : `Welcome, ${firstName}!`}
                </motion.h2>

                <motion.p
                    className="success-subtitle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{
                        delay: 1.35,
                        duration: 0.45,
                    }}
                >
                    {isLogin
                        ? 'Logged in successfully.'
                        : 'Your account has been created successfully.'}

                    <br />

                    <span className="success-redirect-hint">
                        Opening your dashboard…
                    </span>
                </motion.p>
            </motion.div>
        </motion.div>
    );
}


// ============================================================================
// 1. Reusable Components
// ============================================================================

const FloatingInput = ({ label, type = 'text', ...props }) => (
    <div className="input-group">
        <input required type={type} placeholder=" " {...props} />
        <label>{label}</label>
    </div>
);

const PasswordInput = ({ label, value, onChange }) => {
    const [show, setShow] = useState(false);
    return (
        <div className="input-group">
            <input
                required
                type={show ? 'text' : 'password'}
                value={value}
                onChange={onChange}
                placeholder=" "
            />
            <label>{label}</label>
            <motion.button
                type="button"
                className="password-toggle"
                onClick={() => setShow(s => !s)}
                tabIndex={-1}
                whileTap={{ scale: 0.85 }}
                aria-label={show ? 'Hide password' : 'Show password'}
            >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </motion.button>
        </div>
    );
};

const SegmentedControl = ({ active, onChange }) => {
    const options = ['Create account', 'Log in'];
    return (
        <div className="segmented-control" role="tablist">
            {options.map(option => {
                const val = option === 'Log in' ? 'login' : 'signup';
                const isActive = active === val;
                return (
                    <button
                        key={option}
                        role="tab"
                        aria-selected={isActive}
                        className={`segment-btn ${isActive ? 'active' : ''}`}
                        onClick={() => onChange(val)}
                    >
                        {isActive && (
                            <motion.div
                                layoutId="segment-indicator"
                                className="active-segment-bg"
                                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                            />
                        )}
                        <span className="segment-text">{option}</span>
                    </button>
                );
            })}
        </div>
    );
};

const cardVariants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};
const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

// ============================================================================
// 2. Main Page Component
// ============================================================================

// ─── Friendly error translator ────────────────────────────────────────────────
function getFriendlyError(err) {
    const code = err?.code || '';
    if (code.includes('email-already-in-use'))      return 'This email is already registered. Try logging in instead.';
    if (code.includes('user-not-found'))             return 'No account found with this email.';
    if (code.includes('wrong-password') || code.includes('invalid-credential')) return 'Incorrect email or password. Please try again.';
    if (code.includes('weak-password'))              return 'Please choose a stronger password (at least 6 characters).';
    if (code.includes('too-many-requests'))          return 'Too many attempts. Please wait a moment and try again.';
    if (code.includes('network-request-failed'))     return 'Connection issue. Please check your internet and try again.';
    if (code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request')) return null; // silent
    if (code.includes('popup-blocked'))              return 'Pop-up was blocked. Please allow pop-ups for this site.';
    if (code.includes('account-exists-with-different-credential')) return 'An account already exists with this email. Try a different sign-in method.';
    if (code.includes('permission-denied'))          return 'Something went wrong. Please try again.';
    // Never leak raw Firebase messages or DB errors
    if (err?.message && !err.message.includes('Firebase') && !err.message.includes('firestore') && !err.message.includes('[')) {
        return err.message;
    }
    return 'Something went wrong. Please try again.';
}

export default function Signup() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const {
    currentUser,
    login,
    signupWithEmail,
    completeGoogleProfile,
    checkEmailExists,
    sendPasswordReset,
} = useAuth();

    // Read ?mode=signup|login and ?method=email|google from URL
    const urlMode   = searchParams.get('mode');   // 'signup' | 'login'
    const urlMethod = searchParams.get('method'); // 'email'  | 'google'

    // emailOpen: whether to show the email form directly (skip button picker)
    // IMPORTANT: declared BEFORE the URL-sync useEffect that calls setEmailOpen
    const [emailOpen, setEmailOpen] = useState(urlMethod === 'email');

    const [mode, setMode] = useState(urlMode === 'login' ? 'login' : 'signup');

    // Sync mode when URL params change (e.g. /signup?mode=login redirect)
    useEffect(() => {
        setMode(urlMode === 'login' ? 'login' : 'signup');
        setEmailOpen(urlMethod === 'email');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [urlMode, urlMethod]);

    const [googleLoading, setGoogleLoading] = useState(false);
    const [globalError,   setGlobalError]   = useState('');

    // SUCCESS OVERLAY — we use a REF as source of truth in addition to state.
    // Firebase's onAuthStateChanged fires setCurrentUser() asynchronously, which
    // triggers our redirect useEffect. If React hasn't flushed setSuccessData yet,
    // the effect would see successData===null and redirect, skipping the animation.
    const successDataRef = useRef(null);

const googleRedirectPendingOnLoad =
    typeof window !== 'undefined' &&
    sessionStorage.getItem(GOOGLE_REDIRECT_PENDING_KEY) === '1';

const authActionPending = useRef(googleRedirectPendingOnLoad);

const [successData, setSuccessData] = useState(null);

    // Atomic setter
    const showSuccess = useCallback((data) => {
        successDataRef.current = data;
        setSuccessData(data);
    }, []);
// ============================================================================
// Google Redirect Completion
// ============================================================================

useEffect(() => {
    const pending =
        typeof window !== 'undefined' &&
        sessionStorage.getItem(GOOGLE_REDIRECT_PENDING_KEY) === '1';

    if (!pending) return;

    let cancelled = false;

    authActionPending.current = true;
    setGoogleLoading(true);
    setGlobalError('');

    const finishGoogleRedirect = async () => {
        try {
            // Firebase normally returns the redirect result here. On some
            // browsers/setups the result can already have been consumed while
            // auth.currentUser is still correctly populated. Support both.
            let redirectResult = null;

            try {
                redirectResult = await getRedirectResult(auth);
            } catch (redirectError) {
                // If Firebase has already restored the authenticated user, the
                // redirect itself succeeded. We can continue using currentUser.
                if (!auth.currentUser) {
                    throw redirectError;
                }
            }

            if (cancelled) return;

            const user = redirectResult?.user || auth.currentUser;

            if (!user) {
                sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_KEY);
                authActionPending.current = false;
                setGlobalError('Google sign-in did not complete. Please try again.');
                return;
            }

            // Determine new/existing user from our own source of truth: the
            // students collection. This also works when getRedirectResult()
            // returns null after Firebase restores the session.
            const studentSnap = await getDoc(doc(db, 'students', user.uid));
            const isNewUser = !studentSnap.exists();

            if (isNewUser) {
                await completeGoogleProfile(
                    user,
                    user.displayName || user.email || 'Student'
                );
            }

            if (cancelled) return;

            sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_KEY);

            showSuccess({
                name: user.displayName || user.email || 'Student',
                isLogin: !isNewUser,
            });
        } catch (err) {
            if (cancelled) return;

            sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_KEY);
            authActionPending.current = false;

            const msg = getFriendlyError(err);
            setGlobalError(msg || 'Google sign-in failed. Please try again.');
        } finally {
            if (!cancelled) {
                setGoogleLoading(false);
            }
        }
    };

    finishGoogleRedirect();

    return () => {
        cancelled = true;
    };
}, [completeGoogleProfile, showSuccess]);
    // CRITICAL FIX: Check BOTH refs. If an action is pending or success overlay is active, DO NOT redirect yet.
    useEffect(() => {
        if (currentUser && !successDataRef.current && !authActionPending.current) {
            navigate('/dashboard', { replace: true });
        }
    }, [currentUser, navigate]);

    // Callback when success animation finishes → navigate
    const handleSuccessDone = useCallback(() => {
        successDataRef.current = null;
        authActionPending.current = false;
        navigate('/dashboard', { replace: true });
    }, [navigate]);

    // Auto-trigger Google redirect when ?method=google is in URL
    const googleAutoFired = useRef(false);

    useEffect(() => {
        const redirectPending =
            typeof window !== 'undefined' &&
            sessionStorage.getItem(GOOGLE_REDIRECT_PENDING_KEY) === '1';

        if (
            urlMethod === 'google' &&
            !googleAutoFired.current &&
            !currentUser &&
            !redirectPending
        ) {
            googleAutoFired.current = true;
            handleGoogleSignIn();
        }
    }, [urlMethod, currentUser]);

    // ─── Google Redirect Sign-Up ─────────────────────────────────────────────
    const handleGoogleSignIn = async () => {
        if (googleLoading) return;

        setGoogleLoading(true);
        setGlobalError('');
        authActionPending.current = true;

        // This survives the full-page redirect to Google and back.
        sessionStorage.setItem(
            GOOGLE_REDIRECT_PENDING_KEY,
            '1'
        );

        try {
            await signInWithRedirect(auth, googleProvider);
        } catch (err) {
            sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_KEY);
            authActionPending.current = false;
            setGoogleLoading(false);

            const msg = getFriendlyError(err);
            if (msg) {
                setGlobalError(msg);
            }
        }
    };

    // Mouse-tracking for the ambient parallax background
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const handleMouseMove = (e) => {
        setMousePos({
            x: (e.clientX / window.innerWidth  - 0.5) * 40,
            y: (e.clientY / window.innerHeight - 0.5) * 40,
        });
    };

    const cardRef = useRef(null);
    const handleCardMouseMove = (e) => {
        if (!cardRef.current) return;
        const rect = cardRef.current.getBoundingClientRect();
        cardRef.current.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
        cardRef.current.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
    };

    return (
        <div className="auth-container" onMouseMove={handleMouseMove}>
            {/* Cinematic Mesh Background */}
            <div className="mesh-bg" aria-hidden="true">
                <motion.div
                    className="mesh-blob blob-1"
                    animate={{ x: mousePos.x, y: mousePos.y }}
                    transition={{ type: 'spring', stiffness: 50, damping: 20 }}
                />
                <motion.div
                    className="mesh-blob blob-2"
                    animate={{ x: -mousePos.x, y: -mousePos.y }}
                    transition={{ type: 'spring', stiffness: 50, damping: 20 }}
                />
                <div className="mesh-blob blob-3" />
            </div>

            {/* Main Auth Card */}
            <motion.div
                ref={cardRef}
                onMouseMove={handleCardMouseMove}
                className="premium-auth-card"
                variants={cardVariants}
                initial="hidden"
                animate="show"
            >
                {/* Logo */}
                <motion.div className="auth-logo" variants={itemVariants}>
                    <div className="auth-logo-ring">
                        <div className="auth-logo-mark">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                            </svg>
                        </div>
                    </div>
                    <span className="logo-word">Prep<span className="logo-accent">Master</span></span>
                </motion.div>

                {/* Segmented Control */}
                <motion.div variants={itemVariants}>
                    <SegmentedControl
                        active={mode}
                        onChange={(newMode) => {
                            setMode(newMode);
                            setEmailOpen(false);
                            setGlobalError('');
                        }}
                    />
                </motion.div>

                {/* Heading */}
                <motion.div className="auth-header" variants={itemVariants}>
                    <h1 className="auth-title">
                        {mode === 'login'
                            ? <><span>Welcome </span><span className="gradient-word">back</span></>
                            : <><span>Start preparing </span><span className="gradient-word">smarter</span></>}
                    </h1>
                    <p className="auth-subtitle">
                        {mode === 'login'
                            ? 'Log in to continue your exam preparation journey.'
                            : 'Join thousands of students crushing their exams with AI.'}
                    </p>
                </motion.div>

                {/* Global error */}
                <AnimatePresence>
                    {globalError && (
                        <motion.div
                            key="global-err"
                            initial={{ opacity: 0, y: -10, height: 0 }}
                            animate={{ opacity: 1, y: 0, height: 'auto' }}
                            exit={{ opacity: 0, y: -10, height: 0 }}
                            className="error-box"
                        >
                            <AlertCircle size={16} /> {globalError}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Auth Content */}
                <motion.div className="auth-content-area" variants={itemVariants}>
                    <AnimatePresence mode="wait" initial={false}>
                        {mode === 'login' ? (
                            <motion.div
                                key="login-view"
                                initial={{ opacity: 0, x: -16 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 16 }}
                                transition={{ duration: 0.25, ease: 'easeInOut' }}
                            >
                                <LoginForm
                                    login={login}
                                    sendPasswordReset={sendPasswordReset}
                                    onAuthStart={() => { authActionPending.current = true; }}
                                    onAuthEnd={() => { authActionPending.current = false; }}
                                    onSuccess={(name) => showSuccess({ name, isLogin: true })}
                                    onSwitch={() => setMode('signup')}
                                />
                            </motion.div>
                        ) : (
                            <motion.div
                                key="signup-view"
                                initial={{ opacity: 0, x: 16 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -16 }}
                                transition={{ duration: 0.25, ease: 'easeInOut' }}
                            >
                                {/* FIX: initial={false} prevents flashing on first render */}
                                <AnimatePresence mode="wait" initial={false}>
                                    {!emailOpen ? (
                                        <motion.div
                                            key="method-picker"
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -6 }}
                                            transition={{ duration: 0.2, ease: 'easeInOut' }}
                                            className="auth-buttons-row"
                                        >
                                            {/* Google */}
                                            <motion.button
                                                type="button"
                                                className="premium-google-btn"
                                                onClick={handleGoogleSignIn}
                                                disabled={googleLoading}
                                                whileHover={{ y: -1 }}
                                                whileTap={{ scale: 0.98 }}
                                            >
                                                {googleLoading ? <div className="mini-spin white" /> : (
                                                    <svg className="google-icon-svg" viewBox="0 0 24 24">
                                                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                                    </svg>
                                                )}
                                                Continue with Google
                                            </motion.button>

                                            {/* Email */}
                                            <motion.button
                                                type="button"
                                                className="premium-email-btn"
                                                onClick={() => setEmailOpen(true)}
                                                disabled={googleLoading}
                                                whileHover={{ y: -1 }}
                                                whileTap={{ scale: 0.98 }}
                                            >
                                                <Mail size={18} />
                                                Continue with Email
                                            </motion.button>
                                        </motion.div>
                                    ) : (
                                        <motion.div
                                            key="email-form"
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -6 }}
                                            transition={{ duration: 0.2, ease: 'easeInOut' }}
                                        >
                                            {/* Back button */}
                                            <button
                                                type="button"
                                                className="back-method-btn"
                                                onClick={() => setEmailOpen(false)}
                                            >
                                                <ArrowLeft size={14} /> Other sign-up options
                                            </button>
                                            <div className="auth-divider"><span>Enter your details</span></div>
                                            <SignupForm
                                                checkEmailExists={checkEmailExists}
                                                signupWithEmail={signupWithEmail}
                                                onAuthStart={() => { authActionPending.current = true; }}
                                                onAuthEnd={() => { authActionPending.current = false; }}
                                                onSwitch={() => setMode('login')}
                                                onShowSuccess={(data) => showSuccess(data)}
                                            />
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            </motion.div>

            {/* Success Overlay — rendered outside the card so it covers the entire viewport */}
            <AnimatePresence>
                {successData && (
                    <SuccessOverlay
                        key="success-overlay"
                        userName={successData.name}
                        isLogin={successData.isLogin}
                        onDone={handleSuccessDone}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

// ============================================================================
// 3. Login Form
// ============================================================================
function LoginForm({ login, sendPasswordReset, onSuccess, onAuthStart, onAuthEnd }) {
    const [email,     setEmail]     = useState('');
    const [password,  setPassword]  = useState('');
    const [loading,   setLoading]   = useState(false);
    const [error,     setError]     = useState('');
    const [resetMode, setResetMode] = useState(false);
    const [msg,       setMsg]       = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(''); setMsg(''); setLoading(true);

        if (resetMode) {
            try {
                await sendPasswordReset(email);
                setMsg('If an account exists, a reset link has been sent to that email.');
            } catch (err) {
                setError(err.message || 'Failed to send reset link.');
            } finally {
                setLoading(false);
            }
            return;
        }

        if (onAuthStart) onAuthStart(); // Block auto-redirect
        try {
            const result = await login(email, password);
            // Show success animation — matches SRS "Show successfully login" step
            const displayName = result?.user?.displayName || email.split('@')[0];
            onSuccess(displayName);
        } catch (err) {
            if (onAuthEnd) onAuthEnd(); // Unblock auto-redirect on error
            const code = err.code || '';
            if (code.includes('user-not-found') || code.includes('wrong-password') || code.includes('invalid-credential')) {
                setError('Incorrect email or password.');
            } else if (code.includes('too-many-requests')) {
                setError('Too many attempts. Please wait a moment and try again.');
            } else {
                setError(err.message || 'Log in failed. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="auth-form">
            <AnimatePresence>
                {error && (
                    <motion.div
                        key="login-err"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="error-box"
                    >
                        <AlertCircle size={15} />{error}
                    </motion.div>
                )}
                {msg && (
                    <motion.div
                        key="login-msg"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="auth-success"
                    >
                        <CheckCircle2 size={15} />{msg}
                    </motion.div>
                )}
            </AnimatePresence>

            <FloatingInput label="Email address" type="email" value={email} onChange={e => setEmail(e.target.value)} />

            <AnimatePresence>
                {!resetMode && (
                    <motion.div
                        key="password-field"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        style={{ overflow: 'hidden' }}
                    >
                        <PasswordInput label="Password" value={password} onChange={e => setPassword(e.target.value)} />
                    </motion.div>
                )}
            </AnimatePresence>

            <button
                type="button"
                className="forgot-link"
                onClick={() => { setResetMode(r => !r); setError(''); setMsg(''); }}
            >
                {resetMode ? 'Back to log in' : 'Forgot password?'}
            </button>

            <motion.button
                type="submit"
                className="premium-btn"
                disabled={loading}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
            >
                {loading ? <div className="mini-spin-dark" /> : (resetMode ? 'Send Reset Link' : 'Log in')}
            </motion.button>
        </form>
    );
}

// ============================================================================
// 4. Signup Form + OTP Logic
// ============================================================================
function SignupForm({ checkEmailExists, signupWithEmail, onShowSuccess, onAuthStart, onAuthEnd }) {
    const [step, setStep] = useState('details');

    const [name,     setName]     = useState('');
    const [email,    setEmail]    = useState('');
    const [password, setPassword] = useState('');
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState('');

    const [strengthState, setStrengthState] = useState({ score: 0, message: '', requirements: {} });
    useEffect(() => {
        setStrengthState(checkPasswordStrength(password) || { score: 0, message: '', requirements: {} });
    }, [password]);

    const handleDetailsSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!name.trim())           return setError('Please enter your full name.');
        if (strengthState.score < 2) return setError('Please choose a stronger password (score ≥ 2).');

        setLoading(true);
        try {
            const exists = await checkEmailExists(email);
            if (exists) {
                setError('An account with this email already exists. Try logging in.');
                return;
            }
            await createAndSendOTP(email, name.trim());
            setStep('otp');
        } catch (err) {
            setError(err.message || 'Failed to send OTP. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (step === 'otp') {
        return (
            <OTPStep
                email={email}
                name={name.trim()}
                onBack={() => setStep('details')}
                onSuccess={async () => {
                    if (onAuthStart) onAuthStart();

                    try {
                        await signupWithEmail(
                            email,
                            password,
                            name.trim()
                        );

                        // Only show success after Firebase + Firestore succeed.
                        onShowSuccess({
                            name: name.trim(),
                            isLogin: false,
                        });
                    } catch (err) {
                        if (onAuthEnd) onAuthEnd();

                        onShowSuccess(null);

                        const msg = getFriendlyError(err);

                        setError(
                            msg ||
                            'Failed to create account. Please try again.'
                        );

                        setStep('details');
                    }
                }}
            />
        );
    }

    return (
        <form onSubmit={handleDetailsSubmit} className="auth-form">
            <StepDots step="details" />
            <AnimatePresence>
                {error && (
                    <motion.div
                        key="signup-det-err"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="error-box"
                    >
                        <AlertCircle size={15} />{error}
                    </motion.div>
                )}
            </AnimatePresence>

            <FloatingInput label="Full Name"      value={name}     onChange={e => setName(e.target.value)} />
            <FloatingInput label="Email address"  type="email" value={email}    onChange={e => setEmail(e.target.value)} />

            <div style={{ width: '100%' }}>
                <PasswordInput label="Create Password" value={password} onChange={e => setPassword(e.target.value)} />
                {password && <PasswordStrength state={strengthState} />}
            </div>

            <motion.button
                type="submit"
                className="premium-btn"
                disabled={loading || strengthState.score < 2}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
            >
                {loading ? <div className="mini-spin-dark" /> : 'Continue →'}
            </motion.button>
        </form>
    );
}

// ============================================================================
// 5. OTP Step
// ============================================================================
function OTPStep({ email, name, onBack, onSuccess }) {
    const [digits,   setDigits]   = useState(['', '', '', '', '', '']);
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState('');
    const [timeLeft, setTimeLeft] = useState(600); // 10 min
    const inputRefs = useRef([]);

    // FIX: Prevent double-submission from auto-submit racing with button click
    const verifyingRef = useRef(false);

    // Countdown timer
    useEffect(() => {
        const timer = setInterval(() => setTimeLeft(t => t > 0 ? t - 1 : 0), 1000);
        return () => clearInterval(timer);
    }, []);

    // Auto-submit when all 6 digits filled
    useEffect(() => {
        const code = digits.join('');
        if (code.length === 6 && !loading && !verifyingRef.current) handleVerify(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [digits]);

    const handleDigit = (idx, value) => {
        const cleaned = value.replace(/\D/g, '').slice(-1);
        const next = [...digits];
        next[idx] = cleaned;
        setDigits(next);
        setError('');
        if (cleaned && idx < 5) inputRefs.current[idx + 1]?.focus();
    };

    const handleKeyDown = (idx, e) => {
        if (e.key === 'Backspace' && !digits[idx] && idx > 0) inputRefs.current[idx - 1]?.focus();
        if (e.key === 'ArrowLeft'  && idx > 0) inputRefs.current[idx - 1]?.focus();
        if (e.key === 'ArrowRight' && idx < 5) inputRefs.current[idx + 1]?.focus();
    };

    const handlePaste = (e) => {
        e.preventDefault();
        const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (!paste) return;
        const next = Array(6).fill('');
        paste.split('').forEach((ch, i) => { next[i] = ch; });
        setDigits(next);
        setError('');
        inputRefs.current[Math.min(paste.length, 5)]?.focus();
    };

    const handleVerify = async (autoCode) => {
        if (verifyingRef.current) return; // prevent double submit
        const code = autoCode || digits.join('');
        if (code.length < 6) return;
        verifyingRef.current = true;
        setLoading(true); setError('');
        try {
            await verifyOTP(email, code);
            // onSuccess handles account creation + showing success overlay
            await onSuccess();
        } catch (err) {
            // OTP errors from otpService are already user-friendly
            setError(err.message || 'Verification failed. Please try again.');
            verifyingRef.current = false;
            setLoading(false);
        }
    };



    const handleResend = async () => {
        setLoading(true); setError('');
        try {
            await createAndSendOTP(email, name);
            setTimeLeft(600);
            setDigits(['', '', '', '', '', '']);
            verifyingRef.current = false;
        } catch (err) {
            setError(err.message || 'Failed to resend code. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <motion.div className="otp-step" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <StepDots step="otp" />
            <div className="otp-icon-wrapper"><Shield size={28} /></div>
            <h3 className="otp-title">Check your email</h3>
            <p className="otp-desc">
                We've sent a 6-digit code to <strong>{email}</strong>
            </p>

            <AnimatePresence>
                {error && (
                    <motion.div
                        key="otp-err"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="error-box"
                        style={{ width: '100%' }}
                    >
                        <AlertCircle size={15} />{error}
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="otp-container">
                {digits.map((digit, idx) => (
                    <input
                        key={idx}
                        ref={el => inputRefs.current[idx] = el}
                        className={`otp-digit ${digit ? 'filled' : ''}`}
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={digit}
                        onChange={e => handleDigit(idx, e.target.value)}
                        onKeyDown={e => handleKeyDown(idx, e)}
                        onPaste={handlePaste}
                        disabled={loading}
                        autoFocus={idx === 0}
                        maxLength={1}
                    />
                ))}
            </div>

            <div className="otp-timer-row">
                <TimerRing timeLeft={timeLeft} />
                <span className="timer-divider">•</span>
                <motion.button
                    type="button"
                    className={`resend-btn ${timeLeft > 0 ? 'disabled' : ''}`}
                    onClick={handleResend}
                    disabled={timeLeft > 0 || loading}
                    whileTap={{ scale: 0.95 }}
                >
                    <RefreshCw size={14} /> Resend code
                </motion.button>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '1rem' }}>
                <motion.button
                    type="button"
                    className="premium-email-btn"
                    onClick={onBack}
                    disabled={loading}
                    style={{ flex: 1 }}
                    whileTap={{ scale: 0.98 }}
                >
                    Back
                </motion.button>
                <motion.button
                    type="button"
                    className="premium-btn"
                    onClick={() => handleVerify()}
                    disabled={loading || digits.join('').length < 6}
                    style={{ flex: 2, marginTop: 0 }}
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.98 }}
                >
                    {loading ? <div className="mini-spin-dark" /> : 'Verify & Create Account'}
                </motion.button>
            </div>
        </motion.div>
    );
}

// ============================================================================
// 6. Helpers
// ============================================================================
function StepDots({ step }) {
    const steps = ['details', 'otp'];
    const current = steps.indexOf(step);
    return (
        <div className="step-dots" aria-hidden="true">
            {steps.map((s, i) => (
                <span
                    key={s}
                    className={`step-dot ${step === s ? 'active' : ''} ${current > i ? 'done' : ''}`}
                />
            ))}
        </div>
    );
}

function PasswordStrength({ state }) {
    if (!state?.message) return null;
    const colors = ['#ff5d5d', '#ffb454', '#45d483', '#45d483'];
    const pct    = (Math.max(state.score, 0) / 4) * 100;
    const color  = state.score > 0 ? colors[state.score - 1] : 'rgba(255,255,255,0.15)';
    return (
        <div className="strength-meter-container">
            <div className="strength-ring-wrap">
                <div
                    className="strength-ring"
                    style={{ background: `conic-gradient(${color} ${pct}%, var(--ring-track) ${pct}%)` }}
                >
                    <div className="strength-ring-inner">{state.score}</div>
                </div>
                <div className="strength-text" style={{ color: state.score < 2 ? 'var(--error)' : 'var(--text-muted)' }}>
                    {state.message}
                </div>
            </div>
        </div>
    );
}

function TimerRing({ timeLeft, total = 600 }) {
    const pct     = (Math.max(timeLeft, 0) / total) * 100;
    const expired = timeLeft === 0;
    return (
        <div className={`timer-ring-wrap ${expired ? 'expired' : ''}`}>
            <div
                className="timer-ring"
                style={{ background: `conic-gradient(var(--accent) ${pct}%, var(--ring-track) ${pct}%)` }}
            >
                <div className="timer-ring-inner"><Clock size={9} /></div>
            </div>
            <span className={`timer-text ${expired ? 'expired' : ''}`}>
                {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
            </span>
        </div>
    );
}