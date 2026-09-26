/**
 * Admin Dashboard (Phase 2) — UI shell only.
 * Role comes from AuthContext (Phase 1). Nothing here writes to the database.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LayoutDashboard, MessageSquare, ShieldAlert, BookOpen, Trophy,
    Shield, UserPlus, UserMinus, Crown, Bookmark, Eye, Flag,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './AdminDashboard.css';

/** Neutral placeholders. Swap these for a real store later — do not treat as live data. */
export const FEEDBACK_PLACEHOLDER = { total: 24, seen: 9 };

const PREVIEW_FEEDBACK = [
    { id: 'p1', title: 'Question wording in Mid-1 felt ambiguous', type: 'content', from: 'preview.student@example.com' },
    { id: 'p2', title: 'Timer jumped during a timed attempt', type: 'bug', from: 'preview.student@example.com' },
    { id: 'p3', title: 'Request: more numericals in Physics', type: 'feature', from: 'preview.student@example.com' },
];

const PREVIEW_ADMINS = [
    { id: 'a1', name: 'Preview Admin', email: 'admin.preview@example.com' },
    { id: 'a2', name: 'Preview Staff', email: 'staff.preview@example.com' },
];

function FeedbackDonut({ total, seen }) {
    const remaining = Math.max(0, total - seen);
    const seenPct = total > 0 ? (seen / total) * 100 : 0;
    const background = total === 0
        ? 'conic-gradient(rgba(255,255,255,0.08) 0 100%)'
        : `conic-gradient(#8d7bff 0 ${seenPct}%, #ffb454 ${seenPct}% 100%)`;

    return (
        <div className="admin-feedback-body">
            <div
                className="admin-donut"
                style={{ background }}
                role="img"
                aria-label={`Feedback: ${total} total, ${seen} seen, ${remaining} remaining`}
            >
                <div className="admin-donut__hole">
                    <strong>{total}</strong>
                    <span>Total</span>
                </div>
            </div>
            <div className="admin-legend">
                <div className="admin-legend__row">
                    <span className="admin-legend__swatch" style={{ background: '#8d7bff' }} />
                    Seen · {seen}
                </div>
                <div className="admin-legend__row">
                    <span className="admin-legend__swatch" style={{ background: '#ffb454' }} />
                    Remaining · {remaining}
                </div>
                <p style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    Remaining = Total − Seen. Preview figures only.
                </p>
            </div>
        </div>
    );
}

export default function AdminDashboard() {
    const { isSuperAdmin, adminProfile, currentUser } = useAuth();
    const [notice, setNotice] = useState('');
    const [modal, setModal] = useState(null);
    const [form, setForm] = useState({ name: '', email: '', target: '' });

    const stats = useMemo(() => {
        const total = FEEDBACK_PLACEHOLDER.total;
        const seen = FEEDBACK_PLACEHOLDER.seen;
        return { total, seen, remaining: total - seen };
    }, []);

    const displayName = adminProfile?.full_name || currentUser?.displayName || 'Administrator';

    function previewOnly(message) {
        setNotice(message);
    }

    function closeModal() {
        setModal(null);
        setForm({ name: '', email: '', target: '' });
    }

    function submitModal(e) {
        e.preventDefault();
        previewOnly('Preview only — no account is created, removed, or promoted.');
        closeModal();
    }

    return (
        <div className="admin-dash">
            <motion.header
                className="admin-dash__hero"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
                <div>
                    <div className="admin-dash__kicker">Admin control center</div>
                    <h1 className="admin-dash__title">Dashboard</h1>
                    <p className="admin-dash__sub">Welcome back, {displayName}.</p>
                </div>
                <span className={`admin-dash__badge ${isSuperAdmin ? 'admin-dash__badge--gold' : ''}`}>
                    {isSuperAdmin ? <Crown size={14} /> : <Shield size={14} />}
                    {isSuperAdmin ? 'Super Admin' : 'Standard Admin'}
                </span>
            </motion.header>

            <motion.div
                className="admin-grid"
                initial="hidden"
                animate="show"
                variants={{
                    hidden: {},
                    show: { transition: { staggerChildren: 0.06 } },
                }}
            >
                <motion.section className="admin-card admin-card--span-12" aria-labelledby="overview-heading" variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}>
                    <div className="admin-card__head">
                        <div>
                            <h2 className="admin-card__title" id="overview-heading">
                                <LayoutDashboard size={16} style={{ marginRight: 8, verticalAlign: -2 }} />
                                Overview
                            </h2>
                            <p className="admin-card__hint">Placeholder counts. No live queries in this phase.</p>
                        </div>
                    </div>
                    <div className="admin-stats">
                        <div className="admin-stat">
                            <div className="admin-stat__label">Total feedback</div>
                            <div className="admin-stat__value">{stats.total}</div>
                        </div>
                        <div className="admin-stat">
                            <div className="admin-stat__label">Seen</div>
                            <div className="admin-stat__value">{stats.seen}</div>
                        </div>
                        <div className="admin-stat">
                            <div className="admin-stat__label">Remaining</div>
                            <div className="admin-stat__value admin-stat__value--gold">{stats.remaining}</div>
                        </div>
                    </div>
                </motion.section>

                <motion.section className="admin-card admin-card--span-8" aria-labelledby="feedback-heading" variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}>
                    <div className="admin-card__head">
                        <div>
                            <h2 className="admin-card__title" id="feedback-heading">
                                <MessageSquare size={16} style={{ marginRight: 8, verticalAlign: -2 }} />
                                Feedback overview
                            </h2>
                            <p className="admin-card__hint">Read Feedback — visualization only. Nothing is stored.</p>
                        </div>
                        <span className="admin-card__tag">UI preview</span>
                    </div>
                    <FeedbackDonut total={stats.total} seen={stats.seen} />
                    <div className="admin-preview">
                        {PREVIEW_FEEDBACK.map((row) => (
                            <div className="admin-row" key={row.id}>
                                <div className="admin-row__meta">
                                    <div className="admin-row__title">{row.title}</div>
                                    <div className="admin-row__sub">{row.type} · {row.from}</div>
                                </div>
                                <div className="admin-actions">
                                    <button type="button" className="admin-chip" onClick={() => previewOnly('Preview: Set as seen — not saved.')}>
                                        <Eye size={11} style={{ marginRight: 4, verticalAlign: -1 }} /> Set as seen
                                    </button>
                                    <button type="button" className="admin-chip" onClick={() => previewOnly('Preview: Bookmark — not saved.')}>
                                        <Bookmark size={11} style={{ marginRight: 4, verticalAlign: -1 }} /> Bookmark
                                    </button>
                                    <button type="button" className="admin-chip" onClick={() => previewOnly('Preview: Flag feedback as spam — not saved.')}>
                                        <Flag size={11} style={{ marginRight: 4, verticalAlign: -1 }} /> Spam
                                    </button>
                                    <button type="button" className="admin-chip admin-chip--gold" onClick={() => previewOnly('Preview: Set user as spam — not saved.')}>
                                        Set user as spam
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                    {notice && <div className="admin-banner" role="status">{notice}</div>}
                </motion.section>

                <motion.section className="admin-card admin-card--span-4" aria-labelledby="spam-heading" variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}>
                    <div className="admin-card__head">
                        <div>
                            <h2 className="admin-card__title" id="spam-heading">
                                <ShieldAlert size={16} style={{ marginRight: 8, verticalAlign: -2 }} />
                                Spam users
                            </h2>
                            <p className="admin-card__hint">Structure only. No student list is fetched.</p>
                        </div>
                    </div>
                    <p className="admin-empty">No flagged students yet.</p>
                    <div className="admin-row" style={{ opacity: 0.7 }}>
                        <div className="admin-row__meta">
                            <div className="admin-row__title">Sample preview row</div>
                            <div className="admin-row__sub">preview.user@example.com · status: spam</div>
                        </div>
                    </div>
                    <div className="admin-actions" style={{ marginTop: '0.75rem' }}>
                        <button type="button" className="admin-chip" onClick={() => previewOnly('Preview control — no user is flagged or restored.')}>Restore (preview)</button>
                        <button type="button" className="admin-chip" onClick={() => previewOnly('Preview control — no user is deleted.')}>Remove flag (preview)</button>
                    </div>
                </motion.section>

                <Link to="/admin/courses" className="admin-card admin-card--span-4 admin-entry" aria-labelledby="courses-entry">
                    <div className="admin-entry__icon"><BookOpen size={18} /></div>
                    <h2 className="admin-card__title" id="courses-entry">Edit subject / question</h2>
                    <p>Courses → Semester → Subjects → Questions. Catalog management is Phase 3.</p>
                    <span className="admin-linkish">Open Courses →</span>
                </Link>

                <Link to="/leaderboards" className="admin-card admin-card--span-4 admin-entry" aria-labelledby="leaderboard-entry">
                    <div className="admin-entry__icon admin-entry__icon--gold"><Trophy size={18} /></div>
                    <h2 className="admin-card__title" id="leaderboard-entry">Leaderboard &amp; ranking</h2>
                    <p>All boards with Course → Semester → Subject filters. Preview ranks only.</p>
                    <span className="admin-linkish">Open Leaderboard →</span>
                </Link>

                <Link to="/admin/syllabus" className="admin-card admin-card--span-4 admin-entry" aria-labelledby="syllabus-entry">
                    <div className="admin-entry__icon"><Shield size={18} /></div>
                    <h2 className="admin-card__title" id="syllabus-entry">Syllabus files</h2>
                    <p>Existing syllabus upload / list / delete. Unchanged from before this phase.</p>
                    <span className="admin-linkish">Open Syllabus Admin →</span>
                </Link>

                {isSuperAdmin && (
                    <section className="admin-card admin-card--span-12" aria-labelledby="staff-heading">
                        <div className="admin-card__head">
                            <div>
                                <h2 className="admin-card__title" id="staff-heading">
                                    <Crown size={16} style={{ marginRight: 8, verticalAlign: -2, color: '#ffb454' }} />
                                    Administration
                                </h2>
                                <p className="admin-card__hint">Super Admin only. Forms are mock — no writes to public.admins.</p>
                            </div>
                            <span className="admin-card__tag">Super Admin</span>
                        </div>
                        <div className="admin-staff">
                            <button type="button" className="admin-staff__btn" onClick={() => setModal('add')}>
                                <strong><UserPlus size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> Add Admin</strong>
                                <span>Enter details &amp; confirm</span>
                            </button>
                            <button type="button" className="admin-staff__btn" onClick={() => setModal('remove')}>
                                <strong><UserMinus size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> Remove Admin</strong>
                                <span>Select admin &amp; confirm</span>
                            </button>
                            <button type="button" className="admin-staff__btn" onClick={() => setModal('super')}>
                                <strong><Crown size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> Add Super Admin</strong>
                                <span>Enter details &amp; confirm</span>
                            </button>
                        </div>
                    </section>
                )}
            </motion.div>

            <AnimatePresence>
            {modal && (
                <motion.div
                    className="admin-modal-backdrop"
                    onClick={closeModal}
                    role="presentation"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    <motion.form
                        className="admin-modal"
                        onClick={(e) => e.stopPropagation()}
                        onSubmit={submitModal}
                        aria-labelledby="staff-modal-title"
                        initial={{ opacity: 0, y: 16, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8 }}
                    >
                        <h3 id="staff-modal-title">
                            {modal === 'add' && 'Add Admin'}
                            {modal === 'remove' && 'Remove Admin'}
                            {modal === 'super' && 'Add Super Admin'}
                        </h3>
                        <p>Preview workflow only. Confirming does not change any account.</p>
                        {modal !== 'remove' ? (
                            <>
                                <div className="admin-field">
                                    <label htmlFor="staff-name">Full name</label>
                                    <input id="staff-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" autoComplete="off" />
                                </div>
                                <div className="admin-field">
                                    <label htmlFor="staff-email">Email</label>
                                    <input id="staff-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="admin@example.com" autoComplete="off" />
                                </div>
                            </>
                        ) : (
                            <div className="admin-field">
                                <label htmlFor="staff-target">Select admin</label>
                                <select id="staff-target" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}>
                                    <option value="">Choose…</option>
                                    {PREVIEW_ADMINS.map((a) => (
                                        <option key={a.id} value={a.id}>{a.name} · {a.email}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div className="admin-modal__row">
                            <button type="button" className="admin-btn" onClick={closeModal}>Cancel</button>
                            <button type="submit" className="admin-btn admin-btn--gold">Confirm (preview)</button>
                        </div>
                    </motion.form>
                </motion.div>
            )}
            </AnimatePresence>
        </div>
    );
}
