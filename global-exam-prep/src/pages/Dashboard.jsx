import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { domains, examPrompts } from '../data/mockData';
import {
    Award, Clock, ArrowLeft, Target, BookOpen, Search, CheckCircle,
    BarChart3, RefreshCw, BookMarked, Loader,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getExamHistory } from '../utils/examHistoryStorage';
import {
    getMyAttempts, reconcileTestRoomAttempts, getDashboardPerformanceSummary,
} from '../utils/supabaseExam';
import './Dashboard.css';

export default function Dashboard() {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [justSubmitted, setJustSubmitted] = useState(false);
    const [performance, setPerformance] = useState(null);
    const [performanceLoading, setPerformanceLoading] = useState(false);
    const [performanceError, setPerformanceError] = useState('');
    const [performanceRetry, setPerformanceRetry] = useState(0);
    const navigate = useNavigate();
    const location = useLocation();
    const { currentUser } = useAuth();

    useEffect(() => {
        if (!currentUser?.uid) {
            setHistory([]);
            setLoading(false);
            return undefined;
        }

        let cancelled = false;
        let firstLoad = true;
        let hasUnfinishedRoomAttempts = false;
        let bannerTimer = null;
        const localHistory = getExamHistory(currentUser.uid);

        if (location.state?.justSubmitted) {
            setJustSubmitted(true);
            bannerTimer = setTimeout(() => setJustSubmitted(false), 5000);
        }

        const refreshHistory = async () => {
            if (cancelled) return;
            if (firstLoad) setLoading(true);
            try {
                // This finalizes rooms whose heartbeat stopped while the student
                // was disconnected; repeated calls are safe and do not duplicate rows.
                await reconcileTestRoomAttempts();
                const { attempts, error } = await getMyAttempts(100);
                if (error) throw new Error(error);

                const roomHistory = (attempts || [])
                    .filter((attempt) => (
                        attempt.attempt_type === 'test_room'
                        && !['waiting', 'cancelled'].includes(attempt.status)
                    ))
                    .map((attempt) => ({
                        id: attempt.id,
                        date: attempt.started_at || attempt.created_at,
                        subjectId: attempt.subject_code || attempt.subject_name,
                        subjectName: attempt.subject_name,
                        examType: attempt.exam_type,
                        difficulty: attempt.difficulty || 'medium',
                        type: 'objective',
                        score: attempt.score === null || attempt.score === undefined ? null : Number(attempt.score),
                        totalMarks: Number(attempt.total_marks || 30),
                        questions: Array.isArray(attempt.questions) ? attempt.questions : [],
                        userAnswers: attempt.answers || [],
                        attemptType: 'test_room',
                        status: attempt.status,
                        endReason: attempt.end_reason,
                        correctCount: attempt.correct_count,
                        incorrectCount: attempt.incorrect_count,
                        attemptedCount: attempt.attempted_count,
                        unattemptedCount: attempt.unattempted_count,
                    }));

                hasUnfinishedRoomAttempts = roomHistory.some((attempt) => attempt.status === 'in_progress');
                if (!cancelled) {
                    setHistory([...localHistory, ...roomHistory].sort(
                        (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
                    ));
                }
            } catch (error) {
                console.warn('Could not load persisted Test Room attempts:', error.message);
                if (!cancelled) setHistory(localHistory);
            } finally {
                if (firstLoad) {
                    firstLoad = false;
                    if (!cancelled) setLoading(false);
                }
            }
        };

        refreshHistory();
        // An in-progress row may need the stale-heartbeat grace period to pass
        // before the dashboard can finalize it after a hard tab/browser close.
        const poll = setInterval(() => {
            if (hasUnfinishedRoomAttempts) refreshHistory();
        }, 15000);

        return () => {
            cancelled = true;
            clearInterval(poll);
            if (bannerTimer) clearTimeout(bannerTimer);
        };
    }, [currentUser?.uid, location.state?.justSubmitted]);

    useEffect(() => {
        if (!currentUser?.uid) {
            setPerformance(null);
            setPerformanceError('');
            setPerformanceLoading(false);
            return undefined;
        }

        let cancelled = false;
        setPerformanceLoading(true);
        setPerformanceError('');

        getDashboardPerformanceSummary().then(({ performance: result, error }) => {
            if (cancelled) return;
            if (error) {
                setPerformance(null);
                setPerformanceError(error);
                return;
            }
            setPerformance(result);
        }).catch((error) => {
            // The helper already logs provider errors; this is a defensive
            // guard for unexpected client-side failures.
            console.error('[dashboard] Unexpected performance summary failure:', error);
            if (!cancelled) {
                setPerformance(null);
                setPerformanceError('We could not load your performance summary right now. Please try again.');
            }
        }).finally(() => {
            if (!cancelled) setPerformanceLoading(false);
        });

        return () => { cancelled = true; };
    }, [currentUser?.uid, performanceRetry]);

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
        <div className="container animate-fade-in sd" style={{ maxWidth: '900px' }}>
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

            {/* Success Banner */}
            {justSubmitted && (
                <div style={{
                    background: 'rgba(16,185,129,0.12)',
                    border: '1px solid var(--success)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1rem 1.5rem',
                    marginBottom: '1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    color: 'var(--success)',
                    fontWeight: 500,
                }}>
                    <CheckCircle size={20} /> Exam submitted! Your result has been recorded below.
                </div>
            )}

            <header style={{
                marginBottom: '3rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                flexWrap: 'wrap'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                        background: 'var(--accent-light)',
                        color: 'var(--accent-primary)',
                        padding: '1rem',
                        borderRadius: 'var(--radius-md)'
                    }}>
                        <Award size={32} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '2rem' }}>Performance History</h1>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>Review your past examinations and progress.</p>
                    </div>
                </div>

                {/* Profile info on the right */}
                {currentUser && (
                    <div style={{
                        textAlign: 'right',
                        padding: '1rem',
                        background: 'var(--glass-bg)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: 'var(--radius-md)',
                        backdropFilter: 'blur(8px)',
                        minWidth: '200px'
                    }}>
                        <div style={{ fontWeight: 600, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                            {currentUser.displayName || 'User'}
                        </div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                            {currentUser.email}
                        </div>
                    </div>
                )}
            </header>

            <section className="sd-performance" aria-labelledby="sd-performance-title">
                <div className="sd-performance__header">
                    <div>
                        <span className="sd-performance__eyebrow">YOUR PROGRESS</span>
                        <h2 id="sd-performance-title">Performance overview</h2>
                        <p>Calculated from your verified, completed examination results.</p>
                    </div>
                    <button
                        type="button"
                        className="sd-performance__refresh"
                        onClick={() => setPerformanceRetry((value) => value + 1)}
                        disabled={performanceLoading}
                        aria-label="Refresh performance summary"
                    >
                        <RefreshCw size={16} />
                        <span>Refresh</span>
                    </button>
                </div>

                {performanceLoading ? (
                    <div className="sd-performance__loading" role="status" aria-live="polite">
                        <span className="sd-performance__skeleton sd-performance__skeleton--wide" />
                        <span className="sd-performance__skeleton" />
                        <span className="sd-performance__skeleton" />
                        <span className="sd-performance__skeleton" />
                        <span className="sd-performance__loading-copy">Loading verified results…</span>
                    </div>
                ) : performanceError ? (
                    <div className="sd-performance__error" role="alert">
                        <div>
                            <strong>Performance data is unavailable</strong>
                            <p>{performanceError}</p>
                        </div>
                        <button type="button" onClick={() => setPerformanceRetry((value) => value + 1)}>
                            Try again
                        </button>
                    </div>
                ) : performance?.hasResults ? (
                    <>
                        <div className="sd-performance__metrics">
                            <article className="sd-metric">
                                <span className="sd-metric__label">Completed exams</span>
                                <strong>{Number(performance.summary?.totalAttempts || 0).toLocaleString()}</strong>
                                <span className="sd-metric__detail">Normal exams and Test Rooms</span>
                            </article>
                            <article className="sd-metric sd-metric--gold">
                                <span className="sd-metric__label">Total score</span>
                                <strong>
                                    {Number(performance.summary?.totalScore || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                    <small> / {Number(performance.summary?.totalMaxMarks || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</small>
                                </strong>
                                <span className="sd-metric__detail">Across verified attempts</span>
                            </article>
                            <article className="sd-metric sd-metric--violet">
                                <span className="sd-metric__label">Overall percentage</span>
                                <strong>
                                    {Number(performance.summary?.overallPercentage || 0).toFixed(2)}
                                    <small>%</small>
                                </strong>
                                <span className="sd-metric__detail">Weighted by maximum marks</span>
                            </article>
                            <article className="sd-metric">
                                <span className="sd-metric__label">Subjects attempted</span>
                                <strong>{Number(performance.summary?.subjectsAttempted || 0).toLocaleString()}</strong>
                                <span className="sd-metric__detail">Distinct subjects with results</span>
                            </article>
                        </div>

                        {Array.isArray(performance.subjectPerformance) && performance.subjectPerformance.length > 0 && (
                            <div className="sd-subjects">
                                <div className="sd-subjects__header">
                                    <div>
                                        <h3>Subject performance</h3>
                                        <p>Your five most recently attempted subjects</p>
                                    </div>
                                    <BookMarked size={19} aria-hidden="true" />
                                </div>
                                <div className="sd-subjects__list">
                                    {performance.subjectPerformance.map((subject) => {
                                        const percentage = Math.min(100, Math.max(0, Number(subject.percentage) || 0));
                                        return (
                                            <div className="sd-subject" key={subject.subjectId}>
                                                <div className="sd-subject__top">
                                                    <div className="sd-subject__name">
                                                        <strong>{subject.subjectName}</strong>
                                                        <span>
                                                            Semester {subject.semester} · {subject.attempts} {Number(subject.attempts) === 1 ? 'attempt' : 'attempts'}
                                                        </span>
                                                    </div>
                                                    <div className="sd-subject__score">
                                                        <strong>{percentage.toFixed(2)}%</strong>
                                                        <span>
                                                            {Number(subject.totalScore).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                            {' / '}
                                                            {Number(subject.totalMaxMarks).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div
                                                    className="sd-subject__track"
                                                    role="progressbar"
                                                    aria-label={`${subject.subjectName} overall percentage`}
                                                    aria-valuemin={0}
                                                    aria-valuemax={100}
                                                    aria-valuenow={percentage}
                                                >
                                                    <span style={{ width: `${percentage}%` }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="sd-performance__empty">
                        <div className="sd-performance__empty-icon"><BarChart3 size={22} /></div>
                        <div>
                            <strong>No verified results yet</strong>
                            <p>Complete a scored exam to see your overall performance and subject breakdown here.</p>
                        </div>
                    </div>
                )}
            </section>

            {loading ? (
                <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center' }}>
                    <Loader size={36} color="var(--accent-primary)" style={{ margin: '0 auto 1rem auto', display: 'block', animation: 'spin 1s linear infinite' }} />
                    <p style={{ color: 'var(--text-secondary)' }}>Loading your history...</p>
                </div>
            ) : history.length === 0 ? (
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
                                        <h3 style={{ fontSize: '1.25rem' }}>{record.subjectName || getSubjectName(record.subjectId)}</h3>
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
                                        {record.attemptType === 'test_room' && (
                                            <span style={{ textTransform: 'capitalize', color: record.status === 'in_progress' ? 'var(--warning)' : 'var(--text-tertiary)' }}>
                                                Room attempt · {String(record.status || 'saved').replaceAll('_', ' ')}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div style={{ textAlign: 'right', minWidth: '150px' }}>
                                    {isScored ? (
                                        <>
                                            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: statusColor }}>
                                                {record.score} <span style={{ fontSize: '1rem', color: 'var(--text-secondary)', fontWeight: 400 }}>/ {record.totalMarks}</span>
                                            </div>
                                            <div style={{ color: statusColor, fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                                                {record.attemptType === 'test_room' && record.status !== 'submitted'
                                                    ? String(record.status).replaceAll('_', ' ')
                                                    : percentage >= 50 ? 'Passed' : 'Needs Review'}
                                            </div>
                                        </>
                                    ) : record.attemptType === 'test_room' ? (
                                        <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--warning)', marginBottom: '0.75rem' }}>
                                            {record.status === 'in_progress' ? 'Awaiting finalization' : 'Score unavailable'}
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--accent-primary)', marginBottom: '0.75rem' }}>
                                            Subjective
                                        </div>
                                    )}
                                    {record.questions && (record.attemptType !== 'test_room' || ['submitted', 'auto_submitted', 'disconnected', 'timed_out'].includes(record.status)) && (
                                        <Link
                                            to={`/review/${record.id}`}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.4rem',
                                                padding: '0.45rem 1rem',
                                                borderRadius: 'var(--radius-full)',
                                                fontSize: '0.8rem',
                                                fontWeight: 600,
                                                background: 'var(--accent-light)',
                                                color: 'var(--accent-primary)',
                                                border: '1px solid rgba(59,130,246,0.25)',
                                                transition: 'all 0.2s',
                                            }}
                                            onMouseOver={e => { e.currentTarget.style.background = 'var(--accent-primary)'; e.currentTarget.style.color = 'white'; }}
                                            onMouseOut={e => { e.currentTarget.style.background = 'var(--accent-light)'; e.currentTarget.style.color = 'var(--accent-primary)'; }}
                                        >
                                            <Search size={13} /> Review Answers
                                        </Link>
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
