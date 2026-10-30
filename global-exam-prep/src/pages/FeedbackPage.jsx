import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Send, Star, ChevronLeft, CheckCircle, Loader, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const FEEDBACK_TYPES = [
    { value: 'general', label: '💬 General Feedback' },
    { value: 'bug', label: '🐛 Bug Report' },
    { value: 'feature', label: '✨ Feature Request' },
    { value: 'content', label: '📚 Content Issue' },
    { value: 'other', label: 'Other' },
];
const MAX_DESCRIPTION_LENGTH = 1000;

export default function FeedbackPage() {
    const navigate = useNavigate();
    const { session, studentId } = useAuth();
    const [formData, setFormData] = useState({ type: 'general', rating: 0, description: '' });
    const [hoveredStar, setHoveredStar] = useState(0);
    const [status, setStatus] = useState('idle');
    const [errorMsg, setErrorMsg] = useState('');

    const handleChange = (field, value) => {
        setFormData((previous) => ({ ...previous, [field]: value }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        const description = formData.description.trim();

        if (!description) {
            setStatus('error');
            setErrorMsg('Please enter a description before sending feedback.');
            return;
        }
        if (formData.rating < 1 || formData.rating > 5) {
            setStatus('error');
            setErrorMsg('Please select a rating from 1 to 5.');
            return;
        }
        if (!studentId || !session?.access_token) {
            setStatus('error');
            setErrorMsg('Sign in with a student account to send feedback.');
            return;
        }

        setStatus('loading');
        setErrorMsg('');
        try {
            const response = await fetch('/api/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    type: formData.type,
                    rating: formData.rating,
                    description,
                }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(result.error || 'Feedback could not be sent. Please try again.');
            }
            setStatus('success');
        } catch (error) {
            setStatus('error');
            setErrorMsg(error.message || 'Something went wrong. Please try again.');
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
                        Your feedback has been saved. We appreciate you taking the time to help improve PrepMaster.
                    </p>
                    <button onClick={() => navigate('/')} style={{ background: 'var(--accent-gradient)', color: 'white', padding: '0.875rem 2.5rem', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', boxShadow: 'var(--shadow-glow)' }}>
                        Back to Home
                    </button>
                </div>
            </div>
        );
    }

    const descriptionLength = Array.from(formData.description).length;
    const canSubmit = Boolean(
        studentId && session?.access_token && formData.description.trim()
        && formData.rating >= 1 && status !== 'loading'
    );

    return (
        <div className="container animate-fade-in" style={{ maxWidth: '720px', paddingTop: '2rem', paddingBottom: '4rem' }}>
            <button type="button" onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.9rem', cursor: 'pointer' }}>
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
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.875rem', fontSize: '0.95rem' }}>Feedback Type</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                            {FEEDBACK_TYPES.map((item) => (
                                <button
                                    type="button"
                                    key={item.value}
                                    aria-pressed={formData.type === item.value}
                                    onClick={() => handleChange('type', item.value)}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        borderRadius: 'var(--radius-full)',
                                        border: formData.type === item.value ? '1px solid #8b5cf6' : '1px solid rgba(255,255,255,0.1)',
                                        background: formData.type === item.value ? 'rgba(139,92,246,0.15)' : 'var(--bg-tertiary)',
                                        color: formData.type === item.value ? '#c4b5fd' : 'var(--text-secondary)',
                                        fontSize: '0.875rem',
                                        fontWeight: 500,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.875rem', fontSize: '0.95rem' }}>
                            Only Rating
                            {formData.rating > 0 && <span style={{ color: 'var(--text-secondary)', fontWeight: 400, marginLeft: '0.5rem' }}>{formData.rating}/5</span>}
                        </label>
                        <div style={{ display: 'flex', gap: '0.5rem' }} role="group" aria-label="Only Rating">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    type="button"
                                    key={star}
                                    aria-label={`Rate ${star} out of 5`}
                                    aria-pressed={formData.rating === star}
                                    onMouseEnter={() => setHoveredStar(star)}
                                    onMouseLeave={() => setHoveredStar(0)}
                                    onFocus={() => setHoveredStar(star)}
                                    onBlur={() => setHoveredStar(0)}
                                    onClick={() => handleChange('rating', star)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', transition: 'transform 0.15s' }}
                                >
                                    <Star
                                        size={32}
                                        fill={(hoveredStar || formData.rating) >= star ? '#fbbf24' : 'transparent'}
                                        color={(hoveredStar || formData.rating) >= star ? '#fbbf24' : 'rgba(255,255,255,0.2)'}
                                    />
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label htmlFor="feedback-description" style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                            Description <span style={{ color: 'var(--danger)', fontSize: '0.8rem' }}>*</span>
                        </label>
                        <textarea
                            id="feedback-description"
                            name="description"
                            aria-label="Description"
                            required
                            maxLength={MAX_DESCRIPTION_LENGTH}
                            rows={5}
                            placeholder="Describe your feedback, issue, or suggestion..."
                            value={formData.description}
                            onChange={(event) => {
                                const next = Array.from(event.target.value).slice(0, MAX_DESCRIPTION_LENGTH).join('');
                                handleChange('description', next);
                            }}
                            style={{ width: '100%', padding: '0.875rem 1rem', background: 'var(--bg-tertiary)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '0.9rem', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box' }}
                        />
                        <div style={{ textAlign: 'right', fontSize: '0.78rem', color: descriptionLength >= MAX_DESCRIPTION_LENGTH ? 'var(--danger)' : 'var(--text-tertiary)', marginTop: '0.3rem' }}>
                            {descriptionLength}/{MAX_DESCRIPTION_LENGTH} characters
                        </div>
                    </div>

                    {status === 'error' && (
                        <div role="alert" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-md)', padding: '0.875rem 1rem', color: '#fca5a5', fontSize: '0.875rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <AlertCircle size={17} style={{ flexShrink: 0 }} /> {errorMsg || 'Something went wrong. Please try again.'}
                        </div>
                    )}

                    {!studentId && <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', margin: 0 }}>Sign in with a student account to send feedback.</p>}

                    <button
                        type="submit"
                        disabled={!canSubmit}
                        style={{
                            alignSelf: 'flex-end',
                            minWidth: 'fit-content',
                            padding: '0.85rem 1.4rem',
                            borderRadius: 'var(--radius-full)',
                            background: canSubmit ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'var(--bg-tertiary)',
                            color: canSubmit ? 'white' : 'var(--text-tertiary)',
                            fontWeight: 700,
                            fontSize: '0.95rem',
                            cursor: canSubmit ? 'pointer' : 'not-allowed',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.65rem',
                            transition: 'all 0.2s',
                            boxShadow: canSubmit ? '0 8px 25px rgba(139,92,246,0.25)' : 'none',
                        }}
                    >
                        {status === 'loading'
                            ? <><Loader size={17} style={{ animation: 'spin 1s linear infinite' }} /> Sending...</>
                            : <>Send Feedback <Send size={17} /></>}
                    </button>
                    <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                </div>
            </form>
        </div>
    );
}
