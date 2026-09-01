import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle, XCircle, MinusCircle, BarChart2, BookOpen, Loader } from 'lucide-react';
import { domains, examPrompts } from '../data/mockData';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function ReviewPage() {
    const { historyId } = useParams();
    const navigate = useNavigate();
    const [currentQ, setCurrentQ] = useState(0);
    const [record, setRecord] = useState(null);
    const [loadingRecord, setLoadingRecord] = useState(true);
    const { currentUser } = useAuth();

    // Load the specific history record from Firestore (scoped to current user)
    useEffect(() => {
        if (!currentUser) return;

        const fetchRecord = async () => {
            setLoadingRecord(true);
            const snap = await getDoc(doc(db, 'users', currentUser.uid, 'examHistory', historyId));
            setRecord(snap.exists() ? snap.data() : null);
            setLoadingRecord(false);
        };

        fetchRecord();
    }, [currentUser?.uid, historyId]);

    // Summary stats - MUST be above conditional returns to satisfy React Hook rules
    const stats = useMemo(() => {
        if (!record || !record.questions) return { correct: 0, wrong: 0, unattempted: 0, attempted: 0 };
        
        let correct = 0, wrong = 0, unattempted = 0;
        const questions = record.questions;
        const userAnswers = record.userAnswers || {};
        const isObjective = record.type === 'objective';

        const getStatusLocal = (q) => {
            const ua = userAnswers[q.id];
            if (ua === undefined || ua === '') return 'unattempted';
            if (isObjective) return ua == q.answer ? 'correct' : 'wrong';
            return 'attempted';
        };

        questions.forEach(q => {
            const s = getStatusLocal(q);
            if (s === 'correct') correct++;
            else if (s === 'wrong') wrong++;
            else unattempted++;
        });
        return { correct, wrong, unattempted, attempted: correct + wrong };
    }, [record]);

    if (loadingRecord) {
        return (
            <div className="container animate-fade-in" style={{ maxWidth: '700px', textAlign: 'center', marginTop: '5rem' }}>
                <Loader size={36} color="var(--accent-primary)" style={{ margin: '0 auto 1rem auto', display: 'block', animation: 'spin 1s linear infinite' }} />
                <p style={{ color: 'var(--text-secondary)' }}>Loading review...</p>
            </div>
        );
    }

    if (!record || !record.questions) {
        return (
            <div className="container animate-fade-in" style={{ maxWidth: '700px', textAlign: 'center', marginTop: '5rem' }}>
                <BookOpen size={48} style={{ color: 'var(--text-secondary)', margin: '0 auto 1.5rem auto', display: 'block' }} />
                <h2 style={{ marginBottom: '1rem' }}>Review Not Available</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                    This exam was taken before answer review was supported, or the data is unavailable.
                </p>
                <button
                    onClick={() => navigate('/dashboard')}
                    style={{
                        background: 'var(--accent-gradient)',
                        color: 'white',
                        padding: '0.75rem 2rem',
                        borderRadius: 'var(--radius-full)',
                        fontWeight: 600,
                        cursor: 'pointer',
                    }}
                >
                    Back to Dashboard
                </button>
            </div>
        );
    }

    const questions = record.questions;
    const userAnswers = record.userAnswers || {};
    const isObjective = record.type === 'objective';
    const examInfo = examPrompts[record.examType];

    // Get subject name
    const getSubjectName = (subjectId) => {
        for (const d of domains) {
            for (const c of d.courses) {
                const sub = c.subjects.find(s => s.id === subjectId);
                if (sub) return sub.title;
            }
        }
        return 'Unknown Subject';
    };

    // Per-question status helpers
    const getStatus = (q) => {
        const ua = userAnswers[q.id];
        if (ua === undefined || ua === '') return 'unattempted';
        if (isObjective) return ua == q.answer ? 'correct' : 'wrong';
        return 'attempted'; // subjective — just mark answered
    };

    // Color mapping
    const statusColors = {
        correct: { bg: 'rgba(16,185,129,0.15)', border: 'var(--success)', text: 'var(--success)' },
        wrong: { bg: 'rgba(239,68,68,0.15)', border: 'var(--danger)', text: 'var(--danger)' },
        unattempted: { bg: 'rgba(107,114,128,0.1)', border: 'rgba(255,255,255,0.1)', text: 'var(--text-tertiary)' },
        attempted: { bg: 'rgba(59,130,246,0.15)', border: 'var(--accent-primary)', text: 'var(--accent-primary)' },
    };

    const q = questions[currentQ];
    const qStatus = getStatus(q);
    const userAnswer = userAnswers[q.id];

    return (
        <div className="container animate-fade-in" style={{ maxWidth: '1100px' }}>
            {/* Back Button */}
            <button
                onClick={() => navigate('/dashboard')}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem', cursor: 'pointer' }}
            >
                <ArrowLeft size={16} /> Back to Performance History
            </button>

            {/* Header */}
            <div className="glass-panel" style={{ padding: '1.5rem 2rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <h1 style={{ fontSize: '1.6rem', marginBottom: '0.25rem' }}>{getSubjectName(record.subjectId)}</h1>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            {examInfo?.title} &bull; <span style={{ textTransform: 'capitalize' }}>{record.difficulty}</span> &bull; {new Date(record.date).toLocaleDateString()}
                        </p>
                    </div>
                    {isObjective && record.score !== null && (
                        <div style={{
                            background: 'var(--bg-tertiary)',
                            padding: '0.75rem 1.5rem',
                            borderRadius: 'var(--radius-lg)',
                            border: '1px solid var(--glass-border)',
                            textAlign: 'center',
                        }}>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-primary)' }}>
                                {record.score}<span style={{ fontSize: '1rem', color: 'var(--text-secondary)', fontWeight: 400 }}> / {record.totalMarks}</span>
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Final Score</div>
                        </div>
                    )}
                </div>
            </div>

            {/* Stats Bar */}
            {isObjective && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                    {[
                        { label: 'Total Questions', value: questions.length, icon: BarChart2, color: 'var(--accent-primary)', bg: 'rgba(59,130,246,0.1)' },
                        { label: 'Attempted', value: stats.attempted, icon: CheckCircle, color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
                        { label: 'Correct', value: stats.correct, icon: CheckCircle, color: 'var(--success)', bg: 'rgba(16,185,129,0.1)' },
                        { label: 'Wrong', value: stats.wrong, icon: XCircle, color: 'var(--danger)', bg: 'rgba(239,68,68,0.1)' },
                        { label: 'Unattempted', value: stats.unattempted, icon: MinusCircle, color: 'var(--text-tertiary)', bg: 'rgba(107,114,128,0.1)' },
                    ].map(({ label, value, icon: Icon, color, bg }) => (
                        <div key={label} className="glass-panel" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Icon size={20} color={color} />
                            </div>
                            <div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color }}>{value}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Main Review Area */}
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>

                {/* Question Palette */}
                <div className="glass-panel" style={{ width: '100%', maxWidth: '240px', minWidth: '200px', padding: '1.25rem', flex: '0 0 auto' }}>
                    <h3 style={{ fontSize: '0.95rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>Question Palette</h3>
                    {isObjective && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
                            {[
                                { label: '● Correct', color: 'var(--success)' },
                                { label: '● Wrong', color: 'var(--danger)' },
                                { label: '● Unattempted', color: 'var(--text-tertiary)' },
                            ].map(({ label, color }) => (
                                <div key={label} style={{ fontSize: '0.76rem', color, fontWeight: 500 }}>{label}</div>
                            ))}
                        </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
                        {questions.map((question, idx) => {
                            const s = getStatus(question);
                            const c = statusColors[s];
                            return (
                                <button
                                    key={idx}
                                    onClick={() => setCurrentQ(idx)}
                                    style={{
                                        aspectRatio: '1',
                                        borderRadius: 'var(--radius-sm)',
                                        background: currentQ === idx ? (c.bg) : c.bg,
                                        color: c.text,
                                        fontWeight: 700,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        border: `2px solid ${currentQ === idx ? c.border : c.border}`,
                                        fontSize: '0.8rem',
                                        outline: currentQ === idx ? `2px solid ${c.border}` : 'none',
                                        outlineOffset: '2px',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                    }}
                                >
                                    {idx + 1}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Question Detail */}
                <div className="glass-panel" style={{ flex: 1, padding: '2rem', minWidth: '280px', display: 'flex', flexDirection: 'column' }}>
                    {/* Q Number + Status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <h2 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                            Question {currentQ + 1} of {questions.length}
                        </h2>
                        {isObjective && (
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                padding: '0.35rem 0.85rem',
                                borderRadius: 'var(--radius-full)',
                                fontSize: '0.8rem', fontWeight: 700,
                                background: statusColors[qStatus].bg,
                                color: statusColors[qStatus].text,
                                border: `1px solid ${statusColors[qStatus].border}`,
                                textTransform: 'capitalize',
                            }}>
                                {qStatus === 'correct' && <CheckCircle size={14} />}
                                {qStatus === 'wrong' && <XCircle size={14} />}
                                {qStatus === 'unattempted' && <MinusCircle size={14} />}
                                {qStatus}
                            </span>
                        )}
                    </div>

                    {/* Question Text */}
                    <div style={{
                        fontSize: '1.05rem', lineHeight: 1.7, marginBottom: '2rem',
                        padding: '1.25rem', background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)',
                        color: 'var(--text-primary)',
                    }}>
                        {q.text}
                    </div>

                    {/* MCQ Options */}
                    {isObjective && q.options && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
                            {q.options.map((opt, idx) => {
                                const isCorrect = idx == q.answer;
                                const isUserChoice = userAnswer == idx;
                                const wasUnattempted = userAnswer === undefined;

                                let bg = 'var(--bg-tertiary)';
                                let border = 'var(--glass-border)';
                                let textColor = 'var(--text-primary)';
                                let icon = null;

                                if (isCorrect) {
                                    bg = 'rgba(16,185,129,0.12)';
                                    border = 'var(--success)';
                                    textColor = 'var(--success)';
                                    icon = <CheckCircle size={18} color="var(--success)" style={{ flexShrink: 0 }} />;
                                } else if (isUserChoice && !isCorrect) {
                                    bg = 'rgba(239,68,68,0.12)';
                                    border = 'var(--danger)';
                                    textColor = 'var(--danger)';
                                    icon = <XCircle size={18} color="var(--danger)" style={{ flexShrink: 0 }} />;
                                }

                                return (
                                    <div key={idx} style={{
                                        display: 'flex', alignItems: 'center', gap: '1rem',
                                        padding: '1rem 1.25rem',
                                        background: bg,
                                        border: `1px solid ${border}`,
                                        borderRadius: 'var(--radius-md)',
                                        color: textColor,
                                        fontWeight: isCorrect || isUserChoice ? 600 : 400,
                                        transition: 'all 0.2s',
                                    }}>
                                        <span style={{
                                            width: 28, height: 28, borderRadius: '50%',
                                            background: isCorrect ? 'rgba(16,185,129,0.2)' : isUserChoice ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
                                            border: `1px solid ${border}`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.8rem', fontWeight: 700, flexShrink: 0,
                                        }}>
                                            {String.fromCharCode(65 + idx)}
                                        </span>
                                        <span style={{ flex: 1, fontSize: '0.95rem' }}>{opt}</span>
                                        {icon}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Subjective — show user's written answer */}
                    {!isObjective && (
                        <div style={{ marginBottom: '2rem' }}>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Answer</div>
                            <div style={{
                                padding: '1.25rem', background: 'var(--bg-tertiary)',
                                border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)',
                                color: userAnswer ? 'var(--text-primary)' : 'var(--text-tertiary)',
                                lineHeight: 1.7, fontSize: '0.95rem', minHeight: '100px',
                                whiteSpace: 'pre-wrap',
                            }}>
                                {userAnswer || 'No answer provided.'}
                            </div>
                        </div>
                    )}

                    {/* Navigation */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '1.5rem', borderTop: '1px solid var(--glass-border)', marginTop: 'auto' }}>
                        <button
                            onClick={() => setCurrentQ(prev => Math.max(0, prev - 1))}
                            disabled={currentQ === 0}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.75rem 1.5rem',
                                background: 'var(--bg-tertiary)',
                                borderRadius: 'var(--radius-full)',
                                opacity: currentQ === 0 ? 0.4 : 1,
                                cursor: currentQ === 0 ? 'not-allowed' : 'pointer',
                                color: 'var(--text-primary)',
                                fontWeight: 500,
                                border: '1px solid var(--glass-border)',
                            }}
                        >
                            <ArrowLeft size={16} /> Previous
                        </button>
                        <button
                            onClick={() => setCurrentQ(prev => Math.min(questions.length - 1, prev + 1))}
                            disabled={currentQ === questions.length - 1}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.75rem 1.5rem',
                                background: 'var(--accent-primary)',
                                color: 'white',
                                borderRadius: 'var(--radius-full)',
                                opacity: currentQ === questions.length - 1 ? 0.4 : 1,
                                cursor: currentQ === questions.length - 1 ? 'not-allowed' : 'pointer',
                                fontWeight: 500,
                            }}
                        >
                            Next <ArrowRight size={16} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
