/**
 * Admin Dashboard (Phase 2) — command-center shell.
 * Role from AuthContext. Mock writes only. No database.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    MessageSquare, ShieldAlert, BookOpen, Trophy,
    Shield, UserPlus, UserMinus, Crown, Bookmark, Eye, Flag, MoreVertical, UserX,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase';
import { manageAdminStaff } from '../utils/supabaseAuth';
import AdminController from '../components/AdminController';
import './AdminDashboard.css';

function getFeedbackPreview(description, wordLimit = 15) {
    const words = String(description || '').trim().split(/\\s+/).filter(Boolean);
    return {
        text: words.length > wordLimit ? `${words.slice(0, wordLimit).join(' ')}…` : words.join(' '),
        canExpand: words.length > wordLimit,
    };
}

function formatFeedbackType(type) {
    return String(type || 'other')
        .replace(/[_-]/g, ' ')
        .replace(/\\b\\w/g, (letter) => letter.toUpperCase());
}

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
    const [feedbackRows, setFeedbackRows] = useState([]);
    const [spamStudents, setSpamStudents] = useState([]);
    const [feedbackLoading, setFeedbackLoading] = useState(true);
    const [feedbackError, setFeedbackError] = useState('');
    const [feedbackRetry, setFeedbackRetry] = useState(0);
    const [expandedFeedbackId, setExpandedFeedbackId] = useState(null);
    const [openFeedbackMenu, setOpenFeedbackMenu] = useState(null);
    const [feedbackActionBusy, setFeedbackActionBusy] = useState('');

    const stats = useMemo(() => {
        const total = feedbackRows.length;
        const seen = feedbackRows.filter((row) => row.isSeen).length;
        return { total, seen, remaining: total - seen };
    }, [feedbackRows]);

    useEffect(() => {
        let cancelled = false;

        async function loadFeedbackDashboard() {
            setFeedbackLoading(true);
            setFeedbackError('');
            try {
                const { data, error } = await supabase.rpc('admin_get_feedback_dashboard');
                if (error) throw error;
                if (cancelled) return;

                setFeedbackRows(Array.isArray(data?.feedbacks) ? data.feedbacks : []);
                setSpamStudents(Array.isArray(data?.spamStudents) ? data.spamStudents : []);
            } catch (error) {
                if (cancelled) return;
                console.error('[admin-feedback] Failed to load feedback dashboard:', error);
                setFeedbackError(error?.message || 'Feedback could not be loaded. Please try again.');
            } finally {
                if (!cancelled) setFeedbackLoading(false);
            }
        }

        loadFeedbackDashboard();
        return () => { cancelled = true; };
    }, [feedbackRetry]);

    useEffect(() => {
        function closeFeedbackMenu(event) {
            if (!event.target?.closest?.('.admin-feedback-menu')) setOpenFeedbackMenu(null);
        }
        function closeFeedbackMenuOnEscape(event) {
            if (event.key === 'Escape') setOpenFeedbackMenu(null);
        }

        document.addEventListener('pointerdown', closeFeedbackMenu);
        document.addEventListener('keydown', closeFeedbackMenuOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeFeedbackMenu);
            document.removeEventListener('keydown', closeFeedbackMenuOnEscape);
        };
    }, []);

    async function handleFeedbackAction(feedback, action) {
        const actionKey = `${feedback.feedbackId}:${action}`;
        if (feedbackActionBusy) return;

        setOpenFeedbackMenu(null);
        setFeedbackActionBusy(actionKey);
        setNotice('');
        try {
            if (action === 'student_spam') {
                if (feedback.studentIsSpam) return;
                const { error } = await supabase.rpc('admin_mark_student_spam', {
                    p_student_id: feedback.studentId,
                });
                if (error) throw error;

                setFeedbackRows((rows) => rows.map((row) => (
                    String(row.studentId) === String(feedback.studentId)
                        ? { ...row, studentIsSpam: true }
                        : row
                )));
                setSpamStudents((students) => (
                    students.some((student) => String(student.studentId) === String(feedback.studentId))
                        ? students
                        : [...students, {
                            studentId: feedback.studentId,
                            studentName: feedback.studentName,
                        }].sort((a, b) => Number(b.studentId) - Number(a.studentId))
                ));
                setNotice('Student marked as spam.');
                return;
            }

            const statusField = {
                seen: 'isSeen',
                bookmark: 'isBookmark',
                spam: 'isSpam',
            }[action];
            if (!statusField || feedback[statusField]) return;

            const { error } = await supabase.rpc('admin_update_feedback_flag', {
                p_feedback_id: feedback.feedbackId,
                p_action: action,
            });
            if (error) throw error;

            setFeedbackRows((rows) => rows.map((row) => (
                String(row.feedbackId) === String(feedback.feedbackId)
                    ? { ...row, [statusField]: true }
                    : row
            )));
            setNotice(
                action === 'seen'
                    ? 'Feedback marked as seen.'
                    : action === 'bookmark'
                        ? 'Feedback bookmarked.'
                        : 'Feedback marked as spam.'
            );
        } catch (error) {
            console.error('[admin-feedback] Moderation action failed:', error);
            setNotice(error?.message || 'That feedback action could not be saved. Please try again.');
        } finally {
            setFeedbackActionBusy('');
        }
    }

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
                            Student feedback
                        </h2>
                        <span className="admin-card__tag">{stats.total} total</span>
                    </div>

                    <FeedbackDonut total={stats.total} seen={stats.seen} focus={fbFocus} onFocus={setFbFocus} />

                    {feedbackLoading ? (
                        <div className="admin-feedback-state" role="status">Loading student feedback…</div>
                    ) : feedbackError ? (
                        <div className="admin-feedback-state admin-feedback-state--error" role="alert">
                            <span>{feedbackError}</span>
                            <button type="button" onClick={() => setFeedbackRetry((value) => value + 1)}>Retry</button>
                        </div>
                    ) : feedbackRows.length === 0 ? (
                        <div className="admin-feedback-state">No student feedback has been submitted yet.</div>
                    ) : (
                        <div className="admin-feedback-list">
                            {feedbackRows.map((feedback) => {
                                const isExpanded = String(expandedFeedbackId) === String(feedback.feedbackId);
                                const preview = getFeedbackPreview(feedback.description);
                                const isBusy = feedbackActionBusy.startsWith(`${feedback.feedbackId}:`);

                                return (
                                    <motion.article
                                        layout
                                        key={feedback.feedbackId}
                                        className="admin-feedback-card"
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                                    >
                                        <div className="admin-feedback-card__top">
                                            <div className="admin-feedback-card__labels">
                                                <span className="admin-feedback-type">{formatFeedbackType(feedback.type)}</span>
                                                {feedback.isSeen && <span className="admin-feedback-state-tag">Seen</span>}
                                                {feedback.isBookmark && <span className="admin-feedback-state-tag admin-feedback-state-tag--bookmark">Bookmarked</span>}
                                                {feedback.isSpam && <span className="admin-feedback-state-tag admin-feedback-state-tag--spam">Spam</span>}
                                            </div>

                                            <div className="admin-feedback-menu">
                                                <button
                                                    type="button"
                                                    className="admin-feedback-menu__trigger"
                                                    aria-label="Feedback actions"
                                                    aria-controls={`feedback-actions-${feedback.feedbackId}`}
                                                    aria-expanded={String(openFeedbackMenu) === String(feedback.feedbackId)}
                                                    onClick={() => setOpenFeedbackMenu((current) => (
                                                        String(current) === String(feedback.feedbackId) ? null : feedback.feedbackId
                                                    ))}
                                                >
                                                    <MoreVertical size={18} />
                                                </button>

                                                <AnimatePresence>
                                                    {String(openFeedbackMenu) === String(feedback.feedbackId) && (
                                                        <motion.div
                                                            id={`feedback-actions-${feedback.feedbackId}`}
                                                            className="admin-feedback-menu__panel"
                                                            role="group"
                                                            aria-label="Feedback actions"
                                                            initial={{ opacity: 0, y: -4, scale: 0.98 }}
                                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                                            exit={{ opacity: 0, y: -3, scale: 0.98 }}
                                                            transition={{ duration: 0.14 }}
                                                        >
                                                            <button type="button" disabled={feedback.isSeen || isBusy} onClick={() => handleFeedbackAction(feedback, 'seen')}>
                                                                <Eye size={15} /> {feedback.isSeen ? 'Already marked as seen' : 'Mark as seen'}
                                                            </button>
                                                            <button type="button" disabled={feedback.isBookmark || isBusy} onClick={() => handleFeedbackAction(feedback, 'bookmark')}>
                                                                <Bookmark size={15} /> {feedback.isBookmark ? 'Already bookmarked' : 'Bookmark feedback'}
                                                            </button>
                                                            <button type="button" className="is-danger" disabled={feedback.isSpam || isBusy} onClick={() => handleFeedbackAction(feedback, 'spam')}>
                                                                <Flag size={15} /> {feedback.isSpam ? 'Already marked as spam' : 'Mark feedback as spam'}
                                                            </button>
                                                            <button type="button" className="is-danger" disabled={feedback.studentIsSpam || isBusy} onClick={() => handleFeedbackAction(feedback, 'student_spam')}>
                                                                <UserX size={15} /> {feedback.studentIsSpam ? 'Student already marked as spam' : 'Mark student as spam'}
                                                            </button>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        </div>

                                        <div className="admin-feedback-card__student">
                                            <strong>{feedback.studentName || 'Unknown student'}</strong>
                                            <span>Student ID: {feedback.studentId}</span>
                                        </div>

                                        <div className="admin-feedback-card__description">
                                            {isExpanded ? String(feedback.description || '') : preview.text}
                                        </div>
                                        {preview.canExpand && (
                                            <button
                                                type="button"
                                                className="admin-feedback-card__expand"
                                                aria-expanded={isExpanded}
                                                onClick={() => setExpandedFeedbackId(isExpanded ? null : feedback.feedbackId)}
                                            >
                                                {isExpanded ? 'Show less' : 'Review full feedback'}
                                            </button>
                                        )}
                                    </motion.article>
                                );
                            })}
                        </div>
                    )}

                    {notice && <div className="admin-banner" role="status">{notice}</div>}
                </section>

                <section className="admin-card admin-card--span-4 admin-card--mod" aria-labelledby="spam-heading">
                    <div className="admin-card__head">
                        <h2 className="admin-card__title" id="spam-heading">
                            <ShieldAlert size={16} style={{ marginRight: 8, verticalAlign: -2 }} />
                            Spam users
                        </h2>
                        <span className="admin-card__tag">{spamStudents.length} flagged</span>
                    </div>
                    {spamStudents.length === 0 ? (
                        <p className="admin-empty">No students have been marked as spam.</p>
                    ) : (
                        <div className="admin-spam-user-list">
                            {spamStudents.map((student) => (
                                <div className="admin-spam-user" key={student.studentId}>
                                    <span className="admin-status" aria-hidden />
                                    <div>
                                        <div className="admin-row__title">{student.studentName || 'Unknown student'}</div>
                                        <div className="admin-row__sub">Student ID: {student.studentId}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
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
