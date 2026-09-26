/**
 * Phase 3 — admin catalog UI (Course → Semester → Subject → Question).
 * In-memory preview only. No Supabase, Firebase, API, or persistence.
 *
 * Question fields follow TestsData + the existing generator:
 *   objective → text, options[], answer index
 *   subjective → text, marks
 * Semesters are selected from the course Sems list (no semester CRUD).
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
    ArrowLeft, BookOpen, Plus, Layers, GraduationCap,
    ListChecks, FileText, Pencil, Trash2,
} from 'lucide-react';
import './AdminCourses.css';

const PREVIEW = 'Preview only — no data was changed.';

const SEED = [
    {
        id: 'btech-ce',
        title: 'B.Tech - Computer Engineering',
        semesters: [1, 2],
        subjects: [
            {
                id: '01ma0106',
                title: 'Calculus',
                sem: 1,
                questions: [
                    {
                        id: 'q-ce-1',
                        type: 'objective',
                        text: 'The derivative of sin(x) is',
                        options: ['cos(x)', '−cos(x)', 'tan(x)', 'sec(x)'],
                        answer: 0,
                    },
                    {
                        id: 'q-ce-2',
                        type: 'subjective',
                        text: 'State the fundamental theorem of calculus and give one application.',
                        marks: 7,
                    },
                ],
            },
            {
                id: '01ce1101',
                title: 'Computer Programming',
                sem: 1,
                questions: [
                    {
                        id: 'q-ce-3',
                        type: 'objective',
                        text: 'Which symbol starts a preprocessor directive in C?',
                        options: ['#', '@', '$', '%'],
                        answer: 0,
                    },
                ],
            },
            {
                id: '01ce0104',
                title: 'Object Oriented Programming',
                sem: 2,
                questions: [],
            },
        ],
    },
    {
        id: 'btech-it',
        title: 'B.Tech - IT',
        semesters: [1, 2],
        subjects: [
            {
                id: '02it1101',
                title: 'Digital Logic',
                sem: 1,
                questions: [
                    {
                        id: 'q-it-1',
                        type: 'objective',
                        text: 'A full adder has how many inputs?',
                        options: ['2', '3', '4', '1'],
                        answer: 1,
                    },
                ],
            },
        ],
    },
];

const blankObjective = () => ({
    type: 'objective',
    text: '',
    options: ['', '', '', ''],
    answer: 0,
    marks: 7,
});

function nid(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function HierarchyMark() {
    return (
        <svg className="ac-mark" viewBox="0 0 220 56" role="img" aria-hidden="true" focusable="false">
            <path className="ac-mark__wire" d="M18 28 H70 M70 28 H118 M118 28 H170 M170 28 H202" fill="none" />
            <circle cx="18" cy="28" r="7" className="ac-mark__node ac-mark__node--c" />
            <circle cx="70" cy="28" r="6" className="ac-mark__node ac-mark__node--s" />
            <circle cx="118" cy="28" r="6" className="ac-mark__node ac-mark__node--u" />
            <rect x="158" y="16" width="24" height="24" rx="5" className="ac-mark__q" />
            <text x="18" y="50" textAnchor="middle">C</text>
            <text x="70" y="50" textAnchor="middle">Se</text>
            <text x="118" y="50" textAnchor="middle">Su</text>
            <text x="170" y="50" textAnchor="middle">Q</text>
        </svg>
    );
}

export default function AdminCourses() {
    const [courses, setCourses] = useState(SEED);
    const [courseId, setCourseId] = useState(SEED[0].id);
    const [sem, setSem] = useState(1);
    const [subjectId, setSubjectId] = useState(SEED[0].subjects[0].id);
    const [focusId, setFocusId] = useState(SEED[0].subjects[0].questions[0]?.id ?? null);
    const [modal, setModal] = useState(null);
    const [form, setForm] = useState({});
    const [pending, setPending] = useState(null);
    const [toast, setToast] = useState('');
    const [error, setError] = useState('');
    const [dirty, setDirty] = useState(false);

    const course = courses.find((c) => c.id === courseId) || null;
    const subjects = useMemo(
        () => (course && sem != null ? course.subjects.filter((s) => s.sem === sem) : []),
        [course, sem],
    );
    const subject = subjects.find((s) => s.id === subjectId) || null;
    const questions = subject?.questions ?? [];
    const focused = questions.find((q) => q.id === focusId) || questions[0] || null;

    function flash(msg) {
        setToast(msg);
        window.setTimeout(() => setToast(''), 2800);
    }

    function closeModal() {
        setModal(null);
        setForm({});
        setError('');
        setDirty(false);
    }

    function setField(patch) {
        setForm((f) => ({ ...f, ...patch }));
        setDirty(true);
    }

    function pickCourse(id) {
        const next = courses.find((c) => c.id === id);
        setCourseId(id);
        const firstSem = next?.semesters[0] ?? null;
        setSem(firstSem);
        const firstSub = next?.subjects.find((s) => s.sem === firstSem) ?? null;
        setSubjectId(firstSub?.id ?? null);
        setFocusId(firstSub?.questions[0]?.id ?? null);
        setPending(null);
    }

    function pickSem(n) {
        setSem(n);
        const firstSub = course?.subjects.find((s) => s.sem === n) ?? null;
        setSubjectId(firstSub?.id ?? null);
        setFocusId(firstSub?.questions[0]?.id ?? null);
        setPending(null);
    }

    function pickSubject(id) {
        setSubjectId(id);
        const sub = course?.subjects.find((s) => s.id === id);
        setFocusId(sub?.questions[0]?.id ?? null);
        setPending(null);
    }

    function patchCourse(id, updater) {
        setCourses((list) => list.map((c) => (c.id === id ? updater(c) : c)));
    }

    function openAddCourse() {
        setPending(null);
        setForm({ title: '', semesters: '1, 2' });
        setDirty(false);
        setModal('course-add');
    }
    function openEditCourse(c) {
        if (!c) return;
        setPending(null);
        setForm({ id: c.id, title: c.title, semesters: c.semesters.join(', ') });
        setDirty(false);
        setModal('course-edit');
    }
    function parseSems(raw) {
        const nums = String(raw)
            .split(/[, ]+/)
            .map((n) => parseInt(n, 10))
            .filter((n) => Number.isInteger(n) && n >= 1 && n <= 12);
        return [...new Set(nums)].sort((a, b) => a - b);
    }
    function saveCourse(e) {
        e.preventDefault();
        const title = String(form.title || '').trim();
        const semesters = parseSems(form.semesters);
        if (!title || semesters.length === 0) {
            setError('Course name and at least one semester (1–12) are required.');
            return;
        }
        if (modal === 'course-add') {
            const id = nid('course');
            setCourses((list) => [...list, { id, title, semesters, subjects: [] }]);
            setCourseId(id);
            setSem(semesters[0]);
            setSubjectId(null);
            setFocusId(null);
        } else if (form.id) {
            patchCourse(form.id, (c) => ({ ...c, title, semesters }));
            setCourseId(form.id);
            if (!semesters.includes(sem)) {
                setSem(semesters[0]);
                setSubjectId(null);
                setFocusId(null);
            }
        }
        closeModal();
        flash(PREVIEW);
    }
    function confirmRemoveCourse() {
        const id = pending?.id;
        if (!id) return;
        const rest = courses.filter((c) => c.id !== id);
        setCourses(rest);
        if (courseId === id) {
            if (rest[0]) pickCourse(rest[0].id);
            else {
                setCourseId(null);
                setSem(null);
                setSubjectId(null);
                setFocusId(null);
            }
        }
        setPending(null);
        flash(PREVIEW);
    }

    function openAddSubject() {
        setPending(null);
        setForm({ title: '', code: '', courseId, sem: sem ?? course?.semesters[0] ?? 1 });
        setDirty(false);
        setModal('subject-add');
    }
    function openEditSubject(sub) {
        setPending(null);
        setForm({
            id: sub.id,
            title: sub.title,
            code: sub.id,
            courseId,
            sem: sub.sem,
        });
        setDirty(false);
        setModal('subject-edit');
    }
    function saveSubject(e) {
        e.preventDefault();
        const title = String(form.title || '').trim();
        const code = String(form.code || '').trim() || nid('sub');
        const destCourse = form.courseId;
        const destSem = Number(form.sem);
        if (!title || !destCourse || !destSem) {
            setError('Course, semester and subject name are required.');
            return;
        }
        setCourses((list) => list.map((c) => {
            let nextSubjects = c.subjects;
            if (modal === 'subject-edit') {
                nextSubjects = nextSubjects.filter((s) => s.id !== form.id);
            }
            if (c.id !== destCourse) return { ...c, subjects: nextSubjects };
            const existing = modal === 'subject-edit'
                ? (course?.subjects.find((s) => s.id === form.id) || { questions: [] })
                : { questions: [] };
            const next = { id: code, title, sem: destSem, questions: existing.questions || [] };
            return { ...c, subjects: [...nextSubjects.filter((s) => s.id !== code), next] };
        }));
        setCourseId(destCourse);
        setSem(destSem);
        setSubjectId(code);
        closeModal();
        flash(PREVIEW);
    }
    function confirmRemoveSubject() {
        const id = pending?.id;
        if (!id || !courseId) return;
        patchCourse(courseId, (c) => ({ ...c, subjects: c.subjects.filter((s) => s.id !== id) }));
        if (subjectId === id) {
            setSubjectId(null);
            setFocusId(null);
        }
        setPending(null);
        flash(PREVIEW);
    }

    function openAddQuestion() {
        setPending(null);
        setForm({ ...blankObjective(), courseId, subjectId });
        setDirty(false);
        setModal('question-add');
    }
    function openEditQuestion(q) {
        setPending(null);
        setFocusId(q.id);
        setForm({
            ...blankObjective(),
            ...q,
            options: q.options ? [...q.options] : ['', '', '', ''],
            courseId,
            subjectId,
        });
        setDirty(false);
        setModal('question-edit');
    }
    function saveQuestion(e) {
        e.preventDefault();
        const text = String(form.text || '').trim();
        const destCourse = form.courseId;
        const destSubject = form.subjectId;
        if (!text || !destCourse || !destSubject) {
            setError('Course, subject and question text are required.');
            return;
        }
        const payload = form.type === 'subjective'
            ? { id: form.id || nid('q'), type: 'subjective', text, marks: Number(form.marks) || 7 }
            : {
                id: form.id || nid('q'),
                type: 'objective',
                text,
                options: (form.options || ['', '', '', '']).map((o) => String(o)),
                answer: Number(form.answer) || 0,
            };
        setCourses((list) => list.map((c) => {
            const nextSubjects = c.subjects.map((s) => {
                let qs = s.questions;
                if (modal === 'question-edit' && form.id) qs = qs.filter((q) => q.id !== form.id);
                if (c.id === destCourse && s.id === destSubject) {
                    return { ...s, questions: [...qs.filter((q) => q.id !== payload.id), payload] };
                }
                return { ...s, questions: qs };
            });
            return { ...c, subjects: nextSubjects };
        }));
        setCourseId(destCourse);
        const dest = courses.flatMap((c) => c.subjects).find((s) => s.id === destSubject);
        if (dest) setSem(dest.sem);
        setSubjectId(destSubject);
        setFocusId(payload.id);
        closeModal();
        flash(PREVIEW);
    }
    function confirmRemoveQuestion() {
        const id = pending?.id;
        if (!id || !courseId || !subjectId) return;
        patchCourse(courseId, (c) => ({
            ...c,
            subjects: c.subjects.map((s) =>
                s.id === subjectId ? { ...s, questions: s.questions.filter((q) => q.id !== id) } : s),
        }));
        if (focusId === id) setFocusId(null);
        setPending(null);
        flash(PREVIEW);
    }

    const subjectsForFormCourse = courses.find((c) => c.id === form.courseId)?.subjects || [];
    const editing = modal === 'course-add' || modal === 'course-edit'
        || modal === 'subject-add' || modal === 'subject-edit'
        || modal === 'question-add' || modal === 'question-edit';

    return (
        <div className="ac">
            <header className="ac__hero">
                <div>
                    <div className="ac__kicker">Admin · Courses</div>
                    <h1 className="ac__title">Catalog</h1>
                    <div className="ac__crumb" data-testid="catalog-crumb">
                        <strong>{course?.title || 'No course'}</strong>
                        <span>→</span>
                        {sem != null ? <strong>Sem {sem}</strong> : 'Semester'}
                        <span>→</span>
                        <strong>{subject?.title || 'Subject'}</strong>
                        <span>→</span>
                        Questions
                    </div>
                </div>
                <div className="ac__hero-side">
                    <HierarchyMark />
                    <Link to="/dashboard" className="ac-btn ac-btn--ghost" style={{ textDecoration: 'none' }}>
                        <ArrowLeft size={12} style={{ marginRight: 4 }} /> Dashboard
                    </Link>
                </div>
            </header>

            <motion.section
                className="ac-rail"
                aria-labelledby="course-heading"
                key={courseId || 'none'}
                initial={{ opacity: 0.65 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.28 }}
            >
                <div className="ac-rail__head">
                    <h2 id="course-heading">
                        <GraduationCap size={16} style={{ marginRight: 8, verticalAlign: -3 }} />
                        {course?.title || 'Course'}
                    </h2>
                    <button type="button" className="ac-btn ac-btn--gold" onClick={openAddCourse}>
                        <Plus size={12} style={{ marginRight: 4 }} /> Add Course
                    </button>
                </div>
                {courses.length === 0 ? (
                    <div className="ac-empty">No courses yet.</div>
                ) : (
                    <div className="ac-courses">
                        {courses.map((c, i) => (
                            <div key={c.id} className={`ac-course ${c.id === courseId ? 'is-on' : ''} ${pending?.type === 'course' && pending.id === c.id ? 'is-warn' : ''}`}>
                                <button
                                    type="button"
                                    className="ac-course__hit"
                                    aria-label={c.title}
                                    aria-pressed={c.id === courseId}
                                    onClick={() => pickCourse(c.id)}
                                >
                                    <span className="ac-course__glyph" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
                                    <span className="ac-course__name">{c.title}</span>
                                    <span className="ac-course__meta">{c.semesters.length} sem · {c.subjects.length} subjects</span>
                                </button>
                                {pending?.type === 'course' && pending.id === c.id ? (
                                    <div className="ac-warn">
                                        <button type="button" className="ac-btn ac-btn--ghost" onClick={() => setPending(null)}>Cancel</button>
                                        <button type="button" className="ac-btn ac-btn--danger" onClick={confirmRemoveCourse}>Confirm remove</button>
                                    </div>
                                ) : (
                                    <div className="ac-course__ops">
                                        <button type="button" className="ac-btn ac-btn--ghost" onClick={() => { pickCourse(c.id); openEditCourse(c); }}>
                                            <Pencil size={11} /> Edit
                                        </button>
                                        <button
                                            type="button"
                                            className="ac-btn ac-btn--danger"
                                            onClick={() => { pickCourse(c.id); setPending({ type: 'course', id: c.id, title: c.title }); }}
                                        >
                                            <Trash2 size={11} /> Remove
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </motion.section>

            <section className="ac-path" aria-label="Semesters">
                <div className="ac-path__label"><Layers size={14} /> Semester</div>
                {!course ? (
                    <div className="ac-empty">Select a course.</div>
                ) : (
                    <div className="ac-sems">
                        {course.semesters.map((n, i) => (
                            <span key={n} className="ac-sem-wrap">
                                {i > 0 && <span className={`ac-sem-wire ${sem === n || course.semesters.indexOf(sem) > i - 1 ? 'is-on' : ''}`} aria-hidden />}
                                <button
                                    type="button"
                                    className={`ac-sem ${sem === n ? 'is-on' : ''}`}
                                    onClick={() => pickSem(n)}
                                >
                                    <i />
                                    Sem {n}
                                </button>
                            </span>
                        ))}
                    </div>
                )}
            </section>

            <section className="ac-mods" aria-labelledby="subjects-heading">
                <div className="ac-panel__head">
                    <h2 id="subjects-heading">
                        <BookOpen size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                        Subjects {sem != null ? `· Sem ${sem}` : ''}
                    </h2>
                    <button type="button" className="ac-btn ac-btn--gold" disabled={!course} onClick={openAddSubject}>
                        Add Subject
                    </button>
                </div>
                {!course || sem == null ? (
                    <div className="ac-empty">Select a course and semester.</div>
                ) : subjects.length === 0 ? (
                    <div className="ac-empty">No subjects in this semester.</div>
                ) : (
                    <div className="ac-mods__grid">
                        {subjects.map((s) => (
                            <div
                                key={s.id}
                                className={`ac-row ${s.id === subjectId ? 'is-on' : ''} ${pending?.type === 'subject' && pending.id === s.id ? 'is-warn' : ''}`}
                                onClick={() => pickSubject(s.id)}
                                onKeyDown={(e) => { if (e.key === 'Enter') pickSubject(s.id); }}
                                role="button"
                                tabIndex={0}
                                aria-label={s.title}
                            >
                                <div className="ac-row__orb" aria-hidden />
                                <div>
                                    <div className="ac-row__title">{s.title}</div>
                                    <div className="ac-row__sub">{s.id} · {s.questions.length} questions</div>
                                </div>
                                {pending?.type === 'subject' && pending.id === s.id ? (
                                    <div className="ac-warn" onClick={(e) => e.stopPropagation()}>
                                        <button type="button" className="ac-btn ac-btn--ghost" onClick={() => setPending(null)}>Cancel</button>
                                        <button type="button" className="ac-btn ac-btn--danger" onClick={confirmRemoveSubject}>Confirm remove</button>
                                    </div>
                                ) : (
                                    <div className="ac-ops" onClick={(e) => e.stopPropagation()}>
                                        <button type="button" className="ac-btn" onClick={() => openEditSubject(s)}>Edit</button>
                                        <button
                                            type="button"
                                            className="ac-btn ac-btn--danger"
                                            onClick={() => setPending({ type: 'subject', id: s.id, title: s.title })}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className="ac-bench" aria-labelledby="questions-heading">
                <div className="ac-nav">
                    <div className="ac-panel__head">
                        <h2 id="questions-heading">
                            <ListChecks size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                            Questions
                        </h2>
                        <button type="button" className="ac-btn ac-btn--gold" disabled={!subject} onClick={openAddQuestion}>
                            Add Question
                        </button>
                    </div>
                    {!subject ? (
                        <div className="ac-empty">Select a subject.</div>
                    ) : questions.length === 0 ? (
                        <div className="ac-empty">No questions for this subject.</div>
                    ) : (
                        <div className="ac-stack">
                            {questions.map((q, i) => (
                                <div
                                    key={q.id}
                                    className={`ac-q ${focused?.id === q.id ? 'is-on' : ''} ${pending?.type === 'question' && pending.id === q.id ? 'is-warn' : ''}`}
                                >
                                    <button type="button" className="ac-q__hit" onClick={() => setFocusId(q.id)}>
                                        <span className="ac-chip">{String(i + 1).padStart(2, '0')} · {q.type}</span>
                                        <div className="ac-q__text">{q.text}</div>
                                    </button>
                                    {pending?.type === 'question' && pending.id === q.id ? (
                                        <div className="ac-warn">
                                            <button type="button" className="ac-btn ac-btn--ghost" onClick={() => setPending(null)}>Cancel</button>
                                            <button type="button" className="ac-btn ac-btn--danger" onClick={confirmRemoveQuestion}>Confirm remove</button>
                                        </div>
                                    ) : (
                                        <div className="ac-ops">
                                            <button type="button" className="ac-btn" onClick={() => openEditQuestion(q)}>Edit</button>
                                            <button
                                                type="button"
                                                className="ac-btn ac-btn--danger"
                                                onClick={() => setPending({ type: 'question', id: q.id })}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="ac-focus">
                    <div className="ac-focus__kicker"><FileText size={14} /> Focus</div>
                    {!focused ? (
                        <div className="ac-empty">Choose a question to inspect it.</div>
                    ) : (
                        <div className="ac-focus__body">
                            {focused.type === 'objective' ? (
                                <ol className="ac-focus__opts">
                                    {(focused.options || []).map((opt, i) => (
                                        <li key={i} className={i === focused.answer ? 'is-answer' : ''}>{opt || '—'}</li>
                                    ))}
                                </ol>
                            ) : (
                                <p className="ac-focus__marks">{focused.marks || 0} marks</p>
                            )}
                            <button type="button" className="ac-btn ac-btn--gold" onClick={() => openEditQuestion(focused)}>
                                Edit in workspace
                            </button>
                        </div>
                    )}
                </div>

                <aside className="ac-meta">
                    <div className="ac-meta__row"><span>Course</span><b>{course?.title || '—'}</b></div>
                    <div className="ac-meta__row"><span>Semester</span><b>{sem != null ? `Sem ${sem}` : '—'}</b></div>
                    <div className="ac-meta__row"><span>Subject</span><b>{subject?.title || '—'}</b></div>
                    <div className="ac-meta__row"><span>Type</span><b>{focused?.type || '—'}</b></div>
                    <div className="ac-meta__row"><span>Status</span><b>Preview</b></div>
                </aside>
            </section>

            <AnimatePresence>
                {toast && (
                    <motion.div
                        className="ac-toast"
                        role="status"
                        initial={{ opacity: 0, y: 16, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8 }}
                    >
                        {toast}
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {editing && (
                    <motion.aside
                        className="ac-drawer"
                        role="dialog"
                        aria-modal="true"
                        initial={{ x: 28, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 16, opacity: 0 }}
                    >
                        {(modal === 'course-add' || modal === 'course-edit') && (
                            <form onSubmit={saveCourse}>
                                <h3>{modal === 'course-add' ? 'Add Course' : 'Edit Course'}</h3>
                                {dirty && <span className="ac-unsaved">Unsaved</span>}
                                <div className="ac-field">
                                    <label htmlFor="c-title">Course name</label>
                                    <input id="c-title" value={form.title || ''} onChange={(e) => setField({ title: e.target.value })} />
                                </div>
                                <div className="ac-field">
                                    <label htmlFor="c-sems">Semesters (1–12, comma separated)</label>
                                    <input id="c-sems" value={form.semesters || ''} onChange={(e) => setField({ semesters: e.target.value })} />
                                </div>
                                {error && <p className="hint" style={{ color: '#fca5a5' }}>{error}</p>}
                                <div className="ac-modal__row">
                                    <button type="button" className="ac-btn" onClick={closeModal}>Cancel</button>
                                    <button type="submit" className="ac-btn ac-btn--gold">Update</button>
                                </div>
                            </form>
                        )}

                        {(modal === 'subject-add' || modal === 'subject-edit') && (
                            <form onSubmit={saveSubject}>
                                <h3>{modal === 'subject-add' ? 'Add Subject' : 'Edit Subject'}</h3>
                                {dirty && <span className="ac-unsaved">Unsaved</span>}
                                <div className="ac-field">
                                    <label htmlFor="s-course">Course</label>
                                    <select id="s-course" value={form.courseId || ''} onChange={(e) => setField({ courseId: e.target.value })}>
                                        {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                                    </select>
                                </div>
                                <div className="ac-field">
                                    <label htmlFor="s-sem">Semester</label>
                                    <select id="s-sem" value={form.sem || ''} onChange={(e) => setField({ sem: e.target.value })}>
                                        {(courses.find((c) => c.id === form.courseId)?.semesters || []).map((n) => (
                                            <option key={n} value={n}>Sem {n}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="ac-field">
                                    <label htmlFor="s-code">Subject id</label>
                                    <input id="s-code" value={form.code || ''} onChange={(e) => setField({ code: e.target.value })} />
                                </div>
                                <div className="ac-field">
                                    <label htmlFor="s-title">Subject name</label>
                                    <input id="s-title" value={form.title || ''} onChange={(e) => setField({ title: e.target.value })} />
                                </div>
                                {error && <p className="hint" style={{ color: '#fca5a5' }}>{error}</p>}
                                <div className="ac-modal__row">
                                    <button type="button" className="ac-btn" onClick={closeModal}>Cancel</button>
                                    <button type="submit" className="ac-btn ac-btn--gold">Update</button>
                                </div>
                            </form>
                        )}

                        {(modal === 'question-add' || modal === 'question-edit') && (
                            <form onSubmit={saveQuestion}>
                                <h3>{modal === 'question-add' ? 'Add Question' : 'Edit Question'}</h3>
                                {dirty && <span className="ac-unsaved">Unsaved</span>}
                                <div className="ac-field">
                                    <label htmlFor="q-course">Course</label>
                                    <select id="q-course" value={form.courseId || ''} onChange={(e) => setField({ courseId: e.target.value, subjectId: '' })}>
                                        {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                                    </select>
                                </div>
                                <div className="ac-field">
                                    <label htmlFor="q-subject">Subject</label>
                                    <select id="q-subject" value={form.subjectId || ''} onChange={(e) => setField({ subjectId: e.target.value })}>
                                        <option value="">Choose…</option>
                                        {subjectsForFormCourse.map((s) => (
                                            <option key={s.id} value={s.id}>{s.title} (Sem {s.sem})</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="ac-field">
                                    <label htmlFor="q-type">Type</label>
                                    <select id="q-type" value={form.type || 'objective'} onChange={(e) => setField({ type: e.target.value })}>
                                        <option value="objective">Objective</option>
                                        <option value="subjective">Subjective</option>
                                    </select>
                                </div>
                                <div className="ac-field">
                                    <label htmlFor="q-text">Question</label>
                                    <textarea id="q-text" value={form.text || ''} onChange={(e) => setField({ text: e.target.value })} />
                                </div>
                                {form.type === 'subjective' ? (
                                    <div className="ac-field">
                                        <label htmlFor="q-marks">Marks</label>
                                        <input id="q-marks" type="number" min="1" value={form.marks ?? 7} onChange={(e) => setField({ marks: e.target.value })} />
                                    </div>
                                ) : (
                                    <div className="ac-field">
                                        <label>Options (select the answer)</label>
                                        <div className="ac-options">
                                            {(form.options || ['', '', '', '']).map((opt, i) => (
                                                <div className="ac-option" key={i}>
                                                    <input
                                                        type="radio"
                                                        name="q-answer"
                                                        aria-label={`Answer ${i + 1}`}
                                                        checked={Number(form.answer) === i}
                                                        onChange={() => setField({ answer: i })}
                                                    />
                                                    <input
                                                        aria-label={`Option ${i + 1}`}
                                                        value={opt}
                                                        onChange={(e) => {
                                                            const options = [...(form.options || ['', '', '', ''])];
                                                            options[i] = e.target.value;
                                                            setField({ options });
                                                        }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {error && <p className="hint" style={{ color: '#fca5a5' }}>{error}</p>}
                                <div className="ac-modal__row">
                                    <button type="button" className="ac-btn" onClick={closeModal}>Cancel</button>
                                    <button type="submit" className="ac-btn ac-btn--gold">Update</button>
                                </div>
                            </form>
                        )}
                    </motion.aside>
                )}
            </AnimatePresence>
        </div>
    );
}
