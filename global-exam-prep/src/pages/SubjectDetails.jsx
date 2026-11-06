import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getExamTypesForSubject, getSubjectExamInfo, normalizeDepartmentalFlag } from '../utils/subjectExamPolicy';
import { CATALOG_CACHE_TTL_MS, fetchCourseAndSubjects } from '../utils/catalogApi';
import {
    Activity,
    AlertCircle,
    ArrowRight,
    BookOpen,
    ChevronLeft,
    ChevronRight,
    Cpu,
    Flame,
    GraduationCap,
    Layers3,
    LoaderCircle,
    Shield,
    Target,
    Upload,
    Users,
} from 'lucide-react';
import './Leaderboard.css';
import './CatalogFlow.css';

const DIFFICULTY_LEVELS = [
    { id: 'easy', label: 'Easy', icon: Shield, desc: 'Fundamental concepts' },
    { id: 'medium', label: 'Medium', icon: Activity, desc: 'Standard curriculum' },
    { id: 'hard', label: 'Hard', icon: Flame, desc: 'Advanced problem solving' },
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
        let refreshInFlight = false;
        setLoading(true);
        setError(null);
        setCurrentCourse(null);
        setSubjects([]);
        setSelectedSem(null);
        setSelectedSubject(null);
        setSelectedExamType(null);
        setSelectedMode(null);

        async function loadCatalog({ initial = false } = {}) {
            if (refreshInFlight || cancelled) return;
            refreshInFlight = true;
            try {
                const result = await fetchCourseAndSubjects(courseId, { forceRefresh: !initial });
                if (cancelled) return;
                if (result.error) {
                    if (initial) {
                        setError(result.error.message || 'Could not load this course.');
                        setLoading(false);
                    }
                    return;
                }

                const nextSubjects = (result.subjects || []).map((s) => ({
                    id: s.subjectId,
                    title: s.subjectName,
                    sem: s.sem,
                    isDepartmentalSubject: normalizeDepartmentalFlag(s.isDepartmentalSubject),
                }));
                setCurrentCourse(result.course);
                setSubjects(nextSubjects);
                setLoading(false);
                setError(null);
            } catch (err) {
                if (!cancelled && initial) {
                    setError(err.message || 'Could not load this course.');
                    setLoading(false);
                }
            } finally {
                refreshInFlight = false;
            }
        }

        loadCatalog({ initial: true });
        const refreshWhenVisible = () => {
            if (document.visibilityState === 'visible') loadCatalog();
        };
        const refreshTimer = window.setInterval(refreshWhenVisible, CATALOG_CACHE_TTL_MS);
        window.addEventListener('focus', refreshWhenVisible);
        document.addEventListener('visibilitychange', refreshWhenVisible);

        return () => {
            cancelled = true;
            window.clearInterval(refreshTimer);
            window.removeEventListener('focus', refreshWhenVisible);
            document.removeEventListener('visibilitychange', refreshWhenVisible);
        };
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
            <main className="lb catalog-flow">
                <div className="lb-loading" data-testid="catalog-loading">
                    <LoaderCircle size={22} className="lb-spin" />
                    Loading subjects…
                </div>
            </main>
        );
    }

    if (error || !currentCourse) {
        return (
            <main className="lb catalog-flow" data-testid="catalog-error">
                <div className="lb-alert" role="alert">
                    <AlertCircle size={19} />
                    <div>
                        <strong>{error && error !== 'Course not found.' ? 'Could not load course' : 'Course not found'}</strong>
                        {error && error !== 'Course not found.' && <p>{error}</p>}
                    </div>
                </div>
            </main>
        );
    }

    const handleStartExam = () => {
        if (!selectedSubject || !selectedExamType || !selectedMode || !selectedDifficulty) return;
        navigate(
            `/exams/${selectedSubject.id}/${selectedExamType}/${selectedDifficulty}`,
            { state: { examMode: selectedMode, isDepartmentalSubject: selectedSubject.isDepartmentalSubject } }
        );
    };

    const canStart = selectedSubject && selectedExamType && selectedMode && selectedDifficulty;
    const canUseTestRoom = Boolean(canStart && getSubjectExamInfo(selectedExamType, selectedSubject?.isDepartmentalSubject)?.type === 'objective');

    const handleCreateTestRoom = () => {
        if (!canUseTestRoom) return;
        const info = getSubjectExamInfo(selectedExamType, selectedSubject?.isDepartmentalSubject);
        navigate(
            `/exams/${selectedSubject.id}/${selectedExamType}/${selectedDifficulty}`,
            {
                state: {
                    examMode: selectedMode,
                    isDepartmentalSubject: selectedSubject.isDepartmentalSubject,
                    testRoomMode: 'create',
                    courseId: String(courseId),
                    subjectName: selectedSubject.title,
                    examTitle: info?.title || selectedExamType,
                    difficulty: selectedDifficulty,
                },
            }
        );
    };

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
        <main className="lb catalog-flow" data-testid="course-subject-browser">
            <button type="button" className="lb-back catalog-flow__back" onClick={() => navigate(-1)}>
                <ChevronLeft size={16} /> Back to Programs
            </button>

            <header className="lb-hero">
                <div className="lb-hero__copy">
                    <h1>{currentCourse.courseName}</h1>
                    <p>{semesters.length} Semesters · {subjects.length} Subjects</p>
                </div>
                <div className="lb-hero__mark" aria-hidden="true">
                    <GraduationCap size={27} strokeWidth={1.7} />
                </div>
            </header>

            {subjects.length === 0 && (
                <div data-testid="catalog-empty" className="lb-empty-state">
                    <span className="lb-empty-state__icon"><BookOpen size={21} /></span>
                    <h3>No subjects are listed for this course yet.</h3>
                </div>
            )}

            {subjects.length > 0 && (
                <section className="lb-browser catalog-flow__stage" aria-labelledby="catalog-semester-heading">
                    <div className="lb-browser__head">
                        <div>
                            <h2 id="catalog-semester-heading">Step 1 — Select Semester</h2>
                        </div>
                    </div>
                    <div className="lb-grid lb-grid--semesters catalog-flow__semester-grid">
                        {semesters.map((sem) => {
                            const isSelected = selectedSem === sem;
                            const count = subjects.filter((subject) => subject.sem === sem).length;
                            return (
                                <button
                                    key={sem}
                                    type="button"
                                    className={`lb-choice catalog-flow__semester ${isSelected ? 'is-selected' : ''}`}
                                    aria-pressed={isSelected}
                                    aria-label={`Sem ${sem}, ${count} subjects`}
                                    onClick={() => handleSemClick(sem)}
                                >
                                    <span className="lb-choice__icon" aria-hidden="true">
                                        <Layers3 size={21} strokeWidth={1.8} />
                                    </span>
                                    <span className="lb-choice__copy">
                                        <span className="lb-choice__title">Sem {sem}</span>
                                        <span className="lb-choice__sub">{count} subject{count !== 1 ? 's' : ''}</span>
                                    </span>
                                    {isSelected
                                        ? <span className="lb-tag lb-tag--selected">Selected</span>
                                        : <ChevronRight className="lb-choice__arrow" size={17} aria-hidden="true" />}
                                </button>
                            );
                        })}
                    </div>
                </section>
            )}

            {selectedSem != null && (
                <section className="lb-browser catalog-flow__stage catalog-flow__subject-stage" aria-labelledby="catalog-subject-heading">
                    <div className="lb-browser__head">
                        <div>
                            <h2 id="catalog-subject-heading">Step 2 — Select Subject</h2>
                        </div>
                    </div>

                    <div className="lb-grid lb-grid--subjects catalog-flow__subject-grid">
                        {subjectsInSem.map((subject, index) => {
                            const isOpen = selectedSubject?.id === subject.id;
                            return (
                                <div key={`${subject.id}-${index}`} id={String(subject.id)} className="catalog-flow__subject">
                                    <button
                                        type="button"
                                        className={`lb-choice catalog-flow__subject-trigger ${isOpen ? 'is-selected' : ''}`}
                                        aria-expanded={isOpen}
                                        aria-label={subject.title}
                                        onClick={() => handleSubjectClick(subject)}
                                    >
                                        <span className="lb-choice__icon" aria-hidden="true">
                                            <BookOpen size={20} strokeWidth={1.8} />
                                        </span>
                                        <span className="lb-choice__copy">
                                            <span className="lb-choice__title">{subject.title}</span>
                                        </span>
                                        <ChevronRight
                                            className="lb-choice__arrow"
                                            size={17}
                                            aria-hidden="true"
                                        />
                                    </button>

                                    {isOpen && (
                                        <div className="catalog-flow__subject-panel">
                                            <div className="catalog-flow__choice-group">
                                                <p className="catalog-flow__choice-label">Choose Exam Type</p>
                                                <div className="catalog-flow__chip-list">
                                                    {getExamTypesForSubject(subject.isDepartmentalSubject).map((examType) => {
                                                        const info = getSubjectExamInfo(examType, subject.isDepartmentalSubject);
                                                        const isSelected = selectedExamType === examType;
                                                        return (
                                                            <button
                                                                key={examType}
                                                                type="button"
                                                                className={`catalog-flow__chip ${isSelected ? 'is-selected' : ''}`}
                                                                aria-pressed={isSelected}
                                                                onClick={() => { setSelectedExamType(examType); setSelectedMode(null); }}
                                                            >
                                                                <Target size={15} aria-hidden="true" />
                                                                <span>{info?.title || examType}</span>
                                                                <small>{info?.timeMinutes}m · {info?.totalMarks}M</small>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {selectedExamType && (
                                                <div className="catalog-flow__choice-group">
                                                    <p className="catalog-flow__choice-label">Choose Mode</p>
                                                    <div className="catalog-flow__option-grid catalog-flow__option-grid--two">
                                                        {[
                                                            { id: 'auto', label: 'Auto AI Exam', desc: 'AI generates questions from syllabus', icon: Cpu },
                                                            { id: 'upload', label: 'Upload File', desc: 'AI reads your notes/PDF', icon: Upload },
                                                        ].map((mode) => {
                                                            const Icon = mode.icon;
                                                            const isSelected = selectedMode === mode.id;
                                                            return (
                                                                <button
                                                                    key={mode.id}
                                                                    type="button"
                                                                    className={`catalog-flow__option-card ${isSelected ? 'is-selected' : ''}`}
                                                                    aria-pressed={isSelected}
                                                                    onClick={() => setSelectedMode(mode.id)}
                                                                >
                                                                    <span className="lb-choice__icon" aria-hidden="true">
                                                                        <Icon size={19} strokeWidth={1.8} />
                                                                    </span>
                                                                    <span className="catalog-flow__option-copy">
                                                                        <strong>{mode.label}</strong>
                                                                        <small>{mode.desc}</small>
                                                                    </span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {selectedMode && (
                                                <div className="catalog-flow__choice-group">
                                                    <p className="catalog-flow__choice-label">Choose Difficulty</p>
                                                    <div className="catalog-flow__option-grid catalog-flow__option-grid--three">
                                                        {DIFFICULTY_LEVELS.map((level) => {
                                                            const Icon = level.icon;
                                                            const isSelected = selectedDifficulty === level.id;
                                                            return (
                                                                <button
                                                                    key={level.id}
                                                                    type="button"
                                                                    className={`catalog-flow__option-card ${isSelected ? 'is-selected' : ''}`}
                                                                    aria-pressed={isSelected}
                                                                    onClick={() => setSelectedDifficulty(level.id)}
                                                                >
                                                                    <span className="lb-choice__icon" aria-hidden="true">
                                                                        <Icon size={18} strokeWidth={1.8} />
                                                                    </span>
                                                                    <span className="catalog-flow__option-copy">
                                                                        <strong>{level.label}</strong>
                                                                        <small>{level.desc}</small>
                                                                    </span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>

                                                    <div className={`catalog-flow__actions ${canUseTestRoom ? 'has-secondary' : ''}`}>
                                                        <button
                                                            type="button"
                                                            onClick={handleStartExam}
                                                            disabled={!canStart}
                                                            className="catalog-flow__action catalog-flow__action--primary"
                                                        >
                                                            <ArrowRight size={18} aria-hidden="true" /> Start Exam
                                                        </button>
                                                        {canUseTestRoom && (
                                                            <button
                                                                type="button"
                                                                onClick={handleCreateTestRoom}
                                                                className="catalog-flow__action catalog-flow__action--secondary"
                                                            >
                                                                <Users size={18} aria-hidden="true" /> Create Test Room
                                                            </button>
                                                        )}
                                                    </div>
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
        </main>
    );
}
}
