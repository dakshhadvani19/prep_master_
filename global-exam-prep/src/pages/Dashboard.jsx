import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { domains, examPrompts } from '../data/mockData';
import { Award, Clock, ArrowLeft, Target, BookOpen } from 'lucide-react';

export default function Dashboard() {
    const [history, setHistory] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        const rawHistory = localStorage.getItem('userExamHistory');
        if (rawHistory) {
            // Sort newest first
            setHistory(JSON.parse(rawHistory).sort((a, b) => b.id - a.id));
        }
    }, []);

    const getSubjectName = (subjectId) => {
        for (const d of domains) {
            for (const c of d.courses) {
                const sub = c.subjects.find(s => s.id === subjectId);
                if (sub) return sub.title;
            }
        }
        return 'Unknown Subject';
    };

    const getExamName = (examType) => {
        return examPrompts[examType]?.title || examType;
    };

    return (
        <div className="container animate-fade-in" style={{ maxWidth: '900px' }}>
            <button
                onClick={() => navigate(-1)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    color: 'var(--text-secondary)',
                    marginBottom: '2rem',
                    fontSize: '0.9rem'
                }}
            >
                <ArrowLeft size={16} /> Back
            </button>

            <header style={{ marginBottom: '3rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{
                    background: 'var(--accent-light)',
                    color: 'var(--accent-primary)',
                    padding: '1rem',
                    borderRadius: 'var(--radius-md)'
                }}>
                    <Award size={32} />
                </div>
                <div>
                    <h1 style={{ fontSize: '2.5rem' }}>Performance History</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Review your past examinations and progress.</p>
                </div>
            </header>

            {history.length === 0 ? (
                <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center' }}>
                    <BookOpen size={48} color="var(--text-secondary)" style={{ margin: '0 auto 1.5rem auto' }} />
                    <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>No Exams Taken Yet</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                        It looks like you haven't completed any exams. Start exploring courses and test your knowledge!
                    </p>
                    <Link
                        to="/"
                        style={{
                            background: 'var(--accent-primary)',
                            color: 'white',
                            padding: '0.75rem 2rem',
                            borderRadius: 'var(--radius-full)',
                            fontWeight: 600,
                            display: 'inline-block'
                        }}
                    >
                        Explore Courses
                    </Link>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {history.map((record) => {
                        const date = new Date(record.date).toLocaleDateString('en-US', {
                            year: 'numeric', month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                        });

                        // If it's objective, we have a score. Otherwise it's subjective
                        const isScored = record.type === 'objective' && record.score !== null;
                        const percentage = isScored ? (record.score / record.totalMarks) * 100 : null;

                        let statusColor = 'var(--text-secondary)';
                        if (isScored) {
                            if (percentage >= 80) statusColor = 'var(--success)';
                            else if (percentage >= 50) statusColor = 'var(--warning)';
                            else statusColor = 'var(--danger)';
                        }

                        return (
                            <div key={record.id} className="glass-panel" style={{
                                padding: '1.5rem 2rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                transition: 'transform var(--transition-fast)'
                            }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                                        <h3 style={{ fontSize: '1.25rem' }}>{getSubjectName(record.subjectId)}</h3>
                                        <span style={{
                                            background: 'var(--bg-tertiary)',
                                            padding: '0.25rem 0.75rem',
                                            borderRadius: 'var(--radius-full)',
                                            fontSize: '0.75rem',
                                            textTransform: 'uppercase',
                                            color: 'var(--text-secondary)',
                                            border: '1px solid var(--border-color)'
                                        }}>
                                            {record.difficulty}
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', gap: '1.5rem', color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <Target size={14} /> {getExamName(record.examType)}
                                        </span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <Clock size={14} /> {date}
                                        </span>
                                    </div>
                                </div>

                                <div style={{ textAlign: 'right', minWidth: '150px' }}>
                                    {isScored ? (
                                        <>
                                            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: statusColor }}>
                                                {record.score} <span style={{ fontSize: '1rem', color: 'var(--text-secondary)', fontWeight: 400 }}>/ {record.totalMarks}</span>
                                            </div>
                                            <div style={{ color: statusColor, fontSize: '0.85rem', fontWeight: 600 }}>
                                                {percentage >= 50 ? 'Passed' : 'Needs Review'}
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--accent-primary)' }}>
                                                Subjective
                                            </div>
                                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                                Manual Grading Req.
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
