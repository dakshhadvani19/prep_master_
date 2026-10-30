import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    MessageSquare, Send, ChevronLeft, CheckCircle, Loader, AlertCircle, LogIn,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const MAX_DESCRIPTION_LENGTH = 1000;
const FEEDBACK_TYPES = [
    { value: 'general', label: '💬 General Feedback' },
    { value: 'bug', label: '🐛 Bug Report' },
    { value: 'feature', label: '✨ Feature Request' },
    { value: 'content', label: '📚 Content Issue' },
    { value: 'other', label: '📝 Other' },
];

export default function FeedbackPage() {
    const navigate = useNavigate();
    const { session, currentUser, isAdmin } = useAuth();
    const [type, setType] = useState('general');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState('idle'); // idle | loading | success | error
    const [errorMsg, setErrorMsg] = useState('');

    const accessToken = session?.access_token || '';
    // studentId is populated by a separate profile read and can be unavailable
    // even when the Supabase session is valid. The API derives and validates
    // StudentId from the verified Auth UID, so do not treat this as signed out.
    const hasAuthenticatedSession = Boolean(currentUser && accessToken);
    const canSubmit = Boolean(
        hasAuthenticatedSession && !isAdmin && description.trim() && status !== 'loading'
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
            const response = await fetch('/api/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + accessToken,
                },
                body: JSON.stringify({ type, description: cleanDescription }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(result.error || 'Feedback could not be submitted. Please try again.');
            }
            setStatus('success');
        } catch (error) {
            setStatus('error');
            setErrorMsg(error?.message || 'Something went wrong. Please try again.');
        }
    };

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
                        style={{ background: 'var(--accent-gradient)', color: 'white', padding: '0.875rem 2.5rem', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', boxShadow: 'var(--shadow-glow)' }}
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
                onClick={() => navigate(-1)}
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
                            boxShadow: canSubmit ? '0 8px 25px rgba(139,92,246,0.25)' : 'none',
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
