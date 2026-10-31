/**
 * Admin Dashboard (Phase 2) — command-center shell.
 * Role from AuthContext. Mock writes only. No database.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    MessageSquare, ShieldAlert, BookOpen, Trophy,
    Shield, UserPlus, UserMinus, Crown, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase';
import { manageAdminStaff } from '../utils/supabaseAuth';
import AdminController from '../components/AdminController';
import './AdminDashboard.css';

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
    const [staffBusy, setStaffBusy] = useState(false);
    const [feedbackSummary, setFeedbackSummary] = useState({ total: 0, seen: 0 });
    const [feedbackLoading, setFeedbackLoading] = useState(true);
    const [feedbackError, setFeedbackError] = useState('');
    const [feedbackRetry, setFeedbackRetry] = useState(0);

    const stats = {
        total: feedbackSummary.total,
        seen: feedbackSummary.seen,
        remaining: Math.max(0, feedbackSummary.total - feedbackSummary.seen),
    };

    useEffect(() => {
        let cancelled = false;

        async function loadFeedbackSummary() {
            setFeedbackLoading(true);
            setFeedbackError('');
            try {
                if (!supabase) throw new Error('Feedback service is not configured.');
                const { data, error } = await supabase.rpc('admin_get_feedback_summary');
                if (error) throw error;
                if (cancelled) return;

                setFeedbackSummary({
                    total: Number(data?.total) || 0,
                    seen: Number(data?.seen) || 0,
                });
            } catch (error) {
                if (cancelled) return;
                console.error('[admin-feedback] Failed to load feedback summary:', error);
                setFeedbackError(error?.message || 'Feedback summary could not be loaded.');
            } finally {
                if (!cancelled) setFeedbackLoading(false);
            }
        }

        loadFeedbackSummary();
        return () => { cancelled = true; };
    }, [feedbackRetry]);

    const displayName = adminProfile?.full_name || currentUser?.displayName || 'Administrator';

    function previewOnly(message) {
        setNotice(message);
    }

    function closeModal() {
        setModal(null);
        setForm({ name: '', email: '', target: '' });
    }

    async function submitModal(e) {
        e.preventDefault();
        if (!isSuperAdmin) {
            previewOnly('Only a Super Admin can change staff.');
            closeModal();
            return;
        }
        const action = modal === 'add' ? 'add' : modal === 'super' ? 'add_super' : 'remove';
        const email = modal === 'remove'
            ? (PREVIEW_ADMINS.find((a) => a.id === form.target)?.email || form.target)
            : form.email;
        setStaffBusy(true);
        try {
            await manageAdminStaff(supabase, { action, email, fullName: form.name });
            previewOnly(`Staff ${action === 'remove' ? 'removed' : action === 'add_super' ? 'promoted' : 'added'} for ${String(email || '').trim() || 'that address'}.`);
            closeModal();
        } catch (err) {
            previewOnly(err?.message || 'Staff change did not complete.');
        } finally {
            setStaffBusy(false);
        }
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
                    <div className="admin-pills" aria-label="Feedback counts">
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
                        <span className="admin-card__tag">{stats.total} total</span>
                    </div>

                    <FeedbackDonut total={stats.total} seen={stats.seen} focus={fbFocus} onFocus={setFbFocus} />

                    {feedbackLoading ? (
                        <p className="admin-feedback-dashboard-state">Loading feedback summary…</p>
                    ) : feedbackError ? (
                        <div className="admin-feedback-dashboard-state is-error" role="alert">
                            <span>{feedbackError}</span>
                            <button type="button" onClick={() => setFeedbackRetry((value) => value + 1)}>Retry</button>
                        </div>
                    ) : (
                        <p className="admin-feedback-dashboard-state">
                            {stats.total === 0
                                ? 'No student feedback has been submitted yet.'
                                : stats.remaining + ' feedback submissions are awaiting review.'}
                        </p>
                    )}

                    <Link to="/feedback" className="admin-feedback-open">
                        Open feedback inbox <ChevronRight size={15} />
                    </Link>
                </section>

                <section className="admin-card admin-card--span-4 admin-card--mod" aria-labelledby="spam-heading">
                    <div className="admin-card__head">
                        <h2 className="admin-card__title" id="spam-heading">
                            <ShieldAlert size={16} style={{ marginRight: 8, verticalAlign: -2 }} />
                            Spam users
                        </h2>
                    </div>
                    <p className="admin-empty">Review students marked as spam from the feedback inbox.</p>
                    <Link to="/feedback" className="admin-feedback-open">
                        Manage flagged students <ChevronRight size={15} />
                    </Link>
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
                            <p>Super Admin only. That email must already have a PrepMaster account.</p>
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
                                <button type="submit" className="admin-btn admin-btn--gold" disabled={staffBusy}>Confirm (preview)</button>
                            </div>
                        </motion.form>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
