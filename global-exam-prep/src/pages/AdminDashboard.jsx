/**
 * Admin Dashboard — staged command center.
 * The compact overview paints first; analytics and moderation panels hydrate independently.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Activity, AlertTriangle, ArrowUpRight, Bookmark, BookOpen, CheckCircle2,
    ChevronRight, ClipboardCheck, Crown, Flag, MessageSquare, RefreshCw,
    ShieldAlert, UserMinus, UserPlus, UserRound, Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase';
import { manageAdminStaff } from '../utils/supabaseAuth';
import './AdminDashboard.css';

const EMPTY_ARRAY = [];

function count(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function MetricCard({ icon: Icon, label, value, meta, tone = 'neutral', loading, error }) {
    return (
        <article className={'admin-metric admin-metric--' + tone}>
            <div className="admin-metric__top">
                <span className="admin-metric__icon"><Icon size={17} /></span>
                <span className="admin-metric__label">{label}</span>
            </div>
            {loading ? (
                <div className="admin-skeleton admin-skeleton--metric" aria-label={'Loading ' + label} />
            ) : (
                <strong className="admin-metric__value">{error ? '—' : count(value).toLocaleString('en-IN')}</strong>
            )}
            <span className="admin-metric__meta">{error ? 'Unavailable' : meta}</span>
        </article>
    );
}

function PanelSkeleton({ rows = 3 }) {
    return (
        <div className="admin-panel-skeleton" aria-label="Loading dashboard data">
            {Array.from({ length: rows }, (_, index) => (
                <div className="admin-panel-skeleton__row" key={index}>
                    <span className="admin-skeleton admin-skeleton--avatar" />
                    <span className="admin-panel-skeleton__lines">
                        <span className="admin-skeleton admin-skeleton--line" />
                        <span className="admin-skeleton admin-skeleton--line-short" />
                    </span>
                    <span className="admin-skeleton admin-skeleton--pill" />
                </div>
            ))}
        </div>
    );
}

function PanelError({ message, onRetry }) {
    return (
        <div className="admin-panel-state admin-panel-state--error" role="alert">
            <AlertTriangle size={16} />
            <span>{message || 'Could not load this section.'}</span>
            <button type="button" onClick={onRetry} aria-label="Retry loading this section">
                <RefreshCw size={14} /> Retry
            </button>
        </div>
    );
}

function PanelEmpty({ icon: Icon, children }) {
    return (
        <div className="admin-panel-state">
            <Icon size={19} />
            <span>{children}</span>
        </div>
    );
}

function formatComparison(current, previous) {
    const delta = count(current) - count(previous);
    if (delta === 0) return 'No change';
    return (delta > 0 ? '+' : '−') + Math.abs(delta).toLocaleString('en-IN') + ' vs prior week';
}

function StaffRole({ isSuperAdmin }) {
    return isSuperAdmin ? (
        <span className="admin-role-pill admin-role-pill--super"><Crown size={12} /> Super Admin</span>
    ) : (
        <span className="admin-role-pill">Admin</span>
    );
}

export default function AdminDashboard() {
    const { isSuperAdmin, adminProfile } = useAuth();
    const [overview, setOverview] = useState({ status: 'loading', data: null, error: '' });
    const [subjects, setSubjects] = useState({ status: 'loading', data: EMPTY_ARRAY, error: '' });
    const [moderation, setModeration] = useState({ status: 'loading', data: null, error: '' });
    const [staff, setStaff] = useState({ status: 'loading', data: EMPTY_ARRAY, error: '' });

    const [overviewRetry, setOverviewRetry] = useState(0);
    const [subjectRetry, setSubjectRetry] = useState(0);
    const [moderationRetry, setModerationRetry] = useState(0);
    const [staffRetry, setStaffRetry] = useState(0);

    const [notice, setNotice] = useState('');
    const [modal, setModal] = useState(null);
    const [form, setForm] = useState({ name: '', email: '', target: '' });
    const [staffBusy, setStaffBusy] = useState(false);

    // Stage 1: one compact request for the overview metrics.
    useEffect(() => {
        let active = true;
        async function loadOverview() {
            setOverview((state) => ({ ...state, status: 'loading', error: '' }));
            try {
                if (!supabase) throw new Error('Dashboard service is not configured.');
                const { data, error } = await supabase.rpc('admin_get_dashboard_overview');
                if (error) throw error;
                if (active) setOverview({ status: 'success', data: data || {}, error: '' });
            } catch (error) {
                if (!active) return;
                console.error('[admin-dashboard] Overview request failed:', error);
                setOverview({ status: 'error', data: null, error: error?.message || 'Overview could not be loaded.' });
            }
        }
        loadOverview();
        return () => { active = false; };
    }, [overviewRetry]);

    // Stage 2: independent section calls start after the overview has painted.
    useEffect(() => {
        if (overview.status !== 'success') return undefined;
        let active = true;
        async function loadSubjects() {
            setSubjects((state) => ({ ...state, status: 'loading', error: '' }));
            try {
                const { data, error } = await supabase.rpc('admin_get_dashboard_subject_activity');
                if (error) throw error;
                if (active) setSubjects({ status: 'success', data: Array.isArray(data) ? data : EMPTY_ARRAY, error: '' });
            } catch (error) {
                if (!active) return;
                console.error('[admin-dashboard] Subject activity request failed:', error);
                setSubjects({ status: 'error', data: EMPTY_ARRAY, error: error?.message || 'Subject activity could not be loaded.' });
            }
        }
        loadSubjects();
        return () => { active = false; };
    }, [overview.status, subjectRetry]);

    useEffect(() => {
        if (overview.status !== 'success') return undefined;
        let active = true;
        async function loadModeration() {
            setModeration((state) => ({ ...state, status: 'loading', error: '' }));
            try {
                const { data, error } = await supabase.rpc('admin_get_dashboard_moderation_preview', { p_limit: 4 });
                if (error) throw error;
                if (active) setModeration({ status: 'success', data: data || {}, error: '' });
            } catch (error) {
                if (!active) return;
                console.error('[admin-dashboard] Moderation preview request failed:', error);
                setModeration({ status: 'error', data: null, error: error?.message || 'Moderation preview could not be loaded.' });
            }
        }
        loadModeration();
        return () => { active = false; };
    }, [overview.status, moderationRetry]);

    // The full staff directory is fetched only for a verified Super Admin.
    useEffect(() => {
        if (overview.status !== 'success' || !isSuperAdmin) return undefined;
        let active = true;
        async function loadStaff() {
            setStaff((state) => ({ ...state, status: 'loading', error: '' }));
            try {
                const { data, error } = await supabase.rpc('admin_get_dashboard_staff');
                if (error) throw error;
                if (active) setStaff({ status: 'success', data: Array.isArray(data) ? data : EMPTY_ARRAY, error: '' });
            } catch (error) {
                if (!active) return;
                console.error('[admin-dashboard] Staff directory request failed:', error);
                setStaff({ status: 'error', data: EMPTY_ARRAY, error: error?.message || 'Staff directory could not be loaded.' });
            }
        }
        loadStaff();
        return () => { active = false; };
    }, [overview.status, isSuperAdmin, staffRetry]);

    function closeModal() {
        setModal(null);
        setForm({ name: '', email: '', target: '' });
    }

    async function submitModal(event) {
        event.preventDefault();
        if (!isSuperAdmin) {
            setNotice('Only a Super Admin can change staff.');
            closeModal();
            return;
        }

        const action = modal === 'add' ? 'add' : modal === 'super' ? 'add_super' : 'remove';
        const email = modal === 'remove' ? form.target : form.email;
        setStaffBusy(true);
        try {
            await manageAdminStaff(supabase, { action, email, fullName: form.name });
            setNotice(action === 'remove'
                ? 'Admin access removed.'
                : action === 'add_super'
                    ? 'Super Admin access added.'
                    : 'Admin access added.');
            closeModal();
            setStaffRetry((value) => value + 1);
            setOverviewRetry((value) => value + 1);
        } catch (error) {
            setNotice(error?.message || 'The staff change could not be completed.');
        } finally {
            setStaffBusy(false);
        }
    }

    const overviewData = overview.data || {};
    const subjectRows = subjects.data || EMPTY_ARRAY;
    const bookmarkRows = moderation.data?.bookmarkedFeedback || EMPTY_ARRAY;
    const flaggedRows = moderation.data?.flaggedStudents || EMPTY_ARRAY;
    const staffRows = staff.data || EMPTY_ARRAY;
    const highestAttempts = Math.max(1, ...subjectRows.map((row) => count(row.attempts)));
    const currentEmail = String(adminProfile?.email || '').toLowerCase();
    const removableStaff = staffRows.filter((member) => String(member.email || '').toLowerCase() !== currentEmail);

    return (
        <div className="admin-dash admin-dash--command">
            <header className="admin-dashboard-head">
                <div>
                    <span className="admin-dashboard-eyebrow">ADMINISTRATION</span>
                    <h1>Dashboard</h1>
                </div>
                <span className="admin-dashboard-period"><Activity size={14} /> Live overview</span>
            </header>

            <section className="admin-dashboard-metrics" aria-label="Platform overview">
                <MetricCard icon={Users} label="Students" value={overviewData.students} meta="Registered accounts" loading={overview.status === 'loading'} error={overview.status === 'error'} />
                <MetricCard icon={ClipboardCheck} label="Exam attempts" value={overviewData.attemptsLast7Days} meta="Finalized · last 7 days" tone="gold" loading={overview.status === 'loading'} error={overview.status === 'error'} />
                <MetricCard icon={MessageSquare} label="Pending feedback" value={overviewData.pendingFeedback} meta="Awaiting review" tone="violet" loading={overview.status === 'loading'} error={overview.status === 'error'} />
                <MetricCard icon={ShieldAlert} label="Flagged students" value={overviewData.flaggedStudents} meta="Student accounts" tone="red" loading={overview.status === 'loading'} error={overview.status === 'error'} />
            </section>

            {overview.status === 'error' && (
                <PanelError message={overview.error} onRetry={() => setOverviewRetry((value) => value + 1)} />
            )}

            {overview.status === 'success' && (
                <>
            <section className="admin-dashboard-panel admin-dashboard-panel--subjects" aria-labelledby="admin-subject-activity-title">
                <div className="admin-dashboard-panel__head">
                    <div className="admin-dashboard-panel__title">
                        <span className="admin-dashboard-panel__icon admin-dashboard-panel__icon--gold"><BookOpen size={17} /></span>
                        <div>
                            <h2 id="admin-subject-activity-title">Most attempted subjects</h2>
                            <span>Finalized exams · last 7 days</span>
                        </div>
                    </div>
                    <span className="admin-dashboard-period">TOP 3</span>
                </div>

                {subjects.status === 'loading' ? (
                    <PanelSkeleton rows={3} />
                ) : subjects.status === 'error' ? (
                    <PanelError message={subjects.error} onRetry={() => setSubjectRetry((value) => value + 1)} />
                ) : subjectRows.length === 0 ? (
                    <PanelEmpty icon={BookOpen}>No finalized subject attempts in the last 7 days.</PanelEmpty>
                ) : (
                    <div className="admin-subject-ranking">
                        {subjectRows.map((subject, index) => {
                            const attempts = count(subject.attempts);
                            const previous = count(subject.previousAttempts);
                            const delta = attempts - previous;
                            return (
                                <div className="admin-subject-row" key={subject.subjectId}>
                                    <span className={'admin-subject-rank admin-subject-rank--' + (index + 1)}>{index + 1}</span>
                                    <div className="admin-subject-row__main">
                                        <div className="admin-subject-row__identity">
                                            <strong>{subject.subjectName || 'Unknown subject'}</strong>
                                            <span>{subject.courseName || 'Course'} · Sem {subject.semester ?? '—'}</span>
                                        </div>
                                        <div className="admin-subject-bar" aria-label={attempts + ' attempts'}>
                                            <span style={{ width: Math.max(5, (attempts / highestAttempts) * 100) + '%' }} />
                                        </div>
                                    </div>
                                    <div className="admin-subject-row__stats">
                                        <strong>{attempts.toLocaleString('en-IN')}</strong>
                                        <span>attempts</span>
                                        <small className={delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : ''}>
                                            {formatComparison(attempts, previous)}
                                        </small>
                                    </div>
                                    <div className="admin-subject-row__mix">
                                        <span>{count(subject.normalAttempts)} Exam</span>
                                        <span>{count(subject.testRoomAttempts)} Test Room</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            <div className="admin-dashboard-grid">
                <section className="admin-dashboard-panel admin-dashboard-panel--bookmarks" aria-labelledby="admin-bookmarks-title">
                    <div className="admin-dashboard-panel__head">
                        <div className="admin-dashboard-panel__title">
                            <span className="admin-dashboard-panel__icon admin-dashboard-panel__icon--violet"><Bookmark size={17} /></span>
                            <div>
                                <h2 id="admin-bookmarks-title">Bookmarked feedback</h2>
                                <span>{overview.status === 'success' ? count(overviewData.bookmarkedFeedback) + ' saved' : 'Saved items'}</span>
                            </div>
                        </div>
                        <Link to="/feedback" className="admin-panel-link" aria-label="Open feedback inbox"><ArrowUpRight size={16} /></Link>
                    </div>

                    {moderation.status === 'loading' ? (
                        <PanelSkeleton rows={3} />
                    ) : moderation.status === 'error' ? (
                        <PanelError message={moderation.error} onRetry={() => setModerationRetry((value) => value + 1)} />
                    ) : bookmarkRows.length === 0 ? (
                        <PanelEmpty icon={Bookmark}>No bookmarked feedback.</PanelEmpty>
                    ) : (
                        <div className="admin-feedback-preview-list">
                            {bookmarkRows.map((item) => (
                                <Link to="/feedback" className="admin-feedback-preview" key={item.feedbackId}>
                                    <div className="admin-feedback-preview__top">
                                        <span className="admin-feedback-type">{item.type || 'Feedback'}</span>
                                        <span className="admin-feedback-preview__flags">
                                            {item.isSpam && <span className="admin-mini-pill admin-mini-pill--red">Spam</span>}
                                            {item.isSeen
                                                ? <span className="admin-mini-pill">Seen</span>
                                                : <span className="admin-mini-pill admin-mini-pill--gold">New</span>}
                                        </span>
                                    </div>
                                    <p>{item.description || 'No description provided.'}</p>
                                    <div className="admin-feedback-preview__foot">
                                        <span>{item.studentName || 'Unknown student'}</span>
                                        <span>ID {item.studentId}</span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                    <Link to="/feedback" className="admin-dashboard-card-footer">Open feedback inbox <ChevronRight size={15} /></Link>
                </section>

                <section className="admin-dashboard-panel admin-dashboard-panel--flagged" aria-labelledby="admin-flagged-title">
                    <div className="admin-dashboard-panel__head">
                        <div className="admin-dashboard-panel__title">
                            <span className="admin-dashboard-panel__icon admin-dashboard-panel__icon--red"><Flag size={17} /></span>
                            <div>
                                <h2 id="admin-flagged-title">Flagged students</h2>
                                <span>{overview.status === 'success' ? count(overviewData.flaggedStudents) + ' accounts' : 'Moderation queue'}</span>
                            </div>
                        </div>
                        <Link to="/feedback" className="admin-panel-link" aria-label="Manage flagged students"><ArrowUpRight size={16} /></Link>
                    </div>

                    {moderation.status === 'loading' ? (
                        <PanelSkeleton rows={3} />
                    ) : moderation.status === 'error' ? (
                        <PanelError message={moderation.error} onRetry={() => setModerationRetry((value) => value + 1)} />
                    ) : flaggedRows.length === 0 ? (
                        <PanelEmpty icon={CheckCircle2}>No flagged student accounts.</PanelEmpty>
                    ) : (
                        <div className="admin-flagged-list">
                            {flaggedRows.map((student) => (
                                <Link to="/feedback" className="admin-flagged-row" key={student.studentId}>
                                    <span className="admin-flagged-avatar"><UserRound size={17} /></span>
                                    <span className="admin-flagged-row__identity">
                                        <strong>{student.studentName || 'Unknown student'}</strong>
                                        <small>{student.email || ('Student ID ' + student.studentId)}</small>
                                    </span>
                                    <span className="admin-mini-pill admin-mini-pill--red">Flagged</span>
                                    <small className="admin-flagged-row__count">{count(student.feedbackCount)} feedback</small>
                                </Link>
                            ))}
                        </div>
                    )}
                    <Link to="/feedback" className="admin-dashboard-card-footer">Open moderation inbox <ChevronRight size={15} /></Link>
                </section>
            </div>

            {isSuperAdmin && (
                <section className="admin-card admin-card--staff admin-dashboard-staff" aria-labelledby="staff-heading">
                    <div className="admin-card__head admin-dashboard-staff__head">
                        <div className="admin-dashboard-panel__title">
                            <span className="admin-dashboard-panel__icon admin-dashboard-panel__icon--gold"><Crown size={17} /></span>
                            <div>
                                <h2 id="staff-heading">Administration team</h2>
                                <span>{staff.status === 'success' ? staffRows.length + ' staff accounts' : 'Super Admin directory'}</span>
                            </div>
                        </div>
                        <span className="admin-card__tag">SUPER ADMIN</span>
                    </div>

                    {staff.status === 'loading' ? (
                        <PanelSkeleton rows={2} />
                    ) : staff.status === 'error' ? (
                        <PanelError message={staff.error} onRetry={() => setStaffRetry((value) => value + 1)} />
                    ) : staffRows.length === 0 ? (
                        <PanelEmpty icon={Users}>No staff accounts found.</PanelEmpty>
                    ) : (
                        <div className="admin-staff-directory">
                            {staffRows.map((member) => (
                                <div className="admin-staff-directory__row" key={member.adminId}>
                                    <span className={'admin-staff-directory__avatar' + (member.isSuperAdmin ? ' is-super' : '')}>
                                        {member.isSuperAdmin ? <Crown size={17} /> : <UserRound size={17} />}
                                    </span>
                                    <span className="admin-staff-directory__identity">
                                        <strong>{member.name || 'Admin'}</strong>
                                        <small>{member.email}</small>
                                    </span>
                                    <StaffRole isSuperAdmin={Boolean(member.isSuperAdmin)} />
                                </div>
                            ))}
                        </div>
                    )}

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

                </>
            )}

            <AnimatePresence>
                {notice && (
                    <motion.div className="admin-notice" role="status" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
                        {notice}
                        <button type="button" onClick={() => setNotice('')} aria-label="Dismiss notification">×</button>
                    </motion.div>
                )}
                {modal && (
                    <motion.div className="admin-modal-backdrop" onClick={closeModal} role="presentation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <motion.form
                            className="admin-modal"
                            onClick={(event) => event.stopPropagation()}
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
                            <p>That email must already have a PrepMaster account.</p>
                            {modal !== 'remove' ? (
                                <>
                                    <div className="admin-field">
                                        <label htmlFor="staff-name">Full name</label>
                                        <input id="staff-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Name" autoComplete="off" required />
                                    </div>
                                    <div className="admin-field">
                                        <label htmlFor="staff-email">Email</label>
                                        <input id="staff-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="admin@example.com" autoComplete="off" required />
                                    </div>
                                </>
                            ) : (
                                <div className="admin-field">
                                    <label htmlFor="staff-target">Select admin</label>
                                    <select id="staff-target" value={form.target} onChange={(event) => setForm({ ...form, target: event.target.value })} required>
                                        <option value="">Choose staff account</option>
                                        {removableStaff.map((member) => (
                                            <option key={member.adminId} value={member.email}>
                                                {member.name || 'Admin'} · {member.email}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div className="admin-modal__row">
                                <button type="button" className="admin-btn" onClick={closeModal}>Cancel</button>
                                <button type="submit" className={'admin-btn admin-btn--gold' + (modal === 'remove' ? ' admin-btn--danger' : '')} disabled={staffBusy || (modal === 'remove' && removableStaff.length === 0)}>
                                    {staffBusy ? 'Saving…' : 'Confirm'}
                                </button>
                            </div>
                        </motion.form>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
