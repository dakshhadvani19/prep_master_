import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { domains, examPrompts } from '../data/mockData';
import {
    ChevronLeft, Book, Target, Activity, Flame, Shield,
    Cpu, Upload, ArrowRight, BookOpen, GraduationCap
} from 'lucide-react';

const DIFFICULTY_LEVELS = [
    { id: 'easy', label: 'Easy', icon: Shield, color: '#10b981', desc: 'Fundamental concepts' },
    { id: 'medium', label: 'Medium', icon: Activity, color: '#f59e0b', desc: 'Standard curriculum' },
    { id: 'hard', label: 'Hard', icon: Flame, color: '#ef4444', desc: 'Advanced problem solving' },
];

export default function SubjectDetails() {
    const { courseId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();

    const [selectedSem, setSelectedSem] = useState(null);
    const [selectedSubject, setSelectedSubject] = useState(null);
    const [selectedExamType, setSelectedExamType] = useState(null);
    const [selectedMode, setSelectedMode] = useState(null); // 'auto' | 'upload'
    const [selectedDifficulty, setSelectedDifficulty] = useState('medium');

    // Find the required course
    let currentCourse = null;
    for (const domain of domains) {
        const found = domain.courses.find(c => c.id === courseId);
        if (found) { currentCourse = found; break; }
    }

    // Derive sorted list of unique semesters
    const semesters = useMemo(() => {
        if (!currentCourse) return [];
        return [...new Set(currentCourse.subjects.map(s => s.sem))].sort((a, b) => a - b);
    }, [currentCourse]);

    // Subjects for selected semester
    const subjectsInSem = useMemo(() => {
        if (!currentCourse || !selectedSem) return [];
        return currentCourse.subjects.filter(s => s.sem === selectedSem);
    }, [currentCourse, selectedSem]);

    // Handle hash scroll for search deep-link: e.g. /courses/btech-ce/subjects#01ce1101
    useEffect(() => {
        if (!location.hash || !currentCourse) return;
        const subjectId = location.hash.replace('#', '');
        const subject = currentCourse.subjects.find(s => s.id === subjectId);
        if (subject) {
            setSelectedSem(subject.sem);
            // Scroll after render
            setTimeout(() => {
                setSelectedSubject(subject);
            }, 150);
        } else {
            window.scrollTo(0, 0);
        }
    }, [location.hash, courseId]);

    if (!currentCourse) {
        return (
            <div className="container" style={{ textAlign: 'center', marginTop: '4rem' }}>
                <BookOpen size={48} style={{ color: 'var(--text-secondary)', margin: '0 auto 1rem', display: 'block' }} />
                <h2>Course not found</h2>
            </div>
        );
    }

    // Navigate to ExamPortal with mode pre-selected
    const handleStartExam = () => {
        if (!selectedSubject || !selectedExamType || !selectedMode || !selectedDifficulty) return;
        navigate(
            `/exams/${selectedSubject.id}/${selectedExamType}/${selectedDifficulty}`,
            { state: { examMode: selectedMode } }
        );
    };

    const canStart = selectedSubject && selectedExamType && selectedMode && selectedDifficulty;

    // ── STEP BACK helpers ──
    const handleSemClick = (sem) => {
        setSelectedSem(sem);
        setSelectedSubject(null);
        setSelectedExamType(null);
        setSelectedMode(null);
    };

    const handleSubjectClick = (subject) => {
        if (selectedSubject?.id === subject.id) {
            setSelectedSubject(null);
            setSelectedExamType(null);
            setSelectedMode(null);
        } else {
            setSelectedSubject(subject);
            setSelectedExamType(null);
            setSelectedMode(null);
        }
    };

    return (
        <div className="container animate-fade-in" style={{ maxWidth: '960px' }}>
            {/* ── Back Button ── */}
            <button
                onClick={() => navigate(-1)}
                style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.9rem'
                }}
            >
                <ChevronLeft size={16} /> Back to Programs
            </button>

            {/* ── Course Header ── */}
            <header style={{ marginBottom: '2.5rem', paddingBottom: '2rem', borderBottom: '1px solid var(--glass-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                    <div style={{ background: 'var(--accent-light)', color: 'var(--accent-primary)', padding: '0.6rem', borderRadius: 'var(--radius-md)' }}>
                        <GraduationCap size={24} />
                    </div>
                    <h1 style={{ fontSize: '2rem' }}>{currentCourse.title}</h1>
                </div>
                <p style={{ color: 'var(--text-secondary)', marginLeft: '0.25rem' }}>
                    {semesters.length} Semesters · {currentCourse.subjects.length} Subjects
                </p>
            </header>

            {/* ── STEP 1: Semester Selector ── */}
            <section style={{ marginBottom: '2.5rem' }}>
                <h2 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem' }}>
                    Step 1 — Select Semester
                </h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                    {semesters.map(sem => {
                        const isSelected = selectedSem === sem;
                        const count = currentCourse.subjects.filter(s => s.sem === sem).length;
                        return (
                            <button
                                key={sem}
                                onClick={() => handleSemClick(sem)}
                                style={{
                                    padding: '0.75rem 1.5rem',
                                    borderRadius: 'var(--radius-md)',
                                    border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--glass-border)'}`,
                                    background: isSelected ? 'var(--accent-light)' : 'var(--bg-tertiary)',
                                    color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)',
                                    fontWeight: 600,
                                    fontSize: '0.95rem',
                                    cursor: 'pointer',
                                    transition: 'all var(--transition-fast)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    minWidth: '100px',
                                }}
                            >
                                <span>Sem {sem}</span>
                                <span style={{ fontSize: '0.72rem', color: isSelected ? 'var(--accent-primary)' : 'var(--text-tertiary)', fontWeight: 400 }}>
                                    {count} subject{count !== 1 ? 's' : ''}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </section>

            {/* ── STEP 2: Subject List ── */}
            {selectedSem && (
                <section style={{ marginBottom: '2.5rem', animation: 'fadeIn 0.3s ease' }}>
                    <h2 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem' }}>
                        Step 2 — Select Subject
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {subjectsInSem.map((subject, idx) => {
                            const isOpen = selectedSubject?.id === subject.id;
                            return (
                                <div key={`${subject.id}-${idx}`} id={subject.id}>
                                    {/* Subject Toggle Button */}
                                    <button
                                        onClick={() => handleSubjectClick(subject)}
                                        style={{
                                            width: '100%',
                                            padding: '1.1rem 1.5rem',
                                            background: isOpen ? 'var(--accent-light)' : 'var(--bg-secondary)',
                                            border: `1px solid ${isOpen ? 'var(--accent-primary)' : 'var(--glass-border)'}`,
                                            borderRadius: isOpen ? 'var(--radius-md) var(--radius-md) 0 0' : 'var(--radius-md)',
                                            color: isOpen ? 'var(--accent-primary)' : 'var(--text-primary)',
                                            fontWeight: 600,
                                            fontSize: '1rem',
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                            transition: 'all var(--transition-fast)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '1rem',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <Book size={18} style={{ flexShrink: 0 }} />
                                            {subject.title}
                                        </div>
                                        <ChevronLeft
                                            size={18}
                                            style={{
                                                transform: isOpen ? 'rotate(-90deg)' : 'rotate(180deg)',
                                                transition: 'transform 0.25s ease',
                                                flexShrink: 0
                                            }}
                                        />
                                    </button>

                                    {/* ── STEP 3: Exam Type + Mode + Difficulty (inline) ── */}
                                    {isOpen && (
                                        <div
                                            style={{
                                                border: '1px solid var(--accent-primary)',
                                                borderTop: 'none',
                                                borderRadius: '0 0 var(--radius-md) var(--radius-md)',
                                                background: 'var(--bg-secondary)',
                                                padding: '1.5rem',
                                                animation: 'fadeIn 0.25s ease',
                                            }}
                                        >
                                            {/* Exam Type */}
                                            <p style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-tertiary)', marginBottom: '0.75rem' }}>
                                                Choose Exam Type
                                            </p>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1.5rem' }}>
                                                {subject.exams.map(examType => {
                                                    const info = examPrompts[examType];
                                                    const isSel = selectedExamType === examType;
                                                    return (
                                                        <button
                                                            key={examType}
                                                            onClick={() => { setSelectedExamType(examType); setSelectedMode(null); }}
                                                            style={{
                                                                padding: '0.6rem 1.2rem',
                                                                borderRadius: 'var(--radius-full)',
                                                                border: `1px solid ${isSel ? 'var(--accent-primary)' : 'var(--glass-border)'}`,
                                                                background: isSel ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                                                                color: isSel ? 'white' : 'var(--text-primary)',
                                                                fontWeight: 600,
                                                                fontSize: '0.875rem',
                                                                cursor: 'pointer',
                                                                transition: 'all var(--transition-fast)',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '0.5rem',
                                                            }}
                                                        >
                                                            <Target size={14} />
                                                            {info?.title || examType}
                                                            <span style={{ opacity: 0.7, fontWeight: 400, fontSize: '0.78rem' }}>
                                                                {info?.timeMinutes}m · {info?.totalMarks}M
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            {/* Mode + Difficulty (shown after exam type selected) */}
                                            {selectedExamType && (
                                                <div style={{ animation: 'fadeIn 0.2s ease' }}>
                                                    {/* Mode Selection */}
                                                    <p style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-tertiary)', marginBottom: '0.75rem' }}>
                                                        Choose Mode
                                                    </p>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                                        {[
                                                            { id: 'auto', label: 'Auto AI Exam', desc: 'AI generates questions from syllabus', icon: Cpu, color: 'var(--accent-primary)' },
                                                            { id: 'upload', label: 'Upload File', desc: 'AI reads your notes/PDF', icon: Upload, color: '#8b5cf6' },
                                                        ].map(mode => {
                                                            const Icon = mode.icon;
                                                            const isSel = selectedMode === mode.id;
                                                            return (
                                                                <button
                                                                    key={mode.id}
                                                                    onClick={() => setSelectedMode(mode.id)}
                                                                    style={{
                                                                        flex: '1',
                                                                        minWidth: '200px',
                                                                        padding: '1rem 1.25rem',
                                                                        border: `1px solid ${isSel ? mode.color : 'var(--glass-border)'}`,
                                                                        borderRadius: 'var(--radius-md)',
                                                                        background: isSel ? `${mode.color}1a` : 'var(--bg-tertiary)',
                                                                        color: isSel ? mode.color : 'var(--text-primary)',
                                                                        cursor: 'pointer',
                                                                        textAlign: 'left',
                                                                        transition: 'all var(--transition-fast)',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '0.75rem',
                                                                    }}
                                                                >
                                                                    <Icon size={20} style={{ flexShrink: 0 }} />
                                                                    <div>
                                                                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{mode.label}</div>
                                                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '0.15rem' }}>{mode.desc}</div>
                                                                    </div>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>

                                                    {/* Difficulty Selection */}
                                                    {selectedMode && (
                                                        <div style={{ animation: 'fadeIn 0.2s ease' }}>
                                                            <p style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-tertiary)', marginBottom: '0.75rem' }}>
                                                                Choose Difficulty
                                                            </p>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1.5rem' }}>
                                                                {DIFFICULTY_LEVELS.map(level => {
                                                                    const Icon = level.icon;
                                                                    const isSel = selectedDifficulty === level.id;
                                                                    return (
                                                                        <button
                                                                            key={level.id}
                                                                            onClick={() => setSelectedDifficulty(level.id)}
                                                                            style={{
                                                                                flex: '1',
                                                                                minWidth: '130px',
                                                                                padding: '0.75rem 1rem',
                                                                                border: `1px solid ${isSel ? level.color : 'var(--glass-border)'}`,
                                                                                borderRadius: 'var(--radius-md)',
                                                                                background: isSel ? `${level.color}1a` : 'var(--bg-tertiary)',
                                                                                color: isSel ? level.color : 'var(--text-secondary)',
                                                                                cursor: 'pointer',
                                                                                fontWeight: 600,
                                                                                transition: 'all var(--transition-fast)',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                gap: '0.5rem',
                                                                            }}
                                                                        >
                                                                            <Icon size={16} />
                                                                            <div>
                                                                                <div style={{ fontSize: '0.9rem' }}>{level.label}</div>
                                                                                <div style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--text-tertiary)' }}>{level.desc}</div>
                                                                            </div>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>

                                                            {/* Start Exam Button */}
                                                            <button
                                                                onClick={handleStartExam}
                                                                disabled={!canStart}
                                                                style={{
                                                                    width: '100%',
                                                                    padding: '1rem',
                                                                    borderRadius: 'var(--radius-full)',
                                                                    background: canStart ? 'var(--accent-gradient)' : 'var(--bg-tertiary)',
                                                                    color: canStart ? 'white' : 'var(--text-tertiary)',
                                                                    fontWeight: 700,
                                                                    fontSize: '1.05rem',
                                                                    cursor: canStart ? 'pointer' : 'not-allowed',
                                                                    transition: 'all 0.2s',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    gap: '0.6rem',
                                                                    boxShadow: canStart ? 'var(--shadow-glow)' : 'none',
                                                                }}
                                                            >
                                                                <ArrowRight size={18} />
                                                                Start Exam
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(6px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}

