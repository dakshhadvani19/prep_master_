/**
 * Admin Dashboard (Phase 2) — command-center shell.
 * Role from AuthContext. Mock writes only. No database.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    MessageSquare, ShieldAlert, BookOpen, Trophy,
    Shield, UserPlus, UserMinus, Crown, Bookmark, Eye, Flag,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AdminController from '../components/AdminController';
import './AdminDashboard.css';

/** Neutral placeholders. Swap later — do not treat as live data. */
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

function FeedbackDonut({ total, seen, focus, onFocus }) {
    const remaining = Math.max(0, total - seen);
    const seenPct = total > 0 ? (seen / total) * 100 : 0;
    const background = total === 0
        ? 'conic-gradient(rgba(255,255,255,0.08) 0 100%)'
        : `conic-gradient(#8d7bff 0 ${seenPct}%, #ffb454 ${seenPct}% 100%)`;

    return (
        <div className={`admin-feedback-body ${focus ? `is-${focus}` : ''}`}>
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
                <button
                    type="button"
                    className={`admin-legend__row ${focus === 'seen' ? 'is-on' : ''}`}
                    onMouseEnter={() => onFocus('seen')}
                    onMouseLeave={() => onFocus(null)}
                    onFocus={() => onFocus('seen')}
                    onBlur={() => onFocus(null)}
                >
                    <span className="admin-legend__swatch" style={{ background: '#8d7bff' }} />
                    <b>{seen}</b> Seen
                </button>
                <button
                    type="button"
                    className={`admin-legend__row ${focus === 'remain' ? 'is-on' : ''}`}
                    onMouseEnter={() => onFocus('remain')}
                    onMouseLeave={() => onFocus(null)}
                    onFocus={() => onFocus('remain')}
                    onBlur={() => onFocus(null)}
                >
                    <span className="admin-legend__swatch" style={{ background: '#ffb454' }} />
                    <b>{remaining}</b> Remaining
                </button>
            </div>
        </div>
    );
}

export default function AdminDashboard() {
    const { isSuperAdmin, adminProfile, currentUser } = useAuth();
    const [notice, setNotice] = useState('');
    const [modal, setModal] = useState(null);
    const [form, setForm] = useState({ name: '', email: '', target: '' });
    const [fbFocus, setFbFocus] = useState(null);

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
                <div className="admin-dash__id">
                    <div className="admin-dash__kicker">Admin control center</div>
                    <h1 className="admin-dash__title">Command</h1>
                    <p className="admin-dash__sub">{displayName}</p>
                    <div className="admin-pills" aria-label="Preview system counts">
                        <span><b>{stats.total}</b> Feedback</span>
                        <span><b>{stats.seen}</b> Seen</span>
                        <span className="is-gold"><b>{stats.remaining}</b> Remaining</span>
                    </div>
                </div>
                <div className="admin-dash__visual">
                    <AdminController gold={isSuperAdmin} />
                    <span className={`admin-dash__badge ${isSuperAdmin ? 'admin-dash__badge--gold' : ''}`}>
                        {isSuperAdmin ? <Crown size={14} /> : <Shield size={14} />}
                        {isSuperAdmin ? 'Super Admin' : 'Standard Admin'}
                    </span>
                </div>
            </motion.header>

            <div className="admin-grid">
                <section className="admin-card admin-card--span-8 admin-card--feedback" aria-labelledby="feedback-heading">
                    <div className="admin-card__head">
                        <h2 className="admin-card__title" id="feedback-heading">
                            <MessageSquare size={16} style={{ marginRight: 8, verticalAlign: -2 }} />
                            Feedback overview
                        </h2>
                    </div>
                    <FeedbackDonut total={stats.total} seen={stats.seen} focus={fbFocus} onFocus={setFbFocus} />
                    <ul className="admin-mod-list">
                        {PREVIEW_FEEDBACK.map((row) => (
                            <li className="admin-mod-row" key={row.id}>
                                <div>
                                    <div className="admin-row__title">{row.title}</div>
                                    <div className="admin-row__sub">{row.type}</div>
                                </div>
                                <div className="admin-actions">
                                    <button type="button" className="admin-chip admin-chip--seen" onClick={() => previewOnly('Preview: Set as seen — not saved.')}>
                                        <Eye size={12} /> <span className="admin-chip__txt">Set as seen</span>
                                    </button>
                                    <button type="button" className="admin-chip admin-chip--mark" onClick={() => previewOnly('Preview: Bookmark — not saved.')}>
                                        <Bookmark size={12} /> <span className="admin-chip__txt">Bookmark</span>
                                    </button>
                                    <button type="button" className="admin-chip admin-chip--flag" onClick={() => previewOnly('Preview: Flag feedback as spam — not saved.')}>
                                        <Flag size={12} /> <span className="admin-chip__txt">Spam</span>
                                    </button>
                                    <button type="button" className="admin-chip admin-chip--gold" onClick={() => previewOnly('Preview: Set user as spam — not saved.')}>
                                        Set user as spam
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                    {notice && <div className="admin-banner" role="status">{notice}</div>}
                </section>

                <section className="admin-card admin-card--span-4 admin-card--mod" aria-labelledby="spam-heading">
                    <div className="admin-card__head">
                        <h2 className="admin-card__title" id="spam-heading">
                            <ShieldAlert size={16} style={{ marginRight: 8, verticalAlign: -2 }} />
                            Spam users
                        </h2>
                    </div>
                    <p className="admin-empty">No flagged students yet.</p>
                    <div className="admin-mod-row is-preview">
                        <span className="admin-status" aria-hidden />
                        <div>
                            <div className="admin-row__title">Sample preview row</div>
                            <div className="admin-row__sub">preview.user@example.com</div>
                        </div>
                    </div>
                    <div className="admin-actions" style={{ marginTop: '0.75rem' }}>
                        <button type="button" className="admin-chip" onClick={() => previewOnly('Preview control — no user is flagged or restored.')}>Restore (preview)</button>
                        <button type="button" className="admin-chip admin-chip--danger" onClick={() => previewOnly('Preview control — no user is deleted.')}>Remove flag (preview)</button>
                    </div>
                </section>

                <Link to="/admin/courses" className="admin-card admin-card--span-4 admin-entry admin-entry--courses" aria-labelledby="courses-entry">
                    <div className="admin-path" aria-hidden>
                        <i /><i /><i /><i />
                    </div>
                    <div className="admin-entry__icon"><BookOpen size={18} /></div>
                    <h2 className="admin-card__title" id="courses-entry">Edit subject / question</h2>
                    <span className="admin-linkish">Courses</span>
                </Link>

                <Link to="/leaderboards" className="admin-card admin-card--span-4 admin-entry admin-entry--ranks" aria-labelledby="leaderboard-entry">
                    <div className="admin-bars" aria-hidden>
                        <span /><span /><span />
                    </div>
                    <div className="admin-entry__icon admin-entry__icon--gold"><Trophy size={18} /></div>
                    <h2 className="admin-card__title" id="leaderboard-entry">Leaderboard &amp; ranking</h2>
                    <span className="admin-linkish">Ranks</span>
                </Link>

                <Link to="/admin/syllabus" className="admin-card admin-card--span-4 admin-entry admin-entry--files" aria-labelledby="syllabus-entry">
                    <div className="admin-entry__icon"><Shield size={18} /></div>
                    <h2 className="admin-card__title" id="syllabus-entry">Syllabus files</h2>
                    <span className="admin-linkish">Files</span>
                </Link>

                {isSuperAdmin && (
                    <section className="admin-card admin-card--span-12 admin-card--staff" aria-labelledby="staff-heading">
                        <div className="admin-card__head">
                            <h2 className="admin-card__title" id="staff-heading">
                                <Crown size={16} style={{ marginRight: 8, verticalAlign: -2, color: '#ffb454' }} />
                                Administration
                            </h2>
                            <span className="admin-card__tag">Super Admin</span>
                        </div>
                        <div className="admin-staff">
                            <button type="button" className="admin-staff__btn admin-staff__btn--add" onClick={() => setModal('add')}>
                                <strong><UserPlus size={14} /> Add Admin</strong>
                            </button>
                            <button type="button" className="admin-staff__btn admin-staff__btn--remove" onClick={() => setModal('remove')}>
                                <strong><UserMinus size={14} /> Remove Admin</strong>
                            </button>
                            <button type="button" className="admin-staff__btn admin-staff__btn--super" onClick={() => setModal('super')}>
                                <strong><Crown size={14} /> Add Super Admin</strong>
                            </button>
                        </div>
                    </section>
                )}
            </div>

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
                            initial={{ opacity: 0, y: 12, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8 }}
                        >
                            <h3 id="staff-modal-title">
                                {modal === 'add' && 'Add Admin'}
                                {modal === 'remove' && 'Remove Admin'}
                                {modal === 'super' && 'Add Super Admin'}
                            </h3>
                            <p>Preview only. Confirm does not change accounts.</p>
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
