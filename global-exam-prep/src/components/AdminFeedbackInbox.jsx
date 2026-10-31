import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    MoreVertical, Eye, Bookmark, Flag, UserX, ShieldAlert,
} from 'lucide-react';
import { supabase } from '../supabase';
import './AdminFeedbackInbox.css';

function getFeedbackPreview(description, wordLimit = 15) {
    const words = String(description || '').trim().split(/\s+/).filter(Boolean);
    return {
        text: words.length > wordLimit ? words.slice(0, wordLimit).join(' ') + '…' : words.join(' '),
        canExpand: words.length > wordLimit,
    };
}

function formatFeedbackType(type) {
    return String(type || 'other')
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function AdminFeedbackInbox() {
    const [feedbackRows, setFeedbackRows] = useState([]);
    const [spamStudents, setSpamStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [retry, setRetry] = useState(0);
    const [notice, setNotice] = useState('');
    const [expandedFeedbackId, setExpandedFeedbackId] = useState(null);
    const [openFeedbackMenu, setOpenFeedbackMenu] = useState(null);
    const [actionBusy, setActionBusy] = useState('');

    useEffect(() => {
        let cancelled = false;

        async function loadFeedback() {
            setLoading(true);
            setLoadError('');
            try {
                if (!supabase) throw new Error('Feedback service is not configured.');
                const { data, error } = await supabase.rpc('admin_get_feedback_dashboard');
                if (error) throw error;
                if (cancelled) return;

                setFeedbackRows(Array.isArray(data?.feedbacks) ? data.feedbacks : []);
                setSpamStudents(Array.isArray(data?.spamStudents) ? data.spamStudents : []);
            } catch (error) {
                if (cancelled) return;
                console.error('[admin-feedback] Failed to load feedback:', error);
                setLoadError(error?.message || 'Feedback could not be loaded. Please try again.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        loadFeedback();
        return () => { cancelled = true; };
    }, [retry]);

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
        const feedbackId = String(feedback.feedbackId);
        const actionKey = feedbackId + ':' + action;
        if (actionBusy) return;

        setOpenFeedbackMenu(null);
        setActionBusy(actionKey);
        setNotice('');
        try {
            if (!supabase) throw new Error('Feedback service is not configured.');

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
                String(row.feedbackId) === feedbackId
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
            setActionBusy('');
        }
    }

    const seenCount = feedbackRows.filter((row) => row.isSeen).length;
    const remainingCount = Math.max(0, feedbackRows.length - seenCount);

    return (
        <div className="admin-feedback-inbox">
            <motion.header
                className="admin-feedback-inbox__header"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
                <div>
                    <span className="admin-feedback-inbox__eyebrow">ADMINISTRATION</span>
                    <h1>Student feedback</h1>
                    <p>Review student suggestions, reports, and content issues.</p>
                </div>
                <div className="admin-feedback-inbox__stats" aria-label="Feedback summary">
                    <span><strong>{feedbackRows.length}</strong> Total</span>
                    <span><strong>{seenCount}</strong> Seen</span>
                    <span><strong>{remainingCount}</strong> Remaining</span>
                </div>
            </motion.header>

            <div className="admin-feedback-inbox__layout">
                <section className="admin-feedback-inbox__main" aria-label="Feedback submissions">
                    <div className="admin-feedback-inbox__section-head">
                        <div>
                            <h2>All feedback</h2>
                            <p>Newest submissions appear first.</p>
                        </div>
                        <span>{loading ? 'Loading' : feedbackRows.length + ' items'}</span>
                    </div>

                    {loading ? (
                        <div className="admin-feedback-state" role="status">Loading student feedback…</div>
                    ) : loadError ? (
                        <div className="admin-feedback-state admin-feedback-state--error" role="alert">
                            <span>{loadError}</span>
                            <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button>
                        </div>
                    ) : feedbackRows.length === 0 ? (
                        <div className="admin-feedback-state">No student feedback has been submitted yet.</div>
                    ) : (
                        <div className="admin-feedback-list">
                            {feedbackRows.map((item) => {
                                const isExpanded = String(expandedFeedbackId) === String(item.feedbackId);
                                const preview = getFeedbackPreview(item.description);
                                const isBusy = actionBusy.startsWith(String(item.feedbackId) + ':');

                                return (
                                    <motion.article
                                        layout
                                        key={item.feedbackId}
                                        className="admin-feedback-card"
                                        initial={{ opacity: 0, y: 7 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                                    >
                                        <div className="admin-feedback-card__top">
                                            <div className="admin-feedback-card__labels">
                                                <span className="admin-feedback-type">{formatFeedbackType(item.type)}</span>
                                                {item.isSeen && <span className="admin-feedback-state-tag">Seen</span>}
                                                {item.isBookmark && <span className="admin-feedback-state-tag admin-feedback-state-tag--bookmark">Bookmarked</span>}
                                                {item.isSpam && <span className="admin-feedback-state-tag admin-feedback-state-tag--spam">Spam</span>}
                                            </div>

                                            <div className="admin-feedback-menu">
                                                <button
                                                    type="button"
                                                    className="admin-feedback-menu__trigger"
                                                    aria-label="Feedback actions"
                                                    aria-controls={'feedback-actions-' + item.feedbackId}
                                                    aria-expanded={String(openFeedbackMenu) === String(item.feedbackId)}
                                                    onClick={() => setOpenFeedbackMenu((current) => (
                                                        String(current) === String(item.feedbackId) ? null : item.feedbackId
                                                    ))}
                                                >
                                                    <MoreVertical size={18} />
                                                </button>

                                                <AnimatePresence>
                                                    {String(openFeedbackMenu) === String(item.feedbackId) && (
                                                        <motion.div
                                                            id={'feedback-actions-' + item.feedbackId}
                                                            className="admin-feedback-menu__panel"
                                                            role="group"
                                                            aria-label="Feedback actions"
                                                            initial={{ opacity: 0, y: -4, scale: 0.98 }}
                                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                                            exit={{ opacity: 0, y: -3, scale: 0.98 }}
                                                            transition={{ duration: 0.14 }}
                                                        >
                                                            <button type="button" disabled={item.isSeen || isBusy} onClick={() => handleFeedbackAction(item, 'seen')}>
                                                                <Eye size={15} /> {item.isSeen ? 'Already marked as seen' : 'Mark as seen'}
                                                            </button>
                                                            <button type="button" disabled={item.isBookmark || isBusy} onClick={() => handleFeedbackAction(item, 'bookmark')}>
                                                                <Bookmark size={15} /> {item.isBookmark ? 'Already bookmarked' : 'Bookmark feedback'}
                                                            </button>
                                                            <button type="button" className="is-danger" disabled={item.isSpam || isBusy} onClick={() => handleFeedbackAction(item, 'spam')}>
                                                                <Flag size={15} /> {item.isSpam ? 'Already marked as spam' : 'Mark feedback as spam'}
                                                            </button>
                                                            <button type="button" className="is-danger" disabled={item.studentIsSpam || isBusy} onClick={() => handleFeedbackAction(item, 'student_spam')}>
                                                                <UserX size={15} /> {item.studentIsSpam ? 'Student already marked as spam' : 'Mark student as spam'}
                                                            </button>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        </div>

                                        <div className="admin-feedback-card__student">
                                            <strong>{item.studentName || 'Unknown student'}</strong>
                                            <span>Student ID: {item.studentId}</span>
                                        </div>

                                        <div className="admin-feedback-card__description">
                                            {isExpanded ? String(item.description || '') : preview.text}
                                        </div>
                                        {preview.canExpand && (
                                            <button
                                                type="button"
                                                className="admin-feedback-card__expand"
                                                aria-expanded={isExpanded}
                                                onClick={() => setExpandedFeedbackId(isExpanded ? null : item.feedbackId)}
                                            >
                                                {isExpanded ? 'Show less' : 'Review full feedback'}
                                            </button>
                                        )}
                                    </motion.article>
                                );
                            })}
                        </div>
                    )}

                    {notice && <div className="admin-feedback-inbox__notice" role="status">{notice}</div>}
                </section>

                <aside className="admin-feedback-inbox__spam" aria-labelledby="spam-students-heading">
                    <div className="admin-feedback-inbox__section-head">
                        <div>
                            <h2 id="spam-students-heading"><ShieldAlert size={16} /> Spam students</h2>
                            <p>Students flagged from the feedback inbox.</p>
                        </div>
                        <span>{spamStudents.length}</span>
                    </div>
                    {spamStudents.length === 0 ? (
                        <div className="admin-feedback-state">No students have been marked as spam.</div>
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
                </aside>
            </div>
        </div>
    );
}
