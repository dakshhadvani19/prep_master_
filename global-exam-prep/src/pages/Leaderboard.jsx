/**
 * Phase 4 — leaderboard UI. Mock ranks only. No persistence, API, or tables.
 * Students: boards they participate in, Top 100, own rank + percentile.
 * Admins: all boards with Course → Semester → Subject filters.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Trophy, Medal, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
    LB_COURSES,
    STUDENT_BOARDS,
    findYou,
    percentileFor,
    subjectMeta,
    topN,
    withViewer,
} from '../data/leaderboardMock.js';
import './Leaderboard.css';

const PREVIEW = 'Preview ranks — no data was changed.';

const fadeUp = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

function viewerName(auth) {
    return (
        auth.studentData?.fullName
        || auth.currentUser?.displayName
        || auth.adminProfile?.full_name
        || auth.currentUser?.email
        || 'You'
    );
}

function useBoard(subjectId, viewer, plannedRank, query) {
    return useMemo(() => {
        const rows = withViewer(subjectId, viewer, plannedRank);
        const you = findYou(rows);
        const listed = topN(rows, 100);
        const q = String(query || '').trim().toLowerCase();
        const visible = q
            ? rows.filter((row) => row.name.toLowerCase().includes(q)).slice(0, 100)
            : listed;
        return {
            rows,
            you,
            visible,
            total: rows.length,
            percentile: you ? percentileFor(you.rank, rows.length) : 0,
        };
    }, [subjectId, viewer, plannedRank, query]);
}

function Podium({ rows }) {
    const first = rows.find((r) => r.rank === 1);
    const second = rows.find((r) => r.rank === 2);
    const third = rows.find((r) => r.rank === 3);
    const card = (row, place) => {
        if (!row) return <div className={`lb-pod lb-pod--${place}`} />;
        return (
            <motion.div
                className={`lb-pod lb-pod--${place}`}
                variants={fadeUp}
                whileHover={{ y: place === 1 ? -8 : -5 }}
            >
                <div className="lb-pod__place">{place === 1 ? 'First' : place === 2 ? 'Second' : 'Third'}</div>
                <Medal size={place === 1 ? 22 : 18} style={{ marginTop: 8, color: place === 1 ? '#ffb454' : 'inherit' }} />
                <div className="lb-pod__name">{row.name}</div>
                <div className="lb-pod__meta">{row.points} pts · {row.tests} tests</div>
            </motion.div>
        );
    };
    return (
        <motion.div className="lb-podium" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.08 } } }}>
            {card(second, 2)}
            {card(first, 1)}
            {card(third, 3)}
        </motion.div>
    );
}

function RankList({ rows }) {
    const rest = useMemo(() => rows.filter((row) => row.rank > 3), [rows]);
    const scroller = useRef(null);
    const [end, setEnd] = useState('top');

    function measure() {
        const el = scroller.current;
        if (!el) return;
        const top = el.scrollTop <= 16;
        const bottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 16;
        setEnd(bottom && !top ? 'bottom' : 'top');
    }

    useEffect(() => {
        const el = scroller.current;
        if (!el) return;
        el.scrollTop = 0;
        measure();
    }, [rows]);

    function jump() {
        const el = scroller.current;
        if (!el) return;
        el.scrollTo({
            top: end === 'bottom' ? 0 : el.scrollHeight,
            behavior: 'smooth',
        });
    }

    const atBottom = end === 'bottom';
    const toggleBtn = rest.length > 10 ? (
        <motion.button
            type="button"
            className={`lb-more ${atBottom ? 'lb-more--up' : 'lb-more--down'}`}
            onClick={jump}
            aria-label={atBottom ? 'Jump to top of list' : 'Jump to bottom of list'}
            whileHover={{ y: atBottom ? -2 : 2 }}
            whileTap={{ scale: 0.97 }}
        >
            <span className="lb-more__orb" aria-hidden>
                {atBottom ? <ChevronUp size={22} strokeWidth={2.25} /> : <ChevronDown size={22} strokeWidth={2.25} />}
            </span>
            <span className="lb-more__copy">
                {atBottom ? 'Back to rank 4' : 'Scroll the rest of Top 100'}
            </span>
        </motion.button>
    ) : null;

    return (
        <div data-testid="lb-top100">
            {atBottom && toggleBtn}
            <div
                className="lb-scroll"
                ref={scroller}
                onScroll={measure}
                data-testid="lb-scroll"
            >
                {rest.map((row, i) => (
                    <motion.div
                        key={row.id}
                        className={`lb-row ${row.isYou ? 'is-you' : ''}`}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(i, 9) * 0.02, duration: 0.28 }}
                    >
                        <span className="lb-badge">{row.rank}</span>
                        <div>
                            <div className="lb-row__name">{row.name}{row.isYou ? ' · you' : ''}</div>
                            <div className="lb-row__sub">{row.points} points</div>
                        </div>
                        <div className="lb-row__pts">{row.points}</div>
                        <div className="lb-row__tests">{row.tests} tests</div>
                    </motion.div>
                ))}
                {rest.length === 0 && <div className="lb-empty">No students match this view.</div>}
            </div>
            {!atBottom && toggleBtn}
        </div>
    );
}

function YouCard({ you, total, percentile }) {
    if (!you) return null;
    return (
        <motion.section
            className="lb-you"
            data-testid="lb-you"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <div className="lb-ring" style={{ '--p': `${percentile}%` }} data-testid="lb-percentile">
                <div className="lb-ring__in">
                    <strong>{percentile}%</strong>
                    <span>percentile</span>
                </div>
            </div>
            <div>
                <div className="lb-you__title">Your standing</div>
                <div className="lb-you__name">{you.name}</div>
                <div className="lb-you__meta">
                    {you.points} points · {you.tests} tests · {you.rank <= 100 ? 'Inside the Top 100' : 'Outside the Top 100 — still listed here'}
                </div>
            </div>
            <div className="lb-you__rank">
                <b>#{you.rank}</b>
                <span>of {total}</span>
            </div>
        </motion.section>
    );
}

function StudentBoard({ auth, flash }) {
    const [subjectId, setSubjectId] = useState(STUDENT_BOARDS[0].subjectId);
    const planned = STUDENT_BOARDS.find((b) => b.subjectId === subjectId)?.rank;
    const viewer = useMemo(() => ({ name: viewerName(auth), uid: auth.currentUser?.uid }), [auth]);
    const board = useBoard(subjectId, viewer, planned, '');
    const meta = subjectMeta(subjectId);

    function pick(id) {
        setSubjectId(id);
        const next = subjectMeta(id);
        flash(`Showing ${next?.subject.title || 'board'}. ${PREVIEW}`);
    }

    return (
        <>
            <div className="lb-panel">
                <div className="lb-list__head">
                    <h2>Your boards</h2>
                    <p>Only subjects you have attempted (preview).</p>
                </div>
                <div className="lb-chips" data-testid="lb-student-boards">
                    {STUDENT_BOARDS.map((b) => {
                        const info = subjectMeta(b.subjectId);
                        return (
                            <button
                                type="button"
                                key={b.subjectId}
                                className={`lb-chip ${subjectId === b.subjectId ? 'is-on' : ''}`}
                                onClick={() => pick(b.subjectId)}
                            >
                                {info?.subject.title}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="lb-stats">
                <div className="lb-stat">
                    <div className="lb-stat__label">Board size</div>
                    <div className="lb-stat__value">{board.total}</div>
                </div>
                <div className="lb-stat lb-stat--you">
                    <div className="lb-stat__label">Your rank</div>
                    <div className="lb-stat__value">#{board.you?.rank ?? '—'}</div>
                </div>
                <div className="lb-stat">
                    <div className="lb-stat__label">Percentile</div>
                    <div className="lb-stat__value">{board.percentile}%</div>
                </div>
            </div>

            <Podium rows={board.rows} />
            <YouCard you={board.you} total={board.total} percentile={board.percentile} />

            <div className="lb-list__head">
                <h2>Top 100 · {meta?.subject.title}</h2>
                <p>{meta?.course.title} · Sem {meta?.subject.sem}</p>
            </div>
            <RankList rows={board.visible} />
        </>
    );
}

function AdminBoard({ flash }) {
    const [courseId, setCourseId] = useState(LB_COURSES[0].id);
    const course = LB_COURSES.find((c) => c.id === courseId) || LB_COURSES[0];
    const [sem, setSem] = useState(course.semesters[0]);
    const subjects = course.subjects.filter((s) => s.sem === sem);
    const [subjectId, setSubjectId] = useState(subjects[0]?.id || '');
    const [query, setQuery] = useState('');

    const subject = course.subjects.find((s) => s.id === subjectId) || subjects[0] || null;
    const board = useBoard(subject?.id, null, null, query);

    function applyCourse(id) {
        const next = LB_COURSES.find((c) => c.id === id) || LB_COURSES[0];
        const firstSem = next.semesters[0];
        const firstSub = next.subjects.find((s) => s.sem === firstSem);
        setCourseId(next.id);
        setSem(firstSem);
        setSubjectId(firstSub?.id || '');
        setQuery('');
        flash(`Course set to ${next.title}. ${PREVIEW}`);
    }

    function applySem(n) {
        const nextSubs = course.subjects.filter((s) => s.sem === n);
        setSem(n);
        setSubjectId(nextSubs[0]?.id || '');
        flash(`Semester ${n}. ${PREVIEW}`);
    }

    function applySubject(id) {
        setSubjectId(id);
        const info = subjectMeta(id);
        flash(`Showing ${info?.subject.title || 'subject'}. ${PREVIEW}`);
    }

    return (
        <>
            <div className="lb-panel" data-testid="lb-admin-filters">
                <div className="lb-list__head">
                    <h2>All boards</h2>
                    <p>Course restricts semester and subject. Preview only.</p>
                </div>
                <div className="lb-filters">
                    <div className="lb-field">
                        <label htmlFor="lb-course">Course</label>
                        <select id="lb-course" value={courseId} onChange={(e) => applyCourse(e.target.value)}>
                            {LB_COURSES.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                        </select>
                    </div>
                    <div className="lb-field">
                        <label htmlFor="lb-sem">Semester</label>
                        <select id="lb-sem" value={sem} onChange={(e) => applySem(Number(e.target.value))}>
                            {course.semesters.map((n) => <option key={n} value={n}>Sem {n}</option>)}
                        </select>
                    </div>
                    <div className="lb-field">
                        <label htmlFor="lb-subject">Subject</label>
                        <select id="lb-subject" value={subject?.id || ''} onChange={(e) => applySubject(e.target.value)}>
                            {subjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                        </select>
                    </div>
                    <div className="lb-field">
                        <label htmlFor="lb-search">Student name</label>
                        <input
                            id="lb-search"
                            value={query}
                            placeholder="Search this board"
                            onChange={(e) => setQuery(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="lb-stats">
                <div className="lb-stat">
                    <div className="lb-stat__label">Students</div>
                    <div className="lb-stat__value">{board.total}</div>
                </div>
                <div className="lb-stat">
                    <div className="lb-stat__label">Showing</div>
                    <div className="lb-stat__value">{board.visible.length}</div>
                </div>
                <div className="lb-stat">
                    <div className="lb-stat__label">Subject</div>
                    <div className="lb-stat__value" style={{ fontSize: '1.05rem' }}>{subject?.title || '—'}</div>
                </div>
            </div>

            {subject ? (
                <>
                    <Podium rows={board.rows} />
                    <div className="lb-list__head">
                        <h2>Top 100 · {subject.title}</h2>
                        <p>{course.title} · Sem {sem}</p>
                    </div>
                    <RankList rows={board.visible} />
                </>
            ) : (
                <div className="lb-empty">No subjects in this semester.</div>
            )}
        </>
    );
}

export default function Leaderboard() {
    const auth = useAuth();
    const { isAdmin } = auth;
    const [toast, setToast] = useState('');

    function flash(msg) {
        setToast(msg);
        window.setTimeout(() => setToast(''), 2600);
    }

    return (
        <div className="lb">
            <header className="lb__hero">
                <div>
                    <div className="lb__kicker">{isAdmin ? 'Admin · Rankings' : 'Student · Rankings'}</div>
                    <h1 className="lb__title">Leaderboard</h1>
                    <p className="lb__sub">
                        {isAdmin
                            ? 'All boards. Filter Course → Semester → Subject. Ranks are a preview, not live attempts.'
                            : 'Top 100 plus your rank and percentile, even if you sit outside the published list.'}
                    </p>
                    <p className="lb-preview">In-memory preview. ER fields: points, tests, subject.</p>
                </div>
                <motion.div
                    initial={{ rotate: -8, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                    aria-hidden
                >
                    <Trophy size={36} color="#ffb454" />
                </motion.div>
            </header>

            {isAdmin ? <AdminBoard flash={flash} /> : <StudentBoard auth={auth} flash={flash} />}

            <AnimatePresence>
                {toast && (
                    <motion.div
                        className="lb-toast"
                        role="status"
                        initial={{ opacity: 0, y: 14, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8 }}
                    >
                        <Sparkles size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                        {toast}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
