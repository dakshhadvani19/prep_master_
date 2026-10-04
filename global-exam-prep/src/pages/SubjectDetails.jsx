import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { examPrompts, DEFAULT_EXAM_TYPES } from '../data/examPrompts';
import { fetchCourseAndSubjects } from '../utils/catalogApi';
import {
    ChevronLeft, Book, Target, Activity, Flame, Shield,
    Cpu, Upload, ArrowRight, BookOpen, GraduationCap, Loader
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

    const [currentCourse, setCurrentCourse] = useState(null);
    const [subjects, setSubjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        setCurrentCourse(null);
        setSubjects([]);
        setSelectedSem(null);
        setSelectedSubject(null);
        setSelectedExamType(null);
        setSelectedMode(null);

        fetchCourseAndSubjects(courseId).then((result) => {
            if (cancelled) return;
            if (result.error) {
                setError(result.error.message || 'Could not load this course.');
                setLoading(false);
                return;
            }
            setCurrentCourse(result.course);
            setSubjects((result.subjects || []).map((s) => ({
                id: s.subjectId,
                title: s.subjectName,
                sem: s.sem,
                exams: DEFAULT_EXAM_TYPES,
            })));
            setUnmapped(result.unmapped || []);
            setLoading(false);
        }).catch((err) => {
            if (cancelled) return;
            setError(err.message || 'Could not load this course.');
            setLoading(false);
        });

        return () => { cancelled = true; };
    }, [courseId]);

    const semesters = useMemo(() => {
        return [...new Set((currentCourse?.sems || []).map(Number))]
            .filter((sem) => Number.isFinite(sem))
            .sort((a, b) => a - b);
    }, [currentCourse]);

    const subjectsInSem = useMemo(() => {
        if (!selectedSem && selectedSem !== 0) return [];
        return subjects.filter(s => s.sem === selectedSem);
    }, [subjects, selectedSem]);

    useEffect(() => {
        if (!location.hash || !subjects.length) return;
        const subjectId = location.hash.replace('#', '');
        const subject = subjects.find(s => String(s.id) === String(subjectId));
        if (subject) {
            setSelectedSem(subject.sem);
            setTimeout(() => {
                setSelectedSubject(subject);
            }, 150);
        } else {
            window.scrollTo(0, 0);
        }
    }, [location.hash, subjects]);

    if (loading) {
        return (
            <div className="container" style={{ marginTop: '4rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-secondary)' }}>
                <Loader size={22} className="spinner" style={{ color: 'var(--accent-primary)' }} />
                <span data-testid="catalog-loading">Loading subjects…</span>
            </div>
        );
    }

    if (error || !currentCourse) {
        return (
            <div className="container" style={{ textAlign: 'center', marginTop: '4rem' }} data-testid="catalog-error">
                <BookOpen size={48} style={{ color: 'var(--text-secondary)', margin: '0 auto 1rem', display: 'block' }} />
                <h2>{error && error !== 'Course not found.' ? 'Could not load course' : 'Course not found'}</h2>
                {error && error !== 'Course not found.' && (
                    <p style={{ color: 'var(--text-secondary)', marginTop: '0.75rem' }}>{error}</p>
                )}
            </div>
        );
    }

    const handleStartExam = () => {
        if (!selectedSubject || !selectedExamType || !selectedMode || !selectedDifficulty) return;
        navigate(
            `/exams/${selectedSubject.id}/${selectedExamType}/${selectedDifficulty}`,
            { state: { examMode: selectedMode } }
        );
    };

    const canStart = selectedSubject && selectedExamType && selectedMode && selectedDifficulty;

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
            <button
                onClick={() => navigate(-1)}
                style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.9rem'
                }}
            >
                <ChevronLeft size={16} /> Back to Programs
            </button>

            <header style={{ marginBottom: '2.5rem', paddingBottom: '2rem', borderBottom: '1px solid var(--glass-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                    <div style={{ background: 'var(--accent-light)', color: 'var(--accent-primary)', padding: '0.6rem', borderRadius: 'var(--radius-md)' }}>
                        <GraduationCap size={24} />
                    </div>
                    <h1 style={{ fontSize: '2rem' }}>{currentCourse.courseName}</h1>
                </div>
                <p style={{ color: 'var(--text-secondary)', marginLeft: '0.25rem' }}>
                    {semesters.length} Semesters · {subjects.length} Subjects
                </p>
            </header>

            {!loading && subjects.length === 0 && (
                <div data-testid="catalog-empty" className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No subjects are listed for this course yet.
                </div>
            )}

            {subjects.length > 0 && (
            <section style={{ marginBottom: '2.5rem' }}>
                <h2 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem' }}>
                    Step 1 — Select Semester
                </h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                    {semesters.map(sem => {
                        const isSelected = selectedSem === sem;
                        const count = subjects.filter(s => s.sem === sem).length;
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
            )}

            {selectedSem != null && (
                <section style={{ marginBottom: '2.5rem', animation: 'fadeIn 0.3s ease' }}>
                    <h2 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem' }}>
                        Step 2 — Select Subject
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {subjectsInSem.map((subject, idx) => {
                            const isOpen = selectedSubject?.id === subject.id;
                            return (
                                <div key={`${subject.id}-${idx}`} id={String(subject.id)}>
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

                                            {selectedExamType && (
                                                <div style={{ animation: 'fadeIn 0.2s ease' }}>
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
                                                                                background: isSel ? `${level.color}1a` : 'var(--bg-tertiary)',
                                                                                color: isSel ? level.color : 'var(--text-secondary)',
                                                                                borderRadius: 'var(--radius-md)',
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