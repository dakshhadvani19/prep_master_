import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { domains, examPrompts } from '../data/mockData';
import { ChevronLeft, Book, Target, Activity, Flame, Shield } from 'lucide-react';

export default function SubjectDetails() {
    const { courseId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [difficulty, setDifficulty] = useState('medium'); // easy, medium, hard

    // Handle smooth scrolling to hash if searching specifically for a subject
    useEffect(() => {
        if (location.hash) {
            const id = location.hash.replace('#', '');
            setTimeout(() => {
                const element = document.getElementById(id);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    element.style.boxShadow = '0 0 20px rgba(59, 130, 246, 0.4)';
                    element.style.transition = 'box-shadow 0.5s ease-out';
                    setTimeout(() => {
                        element.style.boxShadow = 'var(--shadow-md)';
                    }, 2000);
                }
            }, 100);
        } else {
            window.scrollTo(0, 0);
        }
    }, [location.hash, courseId]);

    // Find the required course
    let currentCourse = null;
    for (const domain of domains) {
        const found = domain.courses.find(c => c.id === courseId);
        if (found) {
            currentCourse = found;
            break;
        }
    }

    if (!currentCourse) {
        return <div className="container" style={{ textAlign: 'center', marginTop: '4rem' }}><h2>Course not found</h2></div>;
    }

    return (
        <div className="container animate-fade-in">
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
                <ChevronLeft size={16} /> Back to Programs
            </button>

            <header style={{ marginBottom: '2rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                    <div style={{
                        background: 'var(--accent-light)',
                        color: 'var(--accent-primary)',
                        padding: '0.5rem',
                        borderRadius: 'var(--radius-md)'
                    }}>
                        <Book size={24} />
                    </div>
                    <h1 style={{ fontSize: '2.5rem' }}>{currentCourse.title}</h1>
                </div>
                <p style={{ color: 'var(--text-secondary)' }}>Configure your examination environment below.</p>
            </header>

            {/* Difficulty Selector */}
            <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
                <h3 style={{ marginBottom: '1.5rem', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Activity size={20} color="var(--accent-primary)" /> Global Difficulty Level
                </h3>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    {[
                        { id: 'easy', label: 'Easy', icon: Shield, color: 'var(--success)', desc: 'Fundamental concepts' },
                        { id: 'medium', label: 'Medium', icon: Activity, color: 'var(--warning)', desc: 'Standard curriculum' },
                        { id: 'hard', label: 'Hard', icon: Flame, color: 'var(--danger)', desc: 'Advanced problem solving' }
                    ].map(level => {
                        const Icon = level.icon;
                        const isSelected = difficulty === level.id;
                        return (
                            <button
                                key={level.id}
                                onClick={() => setDifficulty(level.id)}
                                style={{
                                    flex: '1',
                                    minWidth: '200px',
                                    padding: '1.5rem',
                                    background: isSelected ? `rgba(${level.color === 'var(--success)' ? '16, 185, 129' : level.color === 'var(--warning)' ? '245, 158, 11' : '239, 68, 68'}, 0.1)` : 'var(--bg-tertiary)',
                                    border: `1px solid ${isSelected ? level.color : 'var(--glass-border)'}`,
                                    borderRadius: 'var(--radius-md)',
                                    textAlign: 'left',
                                    transition: 'all var(--transition-fast)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.5rem'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: isSelected ? level.color : 'var(--text-primary)', fontWeight: 600, fontSize: '1.1rem' }}>
                                    <Icon size={20} /> {level.label}
                                </div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{level.desc}</div>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {/* We group by semesters simply by showing them all for now */}
                {currentCourse.subjects.map(subject => (
                    <div key={subject.id} id={subject.id} className="glass-panel" style={{ padding: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                            <div>
                                <span style={{
                                    color: 'var(--accent-primary)',
                                    fontWeight: 600,
                                    fontSize: '0.85rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em'
                                }}>
                                    Semester {subject.sem}
                                </span>
                                <h3 style={{ fontSize: '1.5rem', marginTop: '0.25rem' }}>{subject.title}</h3>
                            </div>
                        </div>

                        <h4 style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Available Examinations</h4>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                            gap: '1rem'
                        }}>
                            {subject.exams.map(examType => {
                                const examInfo = examPrompts[examType];
                                return (
                                    <Link
                                        key={examType}
                                        to={`/exams/${subject.id}/${examType}/${difficulty}`}
                                        style={{
                                            padding: '1.25rem',
                                            background: 'var(--bg-tertiary)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: 'var(--radius-md)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '1rem',
                                            transition: 'all var(--transition-fast)',
                                            cursor: 'pointer'
                                        }}
                                        onMouseOver={e => {
                                            e.currentTarget.style.borderColor = 'var(--accent-primary)';
                                            e.currentTarget.style.background = 'var(--bg-secondary)';
                                        }}
                                        onMouseOut={e => {
                                            e.currentTarget.style.borderColor = 'var(--border-color)';
                                            e.currentTarget.style.background = 'var(--bg-tertiary)';
                                        }}
                                    >
                                        <div style={{
                                            width: '40px',
                                            height: '40px',
                                            borderRadius: '50%',
                                            background: 'var(--accent-light)',
                                            color: 'var(--accent-primary)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            <Target size={20} />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{examInfo.title}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                                                {examInfo.timeMinutes} mins • {examInfo.totalMarks} Marks
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
