import React, { useState } from 'react';
import { Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, AlertCircle, ArrowRight, BookOpen } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './Auth.css';

const GoogleIcon = () => (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
);

const AppleIcon = () => (
    <svg viewBox="0 0 814 1000" width="18" height="22" aria-hidden="true">
        <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57.8-155.5-127.4c-58.3-81.6-105.6-208.1-105.6-328.6 0-193.1 125.6-295.6 249.3-295.6 65.6 0 120.4 43.2 161.6 43.2 39.2 0 100.3-45.8 174.3-45.8 28.1 0 129.2 2.6 195.9 99.2zM554.1 159.4c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.7 32.4-55.7 83.6-55.7 135.5 0 7.8.7 15.6 1.3 18.2 2.3.3 5.8.7 9.7.7 45.6 0 103.7-30.4 140.6-70.8z" fill="currentColor" />
    </svg>
);

function getAuthErrorMessage(code) {
    const messages = {
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password. Please try again.',
        'auth/invalid-credential': 'Invalid email or password.',
        'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
        'auth/popup-blocked': 'Popup was blocked. Please allow popups for this site.',
        'auth/popup-closed-by-user': 'Sign-in was cancelled.',
        'auth/account-exists-with-different-credential': 'An account already exists with this email. Try signing in with email and password.',
        'auth/network-request-failed': 'Network error. Check your connection and try again.',
    };
    return messages[code] || 'Sign in failed. Please try again.';
}

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [appleLoading, setAppleLoading] = useState(false);
    const { login, signInWithGoogle, signInWithApple, currentUser } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const from = location.state?.from?.pathname || '/dashboard';

    // Public route guard — already logged in
    if (currentUser) return <Navigate to={from} replace />;

    async function handleSubmit(e) {
        e.preventDefault();

        try {
            setError('');
            setLoading(true);
            await login(email, password);
            navigate(from, { replace: true });
        } catch (err) {
            setError(getAuthErrorMessage(err.code));
        } finally {
            setLoading(false);
        }
    }

    async function handleGoogleSignIn() {
        try {
            setError('');
            setGoogleLoading(true);
            await signInWithGoogle();
            // Navigation handled by the currentUser guard at top of component
        } catch (err) {
            if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
                setError(getAuthErrorMessage(err.code));
            }
        } finally {
            setGoogleLoading(false);
        }
    }

    async function handleAppleSignIn() {
        try {
            setError('');
            setAppleLoading(true);
            await signInWithApple();
            // Navigation handled by the currentUser guard at top of component
        } catch (err) {
            if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
                setError(getAuthErrorMessage(err.code));
            }
        } finally {
            setAppleLoading(false);
        }
    }



    const [rotate, setRotate] = useState({ x: 0, y: 0 });

    function handleMouseMove(e) {
        const card = e.currentTarget;
        const box = card.getBoundingClientRect();
        const x = e.clientX - box.left;
        const y = e.clientY - box.top;

        const centerX = box.width / 2;
        const centerY = box.height / 2;

        const rotateX = ((y - centerY) / centerY) * -10;
        const rotateY = ((x - centerX) / centerX) * 10;

        setRotate({ x: rotateX, y: rotateY });
    }

    function handleMouseLeave() {
        setRotate({ x: 0, y: 0 });
    }

    return (
        <div className="auth-container">
            {/* Dynamic Background Elements */}
            <div className="bg-shape shape-1"></div>
            <div className="bg-shape shape-2"></div>
            <div className="bg-shape shape-3"></div>

            {/* 3D Floating Cube */}
            <div className="cube-container">
                <div className="cube">
                    <div className="face front"><BookOpen size={48} color="#3b82f6" /></div>
                    <div className="face back"><Lock size={48} color="#8b5cf6" /></div>
                    <div className="face right"><Mail size={48} color="#10b981" /></div>
                    <div className="face left"><ArrowRight size={48} color="#f59e0b" /></div>
                    <div className="face top"></div>
                    <div className="face bottom"></div>
                </div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="auth-card"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                style={{
                    transform: `perspective(1000px) rotateX(${rotate.x}deg) rotateY(${rotate.y}deg)`,
                    transition: rotate.x === 0 ? 'transform 0.5s ease-out' : 'none'
                }}
            >
                <div className="auth-header">
                    <motion.h1
                        className="auth-title"
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                    >
                        Welcome Back
                    </motion.h1>
                    <motion.p
                        className="auth-subtitle"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3, duration: 0.5 }}
                    >
                        Log in to continue your exam preparation journey.
                    </motion.p>
                </div>

                {error && (
                    <motion.div
                        className="auth-error"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                    >
                        <AlertCircle size={20} />
                        {error}
                    </motion.div>
                )}

                <div className="auth-social-buttons">
                    <motion.button
                        type="button"
                        className="apple-btn"
                        onClick={handleAppleSignIn}
                        disabled={loading || googleLoading || appleLoading}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.35, duration: 0.5 }}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        aria-label="Sign in with Apple"
                    >
                        <AppleIcon />
                        {appleLoading ? 'Signing in...' : 'Continue with Apple'}
                    </motion.button>

                    <motion.button
                        type="button"
                        className="google-btn"
                        onClick={handleGoogleSignIn}
                        disabled={loading || googleLoading || appleLoading}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4, duration: 0.5 }}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        aria-label="Sign in with Google"
                    >
                        <GoogleIcon />
                        {googleLoading ? 'Signing in...' : 'Continue with Google'}
                    </motion.button>
                </div>

                <motion.div
                    className="auth-divider"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.45, duration: 0.4 }}
                >
                    <span>or use email instead</span>
                </motion.div>

                <form className="auth-form" onSubmit={handleSubmit}>
                    <motion.div
                        className="form-group"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5, duration: 0.5 }}
                    >
                        <label className="form-label" htmlFor="email">Email Address</label>
                        <div className="form-input-wrapper">
                            <Mail className="input-icon" />
                            <input
                                id="email"
                                type="email"
                                className="form-input"
                                placeholder="you@university.edu"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                    </motion.div>

                    <motion.div
                        className="form-group"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.6, duration: 0.5 }}
                    >
                        <label className="form-label" htmlFor="password">Password</label>
                        <div className="form-input-wrapper">
                            <Lock className="input-icon" />
                            <input
                                id="password"
                                type="password"
                                className="form-input"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </motion.div>

                    <motion.button
                        type="submit"
                        className="auth-btn"
                        disabled={loading || googleLoading}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.7, duration: 0.5 }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                    >
                        {loading ? 'Logging In...' : 'Log In'}
                        <ArrowRight size={20} />
                    </motion.button>
                </form>

                <motion.div
                    className="auth-footer"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8, duration: 0.5 }}
                >
                    Don't have an account?
                    <Link to="/signup" className="auth-link">Sign Up</Link>
                </motion.div>
            </motion.div>
        </div>
    );
}
