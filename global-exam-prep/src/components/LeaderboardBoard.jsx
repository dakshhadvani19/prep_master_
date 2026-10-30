import { useEffect, useState } from 'react';
import {
    AlertCircle,
    BookOpen,
    LoaderCircle,
    RotateCcw,
    Trophy,
    UsersRound,
} from 'lucide-react';
import { getLeaderboardRankings } from '../utils/supabaseExam';

const PAGE_SIZE = 10;
const FRIENDLY_ERROR = 'We could not load this leaderboard right now. Please try again.';

function formatNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—';
}

function formatPercentage(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(2) : '—';
}

function EmptyState({ title, children }) {
    return (
        <div className="lb-empty-state">
            <span className="lb-empty-state__icon"><Trophy size={21} strokeWidth={1.8} /></span>
            <h3>{title}</h3>
            <p>{children}</p>
        </div>
    );
}

export default function LeaderboardBoard({ subject, isAdmin = false }) {
    const [leaderboard, setLeaderboard] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [examType, setExamType] = useState('');
    const [difficulty, setDifficulty] = useState('');
    const [attemptType, setAttemptType] = useState('');
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
        let active = true;
        setLoading(true);
        setError('');

        getLeaderboardRankings({
            subjectId: subject?.subjectId,
            examType: examType || null,
            difficulty: difficulty || null,
            attemptType: attemptType || null,
            limit: PAGE_SIZE,
            offset: 0,
        }).then((result) => {
            if (!active) return;
            if (result.error || !result.leaderboard
                || !Array.isArray(result.leaderboard.entries)) {
                setLeaderboard(null);
                setError(result.error || FRIENDLY_ERROR);
                return;
            }
            setLeaderboard(result.leaderboard);
        }).catch((requestError) => {
            // The utility already logs provider and network failures. Keep a final
            // component-level log for unexpected promise failures without exposing
            // the technical message in the UI.
            console.error('[leaderboard] Unexpected ranking UI failure:', requestError);
            if (!active) return;
            setLeaderboard(null);
            setError(FRIENDLY_ERROR);
        }).finally(() => {
            if (active) setLoading(false);
        });

        return () => { active = false; };
    }, [subject?.subjectId, examType, difficulty, attemptType, retryCount]);

    const filterOptions = leaderboard?.filterOptions || {};
    const entries = Array.isArray(leaderboard?.entries) ? leaderboard.entries.slice(0, PAGE_SIZE) : [];
    const viewer = leaderboard?.viewer || null;
    const participantCount = Number(leaderboard?.participantCount) || 0;
    const hasFilters = Boolean(examType || difficulty || attemptType);

    function clearFilters() {
        setExamType('');
        setDifficulty('');
        setAttemptType('');
    }

    return (
        <section className="lb-board" aria-labelledby="lb-board-heading" data-testid="lb-board">
            <div className="lb-board__header">
                <div>
                    <div className="lb-stage-kicker">VERIFIED RANKINGS</div>
                    <h3 id="lb-board-heading">{subject?.subjectName || 'Subject'} leaderboard</h3>
                    <p>
                        {isAdmin
                            ? 'Administrator preview of published and finalized student results.'
                            : 'Your position is calculated from finalized attempts recorded for this subject.'}
                    </p>
                </div>
                <button
                    type="button"
                    className="lb-board__refresh"
                    onClick={() => setRetryCount((value) => value + 1)}
                    disabled={loading}
                >
                    <RotateCcw size={15} /> Refresh
                </button>
            </div>

            <div className="lb-board__filters" aria-label="Leaderboard filters">
                <label>
                    <span>Exam type</span>
                    <select
                        aria-label="Filter by exam type"
                        value={examType}
                        onChange={(event) => {
                            setExamType(event.target.value);
                        }}
                    >
                        <option value="">All exam types</option>
                        {(Array.isArray(filterOptions.examTypes) ? filterOptions.examTypes : []).map((value) => (
                            <option key={value} value={value}>{value}</option>
                        ))}
                    </select>
                </label>
                <label>
                    <span>Difficulty</span>
                    <select
                        aria-label="Filter by difficulty"
                        value={difficulty}
                        onChange={(event) => {
                            setDifficulty(event.target.value);
                        }}
                    >
                        <option value="">All difficulties</option>
                        {(Array.isArray(filterOptions.difficulties) ? filterOptions.difficulties : []).map((value) => (
                            <option key={value} value={value}>{String(value).charAt(0).toUpperCase() + String(value).slice(1)}</option>
                        ))}
                    </select>
                </label>
                <label>
                    <span>Attempt source</span>
                    <select
                        aria-label="Filter by attempt source"
                        value={attemptType}
                        onChange={(event) => {
                            setAttemptType(event.target.value);
                        }}
                    >
                        <option value="">All attempt sources</option>
                        {(Array.isArray(filterOptions.attemptTypes) ? filterOptions.attemptTypes : []).map((value) => (
                            <option key={value} value={value}>
                                {value === 'test_room' ? 'Test Room' : value === 'exam' ? 'Exam' : value}
                            </option>
                        ))}
                    </select>
                </label>
                {hasFilters && (
                    <button type="button" className="lb-board__clear" onClick={clearFilters}>
                        Clear filters
                    </button>
                )}
            </div>

            {error && (
                <div className="lb-alert" role="alert" data-testid="lb-ranking-error">
                    <AlertCircle size={18} />
                    <div>
                        <strong>Leaderboard unavailable</strong>
                        <p>{error}</p>
                    </div>
                    <button type="button" onClick={() => setRetryCount((value) => value + 1)}>Retry</button>
                </div>
            )}

            {loading && (
                <div className="lb-loading" role="status" aria-live="polite">
                    <LoaderCircle className="lb-spin" size={20} /> Loading verified rankings…
                </div>
            )}

            {!loading && !error && leaderboard && (
                <>
                    <div
                        className="lb-board__participants"
                        key={`${subject?.subjectId}:${examType}:${difficulty}:${attemptType}:${participantCount}`}
                        data-testid="lb-participant-count"
                        role="status"
                        aria-live="polite"
                    >
                        <span className="lb-board__participants-icon" aria-hidden="true">
                            <UsersRound size={21} strokeWidth={1.8} />
                        </span>
                        <span className="lb-board__participants-copy">
                            <strong>{formatNumber(participantCount)}</strong>
                            <span>{participantCount === 1 ? 'participant' : 'participants'}</span>
                        </span>
                        <span className="lb-board__participants-context">
                            {hasFilters ? 'Matching your selected filters' : 'In this leaderboard'}
                        </span>
                    </div>

                    {viewer ? (
                        <section className="lb-viewer" aria-label="Your leaderboard position" data-testid="lb-viewer-summary">
                            <div className="lb-viewer__label">YOUR POSITION</div>
                            <div className="lb-viewer__main">
                                <div className="lb-viewer__rank">#{viewer.rank}</div>
                                <div className="lb-viewer__identity">
                                    <strong>{viewer.displayName || 'Your account'}</strong>
                                    <span>
                                        {entries.some((entry) => String(entry.studentId) === String(viewer.studentId))
                                            ? 'Inside the displayed Top 10'
                                            : 'Outside the displayed Top 10'}
                                        {viewer.position ? ` · Position ${viewer.position}` : ''}
                                    </span>
                                </div>
                                {!entries.some((entry) => String(entry.studentId) === String(viewer.studentId))
                                    && viewer.topPercent != null && (
                                        <div className="lb-viewer__percent">Top {viewer.topPercent}%</div>
                                    )}
                            </div>
                            <div className="lb-viewer__metrics">
                                <span><strong>{formatNumber(viewer.points)}</strong> points</span>
                                <span><strong>{formatPercentage(viewer.percentage)}</strong> percentage</span>
                                <span><strong>{formatNumber(viewer.totalTests)}</strong> attempts</span>
                            </div>
                        </section>
                    ) : (
                        <div className="lb-viewer lb-viewer--empty" data-testid="lb-viewer-summary">
                            <div className="lb-viewer__label">{isAdmin ? 'ADMINISTRATOR PREVIEW' : 'YOUR POSITION'}</div>
                            <p>
                                {isAdmin
                                    ? 'Administrator preview does not have a student rank. The board below shows verified student results.'
                                    : 'No eligible scored attempt is available for your account on this subject yet.'}
                            </p>
                        </div>
                    )}

                    {participantCount === 0 ? (
                        <EmptyState title={hasFilters ? 'No matching results' : 'No published scores yet'}>
                            {hasFilters
                                ? 'No completed results match the selected filters. Clear a filter or choose another category.'
                                : 'No finalized, scored attempts are currently available for this subject.'}
                        </EmptyState>
                    ) : entries.length > 0 ? (
                        <>
                            <div className="lb-board__table-wrap">
                                <table className="lb-board__table" data-testid="lb-rankings-table">
                                    <thead>
                                        <tr>
                                            <th scope="col">Rank</th>
                                            <th scope="col">Student</th>
                                            <th scope="col">Points</th>
                                            <th scope="col">Percentage</th>
                                            <th scope="col">Attempts</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {entries.map((entry) => {
                                            const isViewer = viewer
                                                && String(viewer.studentId) === String(entry.studentId);
                                            return (
                                                <tr key={entry.studentId} className={isViewer ? 'is-viewer' : ''}>
                                                    <td><span className="lb-board__rank">#{entry.rank}</span></td>
                                                    <td>
                                                        <span className="lb-board__student">{entry.displayName || 'Student'}</span>
                                                        {isViewer && <span className="lb-board__you">You</span>}
                                                    </td>
                                                    <td>{formatNumber(entry.points)}</td>
                                                    <td><strong>{formatPercentage(entry.percentage)}</strong></td>
                                                    <td>{formatNumber(entry.totalTests)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="lb-board__pagination" data-testid="lb-top10-summary">
                                <span>
                                    Showing {entries.length} of {formatNumber(participantCount)} participants
                                </span>
                                <strong>Top 10</strong>
                            </div>
                        </>
                    ) : (
                        <EmptyState title="No entries on this page">
                            This page has no entries. Go back or clear the filters to view available results.
                        </EmptyState>
                    )}

                    <p className="lb-board__rule">
                        Rankings use total earned points divided by total possible marks. When percentages are equal, higher cumulative points rank first; only equal percentages and equal points share the same rank.
                    </p>
                </>
            )}
        </section>
    );
}
