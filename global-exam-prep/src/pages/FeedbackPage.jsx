import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    MessageSquare, Send, ChevronLeft, CheckCircle, Loader, AlertCircle, LogIn, ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AdminFeedbackInbox from '../components/AdminFeedbackInbox';
import { navigateBackOrHome } from '../utils/navigation';

const MAX_DESCRIPTION_LENGTH = 1000;
const FEEDBACK_TYPES = [
    { value: 'general', label: '💬 General Feedback' },
    { value: 'bug', label: '🐛 Bug Report' },
    { value: 'feature', label: '✨ Feature Request' },
    { value: 'content', label: '📚 Content Issue' },
    { value: 'other', label: '📝 Other' },
];

async function requestFeedback(accessToken, payload) {
    const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + accessToken,
        },
        body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    return { response, result };
}



export default function FeedbackPage() {
    const navigate = useNavigate();
    const { session, currentUser, isAdmin, authLoading } = useAuth();
    const [type, setType] = useState('general');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState('idle'); // idle | loading | success | error
    const [errorMsg, setErrorMsg] = useState('');
    const [moderationRetry, setModerationRetry] = useState(0);
    const [moderationResult, setModerationResult] = useState({
        token: '',
        status: 'idle',
        error: '',
    });

    const accessToken = session?.access_token || '';
    // studentId is populated by a separate profile read and can be unavailable
    // even when the Supabase session is valid. The API derives and validates
    // StudentId from the verified Auth UID, so do not treat this as signed out.
    const hasAuthenticatedSession = Boolean(currentUser && accessToken);
    const moderationStatus = hasAuthenticatedSession && moderationResult.token !== accessToken
        ? 'checking'
        : moderationResult.status;

    useEffect(() => {
        if (authLoading || !hasAuthenticatedSession || isAdmin) return undefined;

        let cancelled = false;
        const verifyFeedbackAccess = async () => {
            try {
                const { response, result } = await requestFeedback(accessToken, { action: 'status' });
                if (!response.ok) {
                    throw new Error(result.error || 'Feedback access could not be verified.');
                }
                if (!cancelled) {
                    setModerationResult({
                        token: accessToken,
                        status: result.isSpam === true ? 'blocked' : 'clear',
                        error: '',
                    });
                }
            } catch {
                if (!cancelled) {
                    setModerationResult({
                        token: accessToken,
                        status: 'error',
                        error: 'We could not verify your feedback access right now. Please try again.',
                    });
                }
            }
        };

        verifyFeedbackAccess();
        return () => { cancelled = true; };
    }, [authLoading, hasAuthenticatedSession, isAdmin, accessToken, moderationRetry]);

    const canSubmit = Boolean(
        hasAuthenticatedSession && !isAdmin && moderationStatus === 'clear'
        && description.trim() && status !== 'loading'
    );

    const handleSubmit = async (event) => {
        event.preventDefault();
        const cleanDescription = description.trim();

        if (!hasAuthenticatedSession || isAdmin) {
            setStatus('error');
            setErrorMsg(
                !hasAuthenticatedSession
                    ? 'Sign in with a student account before submitting feedback.'
                    : 'Feedback submission is available to student accounts.'
            );
            return;
        }
        if (moderationStatus === 'blocked') return;
        if (moderationStatus !== 'clear') {
            setStatus('error');
            setErrorMsg('We could not verify your feedback access. Please try again.');
            return;
        }
        if (!cleanDescription) {
            setStatus('error');
            setErrorMsg('Description is required.');
            return;
        }
        if (Array.from(cleanDescription).length > MAX_DESCRIPTION_LENGTH) {
            setStatus('error');
            setErrorMsg('Description cannot exceed 1,000 characters.');
            return;
        }

        setStatus('loading');
        setErrorMsg('');
        try {
            const { response, result } = await requestFeedback(accessToken, {
                type,
                description: cleanDescription,
            });
            if (response.status === 403 && result.code === 'STUDENT_FLAGGED_SPAM') {
                setModerationResult({
                    token: accessToken,
                    status: 'blocked',
                    error: '',
                });
                return;
            }
            if (!response.ok) {
                throw new Error(result.error || 'Feedback could not be submitted. Please try again.');
            }
            setStatus('success');
        } catch (error) {
            setStatus('error');
            setErrorMsg(error?.message || 'Something went wrong. Please try again.');
        }
    };

    if (authLoading) {
        return <div className="container" role="status" style={{ paddingTop: '3rem', color: 'var(--text-secondary)' }}>Loading account…</div>;
    }

    if (isAdmin) return <AdminFeedbackInbox />;

    if (hasAuthenticatedSession && moderationStatus === 'checking') {
        return (
            <div className="container" role="status" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                <Loader size={18} className="feedback-submit-spinner" style={{ marginRight: '0.65rem' }} />
                Checking feedback access…
            </div>
        );
    }

    if (hasAuthenticatedSession && moderationStatus === 'blocked') {
        return (
            <div className="container animate-fade-in" style={{ minHeight: '68vh', maxWidth: '720px', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: '2rem', paddingBottom: '3rem' }}>
                <section
                    className="glass-panel"
                    role="alert"
                    aria-labelledby="feedback-restricted-title"
                    style={{ width: '100%', maxWidth: '560px', padding: 'clamp(1.75rem, 5vw, 3rem)', textAlign: 'center', border: '1px solid rgba(248,113,113,0.28)', background: 'linear-gradient(145deg, rgba(127,29,29,0.16), rgba(255,255,255,0.025))' }}
                >
                    <div style={{ width: 76, height: 76, margin: '0 auto 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '24px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(248,113,113,0.28)' }}>
                        <ShieldAlert size={36} color="#f87171" />
                    </div>
                    <p style={{ margin: '0 0 0.65rem', color: '#fca5a5', fontSize: '0.72rem', fontWeight: 750, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                        Account moderation
                    </p>
                    <h1 id="feedback-restricted-title" style={{ margin: '0 0 0.9rem', fontSize: 'clamp(1.55rem, 4vw, 2rem)', fontWeight: 800, color: 'var(--text-primary)' }}>
                        Feedback access restricted
                    </h1>
                    <p style={{ margin: '0 auto', maxWidth: '430px', color: 'var(--text-secondary)', fontSize: '0.98rem', lineHeight: 1.75 }}>
                        Your account has been marked as spam by an administrator. You can no longer submit feedback through PrepMaster.
                    </p>
                    <p style={{ margin: '0.8rem auto 1.8rem', maxWidth: '430px', color: 'var(--text-tertiary)', fontSize: '0.88rem', lineHeight: 1.65 }}>
                        If you believe this restriction was applied by mistake, please contact an administrator.
                    </p>
                    <button
                        type="button"
                        onClick={() => navigate('/')}
                        style={{ background: 'var(--accent-gradient)', color: 'white', padding: '0.8rem 1.7rem', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer' }}
                    >
                        Back to Home
                    </button>
                </section>
            </div>
        );
    }

    if (hasAuthenticatedSession && moderationStatus === 'error') {
        return (
            <div className="container animate-fade-in" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                <section className="glass-panel" role="alert" style={{ width: '100%', maxWidth: '500px', padding: '2.25rem', textAlign: 'center' }}>
                    <AlertCircle size={32} color="#fbbf24" style={{ marginBottom: '1rem' }} />
                    <h1 style={{ fontSize: '1.45rem', marginBottom: '0.65rem' }}>Unable to verify feedback access</h1>
                    <p style={{ color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: '1.4rem' }}>
                        {moderationResult.error || 'We could not verify your feedback access right now. Please try again.'}
                    </p>
                    <button
                        type="button"
                        onClick={() => {
                            setModerationResult({ token: accessToken, status: 'checking', error: '' });
                            setModerationRetry((value) => value + 1);
                        }}
                        style={{ background: 'var(--accent-gradient)', color: 'white', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-full)', fontWeight: 700, cursor: 'pointer' }}
                    >
                        Try Again
                    </button>
                </section>
            </div>
        );
    }

    if (status === 'success') {
        return (
            <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                <div className="glass-panel animate-fade-in" style={{ maxWidth: '500px', width: '100%', padding: '4rem 3rem', textAlign: 'center' }}>
                    <div style={{ width: 80, height: 80, background: 'rgba(16,185,129,0.12)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem' }}>
                        <CheckCircle size={42} color="var(--success)" />
                    </div>
                    <h1 style={{ fontSize: '2rem', marginBottom: '0.75rem', fontWeight: 800 }}>Thank You!</h1>
                    <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '2.5rem' }}>
                        Your feedback has been saved successfully. Thank you for helping us improve PrepMaster.
                    </p>
                    <button
                        type="button"
                        onClick={() => navigate('/')}
                        style={{ background: 'var(--accent-gradient)', color: 'white', padding: '0.875rem 2.5rem', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', boxShadow: 'none' }}
                    >
                        Back to Home
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="container animate-fade-in" style={{ maxWidth: '720px', paddingTop: '2rem', paddingBottom: '4rem' }}>
            <button
                type="button"
                onClick={() => navigateBackOrHome(navigate, isAdmin)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.9rem', cursor: 'pointer' }}
            >
                <ChevronLeft size={16} /> Back
            </button>

            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                <div style={{ width: 72, height: 72, background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                    <MessageSquare size={32} color="#8b5cf6" />
                </div>
                <h1 style={{ fontSize: '2.4rem', fontWeight: 800, marginBottom: '0.75rem' }}>
                    Share Your{' '}
                    <span style={{ background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                        Feedback
                    </span>
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', maxWidth: '480px', margin: '0 auto', lineHeight: 1.7 }}>
                    Help us make PrepMaster better for everyone. Your feedback goes directly into our feedback system.
                </p>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="glass-panel" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <div>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.875rem', fontSize: '0.95rem' }}>
                            Feedback Type
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                            {FEEDBACK_TYPES.map((option) => {
                                const selected = type === option.value;
                                return (
                                    <button
                                        type="button"
                                        key={option.value}
                                        aria-pressed={selected}
                                        onClick={() => {
                                            setType(option.value);
                                            setStatus('idle');
                                            setErrorMsg('');
                                        }}
                                        style={{
                                            padding: '0.5rem 1rem',
                                            borderRadius: 'var(--radius-full)',
                                            border: selected ? '1px solid #8b5cf6' : '1px solid rgba(255,255,255,0.1)',
                                            background: selected ? 'rgba(139,92,246,0.15)' : 'var(--bg-tertiary)',
                                            color: selected ? '#c4b5fd' : 'var(--text-secondary)',
                                            fontSize: '0.875rem',
                                            fontWeight: 500,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>
                        {type === 'other' && (
                            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', lineHeight: 1.5, margin: '0.75rem 0 0' }}>
                                Use the description below to explain anything that does not fit the other categories.
                            </p>
                        )}
                    </div>

                    <div>
                        <label htmlFor="feedback-description" style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                            Description <span style={{ color: 'var(--danger)', fontSize: '0.8rem' }}>*</span>
                        </label>
                        <textarea
                            id="feedback-description"
                            name="description"
                            required
                            rows={6}
                            maxLength={MAX_DESCRIPTION_LENGTH}
                            placeholder="Describe your feedback, report an issue, or tell us what you would like to see..."
                            value={description}
                            onChange={(event) => {
                                const next = Array.from(event.target.value).slice(0, MAX_DESCRIPTION_LENGTH).join('');
                                setDescription(next);
                                if (status === 'error') {
                                    setStatus('idle');
                                    setErrorMsg('');
                                }
                            }}
                            aria-describedby="feedback-description-count"
                            style={{
                                width: '100%',
                                padding: '0.875rem 1rem',
                                background: 'var(--bg-tertiary)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: 'var(--radius-md)',
                                color: 'var(--text-primary)',
                                fontSize: '0.9rem',
                                resize: 'vertical',
                                fontFamily: 'inherit',
                                lineHeight: 1.6,
                                boxSizing: 'border-box',
                            }}
                        />
                        <div id="feedback-description-count" style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '0.3rem' }} aria-live="polite">
                            {Array.from(description).length} / {MAX_DESCRIPTION_LENGTH} characters
                        </div>
                    </div>

                    {!hasAuthenticatedSession && (
                        <div style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 'var(--radius-md)', padding: '0.9rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                Sign in with a student account to submit feedback.
                            </span>
                            <button
                                type="button"
                                onClick={() => navigate('/signup?mode=login', { state: { from: '/feedback' } })}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: '#c4b5fd', fontWeight: 700, cursor: 'pointer' }}
                            >
                                <LogIn size={16} /> Sign In
                            </button>
                        </div>
                    )}

                    {hasAuthenticatedSession && isAdmin && (
                        <div style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 'var(--radius-md)', padding: '0.9rem 1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                            Feedback submission is available to student accounts.
                        </div>
                    )}

                    {status === 'error' && (
                        <div role="alert" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-md)', padding: '0.875rem 1rem', color: '#fca5a5', fontSize: '0.875rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <AlertCircle size={17} style={{ flexShrink: 0 }} /> {errorMsg || 'Something went wrong. Please try again.'}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={!canSubmit}
                        style={{
                            alignSelf: 'flex-end',
                            minWidth: '174px',
                            padding: '0.85rem 1.35rem',
                            borderRadius: 'var(--radius-full)',
                            background: canSubmit ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'var(--bg-tertiary)',
                            color: canSubmit ? 'white' : 'var(--text-tertiary)',
                            fontWeight: 700,
                            fontSize: '0.95rem',
                            cursor: canSubmit ? 'pointer' : 'not-allowed',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.6rem',
                            transition: 'all 0.2s',
                            boxShadow: 'none',
                        }}
                    >
                        {status === 'loading'
                            ? <><Loader size={18} className="feedback-submit-spinner" /> Sending...</>
                            : <>Send Feedback <Send size={17} /></>}
                    </button>
                    <style>{'@keyframes feedback-submit-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } .feedback-submit-spinner { animation: feedback-submit-spin 0.9s linear infinite; }'}</style>
                </div>
            </form>
        </div>
    );
}
