import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    MoreVertical, Eye, Bookmark, Flag, UserX, ShieldAlert,
} from 'lucide-react';
import { supabase } from '../supabase';
import './AdminFeedbackInbox.css';

function getFeedbackPreview(description, wordLimit = 15) {
    const words = String(description || '').trim().split(/\\s+/).filter(Boolean);
    return {
        text: words.length > wordLimit ? words.slice(0, wordLimit).join(' ') + '…' : words.join(' '),
        canExpand: words.length > wordLimit,
    };
}

function formatFeedbackType(type) {
    return String(type || 'other')
        .replace(/[_-]/g, ' ')
        .replace(/\\b\\w/g, (letter) => letter.toUpperCase());
}

const FEEDBACK_FLAG_CONFIG = Object.freeze([
    {
        action: 'seen',
        field: 'isSeen',
        label: 'Seen',
        Icon: Eye,
        enabledMessage: 'Feedback marked as seen.',
        disabledMessage: 'Feedback marked as unseen.',
    },
    {
        action: 'bookmark',
        field: 'isBookmark',
        label: 'Bookmark',
        Icon: Bookmark,
        enabledMessage: 'Feedback bookmarked.',
        disabledMessage: 'Bookmark removed.',
    },
    {
        action: 'spam',
        field: 'isSpam',
        label: 'Spam',
        Icon: Flag,
        enabledMessage: 'Feedback marked as spam.',
        disabledMessage: 'Spam flag removed.',
    },
]);

const FEEDBACK_FLAG_BY_ACTION = Object.freeze(
    Object.fromEntries(FEEDBACK_FLAG_CONFIG.map((flag) => [flag.action, flag])),
);

export default function AdminFeedbackInbox() {
    const [feedbackRows, setFeedbackRows] = useState([]);
    const [spamStudents, setSpamStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [retry, setRetry] = useState(0);
    const [toast, setToast] = useState(null);
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

    useEffect(() => {
        if (!toast) return undefined;
        const timeoutId = window.setTimeout(() => setToast(null), 2800);
        return () => window.clearTimeout(timeoutId);
    }, [toast]);

    function showToast(message, tone = 'success') {
        setToast({ message, tone, id: String(Date.now()) + '-' + String(Math.random()) });
    }

    async function handleFeedbackToggle(feedback, action) {
        const flag = FEEDBACK_FLAG_BY_ACTION[action];
        if (!flag || actionBusy) return;

        const feedbackId = String(feedback.feedbackId);
        setActionBusy(feedbackId + ':' + action);
        setOpenFeedbackMenu(null);

        try {
            if (!supabase) throw new Error('Feedback service is not configured.');

            const { data, error } = await supabase.rpc('admin_update_feedback_flag', {
                p_feedback_id: feedback.feedbackId,
                p_action: action,
            });
            if (error) throw error;
            if (!data) throw new Error('The feedback status could not be confirmed. Please refresh and try again.');

            setFeedbackRows((rows) => rows.map((row) => (
                String(row.feedbackId) === feedbackId
                    ? {
                        ...row,
                        isSeen: Boolean(data.isSeen),
                        isBookmark: Boolean(data.isBookmark),
                        isSpam: Boolean(data.isSpam),
                    }
                    : row
            )));

            if (data.ok === false) {
                showToast(data.message || 'That status change is not allowed.', 'warning');
                return;
            }

            showToast(
                data[flag.field] ? flag.enabledMessage : flag.disabledMessage,
                'success',
            );
        } catch (error) {
            console.error('[admin-feedback] Moderation toggle failed:', error);
            showToast(error?.message || 'That feedback action could not be saved. Please try again.', 'error');
        } finally {
            setActionBusy('');
        }
    }

    async function handleStudentSpam(feedback) {
        if (actionBusy || feedback.studentIsSpam) return;

        setOpenFeedbackMenu(null);
        setActionBusy('student:' + feedback.studentId);
        try {
            if (!supabase) throw new Error('Feedback service is not configured.');
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
            showToast('Student marked as spam.');
        } catch (error) {
            console.error('[admin-feedback] Student spam action failed:', error);
            showToast(error?.message || 'The student could not be marked as spam.', 'error');
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
                                            </div>

                                            <div className="admin-feedback-menu">
                                                <button
                                                    type="button"
                                                    className="admin-feedback-menu__trigger"
                                                    aria-label="More student actions"
                                                    aria-controls={String(openFeedbackMenu) === String(item.feedbackId) ? 'feedback-actions-' + item.feedbackId : undefined}
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
                                                            aria-label="Student actions"
                                                            initial={{ opacity: 0, y: -4, scale: 0.98 }}
                                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                                            exit={{ opacity: 0, y: -3, scale: 0.98 }}
                                                            transition={{ duration: 0.14 }}
                                                        >
                                                            <button
                                                                type="button"
                                                                className="is-danger"
                                                                disabled={item.studentIsSpam || Boolean(actionBusy)}
                                                                onClick={() => handleStudentSpam(item)}
                                                            >
                                                                <UserX size={15} />
                                                                {item.studentIsSpam ? 'Student already marked as spam' : 'Mark student as spam'}
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

                                        <div
                                            className="admin-feedback-toggles"
                                            role="group"
                                            aria-label={'Moderation flags for feedback ' + item.feedbackId}
                                        >
                                            {FEEDBACK_FLAG_CONFIG.map(({ action, field, label, Icon }) => {
                                                const active = Boolean(item[field]);
                                                return (
                                                    <button
                                                        key={action}
                                                        type="button"
                                                        role="switch"
                                                        aria-label={label}
                                                        aria-checked={active}
                                                        className={'admin-feedback-toggle admin-feedback-toggle--' + action + (active ? ' is-active' : '')}
                                                        disabled={Boolean(actionBusy)}
                                                        onClick={() => handleFeedbackToggle(item, action)}
                                                    >
                                                        <Icon size={16} aria-hidden="true" />
                                                        <span className="admin-feedback-toggle__label">{label}</span>
                                                        <span className="admin-feedback-toggle__state" aria-hidden="true">
                                                            {active ? 'On' : 'Off'}
                                                        </span>
                                                        <span className="admin-feedback-toggle__track" aria-hidden="true" />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </motion.article>
                                );
                            })}
                        </div>
                    )}
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

            <AnimatePresence>
                {toast && (
                    <motion.div
                        key={toast.id}
                        className="admin-feedback-toast"
                        data-tone={toast.tone}
                        role="status"
                        aria-live="polite"
                        initial={{ opacity: 0, y: 16, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.98 }}
                        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                    >
                        {toast.message}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
