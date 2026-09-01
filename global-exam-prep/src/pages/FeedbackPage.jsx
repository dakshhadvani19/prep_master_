import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Send, Star, ChevronLeft, CheckCircle, Loader, AlertCircle } from 'lucide-react';

const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];
const FEEDBACK_TYPES = [
    { value: 'general', label: '💬 General Feedback' },
    { value: 'bug', label: '🐛 Bug Report' },
    { value: 'feature', label: '✨ Feature Request' },
    { value: 'content', label: '📚 Content Issue' },
    { value: 'ai', label: '🤖 AI Quality' },
];

export default function FeedbackPage() {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        type: 'general',
        rating: 0,
        subject: '',
        message: '',
        name: '',
        email: '',
    });
    const [hoveredStar, setHoveredStar] = useState(0);
    const [status, setStatus] = useState('idle'); // idle | loading | success | error
    const [errorMsg, setErrorMsg] = useState('');

    const handleChange = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.message.trim()) return;
        setStatus('loading');
        setErrorMsg('');
        try {
            const res = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Server error: ${res.status}`);
            }
            setStatus('success');
        } catch (err) {
            setStatus('error');
            setErrorMsg(err.message);
        }
    };

    if (status === 'success') {
        return (
            <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                <div className="glass-panel animate-fade-in" style={{ maxWidth: '500px', width: '100%', padding: '4rem 3rem', textAlign: 'center' }}>
                    <div style={{ width: 80, height: 80, background: 'rgba(16,185,129,0.12)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem' }}>
                        <CheckCircle size={42} color="var(--success)" />
                    </div>
                    <h1 style={{ fontSize: '2rem', marginBottom: '0.75rem', fontWeight: 800 }}>Thank You! 🎉</h1>
                    <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '2.5rem' }}>
                        Your feedback has been received and sent to the development team. We truly appreciate you taking the time!
                    </p>
                    <button
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
                onClick={() => navigate(-1)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.9rem', cursor: 'pointer' }}
            >
                <ChevronLeft size={16} /> Back
            </button>

            {/* Header */}
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
                    Help us make PrepMaster better for everyone. Your input goes directly to the development team.
                </p>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="glass-panel" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {/* Feedback Type */}
                    <div>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.875rem', fontSize: '0.95rem' }}>Feedback Type</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                            {FEEDBACK_TYPES.map(t => (
                                <button
                                    type="button"
                                    key={t.value}
                                    onClick={() => handleChange('type', t.value)}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        borderRadius: 'var(--radius-full)',
                                        border: formData.type === t.value ? '1px solid #8b5cf6' : '1px solid rgba(255,255,255,0.1)',
                                        background: formData.type === t.value ? 'rgba(139,92,246,0.15)' : 'var(--bg-tertiary)',
                                        color: formData.type === t.value ? '#c4b5fd' : 'var(--text-secondary)',
                                        fontSize: '0.875rem',
                                        fontWeight: 500,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Star Rating */}
                    <div>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.875rem', fontSize: '0.95rem' }}>
                            Overall Rating {formData.rating > 0 && <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>— {RATING_LABELS[formData.rating]}</span>}
                        </label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {[1, 2, 3, 4, 5].map(star => (
                                <button
                                    type="button"
                                    key={star}
                                    onMouseEnter={() => setHoveredStar(star)}
                                    onMouseLeave={() => setHoveredStar(0)}
                                    onClick={() => handleChange('rating', star)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', transition: 'transform 0.15s' }}
                                    onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.2)'; }}
                                    onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; }}
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

                    {/* Name + Email (optional) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem' }}>Your Name <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(optional)</span></label>
                            <input
                                type="text"
                                placeholder="e.g. Daksh Hadvani"
                                value={formData.name}
                                onChange={e => handleChange('name', e.target.value)}
                                style={{ width: '100%', padding: '0.75rem 1rem', background: 'var(--bg-tertiary)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '0.9rem', boxSizing: 'border-box' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem' }}>Your Email <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(optional)</span></label>
                            <input
                                type="email"
                                placeholder="you@example.com"
                                value={formData.email}
                                onChange={e => handleChange('email', e.target.value)}
                                style={{ width: '100%', padding: '0.75rem 1rem', background: 'var(--bg-tertiary)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '0.9rem', boxSizing: 'border-box' }}
                            />
                        </div>
                    </div>

                    {/* Subject line */}
                    <div>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem' }}>Subject <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(optional)</span></label>
                        <input
                            type="text"
                            placeholder="Brief summary of your feedback"
                            value={formData.subject}
                            onChange={e => handleChange('subject', e.target.value)}
                            style={{ width: '100%', padding: '0.75rem 1rem', background: 'var(--bg-tertiary)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '0.9rem', boxSizing: 'border-box' }}
                        />
                    </div>

                    {/* Message */}
                    <div>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                            Message <span style={{ color: 'var(--danger)', fontSize: '0.8rem' }}>*</span>
                        </label>
                        <textarea
                            required
                            rows={5}
                            placeholder="Tell us what you think, what's broken, or what you'd love to see..."
                            value={formData.message}
                            onChange={e => handleChange('message', e.target.value)}
                            style={{ width: '100%', padding: '0.875rem 1rem', background: 'var(--bg-tertiary)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '0.9rem', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box' }}
                        />
                        <div style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '0.3rem' }}>
                            {formData.message.length} characters
                        </div>
                    </div>

                    {/* Error */}
                    {status === 'error' && (
                        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-md)', padding: '0.875rem 1rem', color: '#fca5a5', fontSize: '0.875rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <AlertCircle size={17} style={{ flexShrink: 0 }} /> {errorMsg || 'Something went wrong. Please try again.'}
                        </div>
                    )}

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={status === 'loading' || !formData.message.trim()}
                        style={{
                            width: '100%',
                            padding: '1rem',
                            borderRadius: 'var(--radius-full)',
                            background: (status === 'loading' || !formData.message.trim()) ? 'var(--bg-tertiary)' : 'linear-gradient(135deg,#8b5cf6,#3b82f6)',
                            color: (status === 'loading' || !formData.message.trim()) ? 'var(--text-tertiary)' : 'white',
                            fontWeight: 700,
                            fontSize: '1rem',
                            cursor: (status === 'loading' || !formData.message.trim()) ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.6rem',
                            transition: 'all 0.2s',
                            boxShadow: (status === 'loading' || !formData.message.trim()) ? 'none' : '0 8px 25px rgba(139,92,246,0.35)',
                        }}
                    >
                        {status === 'loading'
                            ? <><Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> Sending...</>
                            : <><Send size={18} /> Send Feedback</>}
                    </button>
                    <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                </div>
            </form>
        </div>
    );
}
