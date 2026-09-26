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
import { ArrowLeft, BookOpen, Plus } from 'lucide-react';
import './AdminDashboard.css';
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

export default function AdminCourses() {
    const [courses, setCourses] = useState(SEED);
    const [courseId, setCourseId] = useState(SEED[0].id);
    const [sem, setSem] = useState(1);
    const [subjectId, setSubjectId] = useState(SEED[0].subjects[0].id);
    const [modal, setModal] = useState(null);
    const [form, setForm] = useState({});
    const [toast, setToast] = useState('');
    const [error, setError] = useState('');

    const course = courses.find((c) => c.id === courseId) || null;
    const subjects = useMemo(
        () => (course && sem != null ? course.subjects.filter((s) => s.sem === sem) : []),
        [course, sem],
    );
    const subject = subjects.find((s) => s.id === subjectId) || null;
    const questions = subject?.questions ?? [];

    function flash(msg) {
        setToast(msg);
        window.setTimeout(() => setToast(''), 2800);
    }

    function closeModal() {
        setModal(null);
        setForm({});
        setError('');
    }

    function pickCourse(id) {
        const next = courses.find((c) => c.id === id);
        setCourseId(id);
        const firstSem = next?.semesters[0] ?? null;
        setSem(firstSem);
        const firstSub = next?.subjects.find((s) => s.sem === firstSem) ?? null;
        setSubjectId(firstSub?.id ?? null);
    }

    function pickSem(n) {
        setSem(n);
        const firstSub = course?.subjects.find((s) => s.sem === n) ?? null;
        setSubjectId(firstSub?.id ?? null);
    }

    function patchCourse(id, updater) {
        setCourses((list) => list.map((c) => (c.id === id ? updater(c) : c)));
    }

    /* ——— Course CRUD ——— */
    function openAddCourse() {
        setForm({ title: '', semesters: '1, 2' });
        setModal('course-add');
    }
    function openEditCourse(c) {
        if (!c) return;
        setForm({ id: c.id, title: c.title, semesters: c.semesters.join(', ') });
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
        } else if (form.id) {
            patchCourse(form.id, (c) => ({ ...c, title, semesters }));
            setCourseId(form.id);
            if (!semesters.includes(sem)) {
                setSem(semesters[0]);
                setSubjectId(null);
            }
        }
        closeModal();
        flash(PREVIEW);
    }
    function confirmRemoveCourse() {
        if (!course) return;
        setCourses((list) => list.filter((c) => c.id !== course.id));
        const rest = courses.filter((c) => c.id !== course.id);
        if (rest[0]) pickCourse(rest[0].id);
        else {
            setCourseId(null);
            setSem(null);
            setSubjectId(null);
        }
        closeModal();
        flash(PREVIEW);
    }

    /* ——— Subject CRUD ——— */
    function openAddSubject() {
        setForm({ title: '', code: '', courseId, sem: sem ?? course?.semesters[0] ?? 1 });
        setModal('subject-add');
    }
    function openEditSubject(sub) {
        setForm({
            id: sub.id,
            title: sub.title,
            code: sub.id,
            courseId,
            sem: sub.sem,
        });
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
            let subjects = c.subjects;
            if (modal === 'subject-edit') {
                subjects = subjects.filter((s) => s.id !== form.id);
            }
            if (c.id !== destCourse) return { ...c, subjects };
            const existing = modal === 'subject-edit'
                ? (course?.subjects.find((s) => s.id === form.id) || { questions: [] })
                : { questions: [] };
            const next = { id: code, title, sem: destSem, questions: existing.questions || [] };
            return { ...c, subjects: [...subjects.filter((s) => s.id !== code), next] };
        }));
        setCourseId(destCourse);
        setSem(destSem);
        setSubjectId(code);
        closeModal();
        flash(PREVIEW);
    }
    function confirmRemoveSubject() {
        if (!course || !form.id) return;
        patchCourse(course.id, (c) => ({ ...c, subjects: c.subjects.filter((s) => s.id !== form.id) }));
        if (subjectId === form.id) setSubjectId(null);
        closeModal();
        flash(PREVIEW);
    }

    /* ——— Question CRUD ——— */
    function openAddQuestion() {
        setForm({ ...blankObjective(), courseId, subjectId });
        setModal('question-add');
    }
    function openEditQuestion(q) {
        setForm({
            ...blankObjective(),
            ...q,
            options: q.options ? [...q.options] : ['', '', '', ''],
            courseId,
            subjectId,
        });
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
            const subjects = c.subjects.map((s) => {
                let qs = s.questions;
                if (modal === 'question-edit' && form.id) qs = qs.filter((q) => q.id !== form.id);
                if (c.id === destCourse && s.id === destSubject) {
                    return { ...s, questions: [...qs.filter((q) => q.id !== payload.id), payload] };
                }
                return { ...s, questions: qs };
            });
            return { ...c, subjects };
        }));
        setCourseId(destCourse);
        const dest = courses.flatMap((c) => c.subjects).find((s) => s.id === destSubject);
        if (dest) setSem(dest.sem);
        setSubjectId(destSubject);
        closeModal();
        flash(PREVIEW);
    }
    function confirmRemoveQuestion() {
        if (!course || !subject || !form.id) return;
        patchCourse(course.id, (c) => ({
            ...c,
            subjects: c.subjects.map((s) =>
                s.id === subject.id ? { ...s, questions: s.questions.filter((q) => q.id !== form.id) } : s),
        }));
        closeModal();
        flash(PREVIEW);
    }

    const subjectsForFormCourse = courses.find((c) => c.id === form.courseId)?.subjects || [];

    return (
        <div className="ac">
            <header className="ac__hero">
                <div>
                    <div className="ac__kicker">Admin · Courses</div>
                    <h1 className="ac__title">Catalog</h1>
                    <p className="ac__sub">Course → Semester → Subjects → Questions. In-memory preview only.</p>
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
                <Link to="/dashboard" className="ac-btn ac-btn--ghost" style={{ textDecoration: 'none' }}>
                    <ArrowLeft size={12} style={{ marginRight: 4 }} /> Dashboard
                </Link>
            </header>

            <div className="ac-layout">
                <aside className="ac-panel">
                    <div className="ac-panel__head">
                        <h2><BookOpen size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> Courses</h2>
                        <button type="button" className="ac-btn ac-btn--gold" onClick={openAddCourse}>
                            <Plus size={12} style={{ marginRight: 4 }} /> Add Course
                        </button>
                    </div>
                    {courses.length === 0 ? (
                        <div className="ac-empty">No courses yet.</div>
                    ) : (
                        <div className="ac-stack">
                            {courses.map((c) => (
                                <div key={c.id} className={`ac-course ${c.id === courseId ? 'is-on' : ''}`}>
                                    <button type="button" onClick={() => pickCourse(c.id)} style={{ all: 'unset', display: 'block', cursor: 'pointer', width: '100%' }}>
                                        <div className="ac-course__name">{c.title}</div>
                                        <div className="ac-course__meta">{c.semesters.length} sem · {c.subjects.length} subjects</div>
                                    </button>
                                    <div className="ac-course__ops">
                                        <button type="button" className="ac-btn ac-btn--ghost" onClick={() => { pickCourse(c.id); openEditCourse(c); }}>Edit</button>
                                        <button type="button" className="ac-btn ac-btn--danger" onClick={() => { pickCourse(c.id); setForm({ title: c.title }); setModal('course-remove'); }}>Remove</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </aside>

                <div className="ac-stack">
                    <section className="ac-panel">
                        <div className="ac-panel__head">
                            <h2>Semesters</h2>
                        </div>
                        {!course ? (
                            <div className="ac-empty">Select a course to see its semesters.</div>
                        ) : (
                            <div className="ac-sems">
                                {course.semesters.map((n) => (
                                    <button
                                        type="button"
                                        key={n}
                                        className={`ac-sem ${sem === n ? 'is-on' : ''}`}
                                        onClick={() => pickSem(n)}
                                    >
                                        Sem {n}
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="ac-panel">
                        <div className="ac-panel__head">
                            <h2>Subjects {sem != null ? `· Sem ${sem}` : ''}</h2>
                            <button type="button" className="ac-btn ac-btn--gold" disabled={!course} onClick={openAddSubject}>
                                Add Subject
                            </button>
                        </div>
                        {!course || sem == null ? (
                            <div className="ac-empty">Select a course and semester.</div>
                        ) : subjects.length === 0 ? (
                            <div className="ac-empty">No subjects in this semester.</div>
                        ) : (
                            <div className="ac-stack">
                                {subjects.map((s) => (
                                    <div
                                        key={s.id}
                                        className={`ac-row ${s.id === subjectId ? 'is-on' : ''}`}
                                        onClick={() => setSubjectId(s.id)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') setSubjectId(s.id); }}
                                        role="button"
                                        tabIndex={0}
                                    >
                                        <div>
                                            <div className="ac-row__title">{s.title}</div>
                                            <div className="ac-row__sub">{s.id} · {s.questions.length} questions</div>
                                        </div>
                                        <div className="ac-ops" onClick={(e) => e.stopPropagation()}>
                                            <button type="button" className="ac-btn" onClick={() => openEditSubject(s)}>Edit</button>
                                            <button type="button" className="ac-btn ac-btn--danger" onClick={() => { setForm({ id: s.id, title: s.title }); setModal('subject-remove'); }}>Remove</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="ac-panel">
                        <div className="ac-panel__head">
                            <h2>Questions {subject ? `· ${subject.title}` : ''}</h2>
                            <button type="button" className="ac-btn ac-btn--gold" disabled={!subject} onClick={openAddQuestion}>
                                Add Question
                            </button>
                        </div>
                        {!subject ? (
                            <div className="ac-empty">Select a subject to manage its question bank.</div>
                        ) : questions.length === 0 ? (
                            <div className="ac-empty">No questions for this subject.</div>
                        ) : (
                            <div className="ac-stack">
                                {questions.map((q) => (
                                    <div key={q.id} className="ac-q">
                                        <div>
                                            <span className="ac-chip">{q.type}</span>
                                            <div className="ac-q__text">{q.text}</div>
                                            <div className="ac-q__meta">
                                                {q.type === 'objective'
                                                    ? `${(q.options || []).length} options · answer ${(q.answer ?? 0) + 1}`
                                                    : `${q.marks || 0} marks`}
                                            </div>
                                        </div>
                                        <div className="ac-ops">
                                            <button type="button" className="ac-btn" onClick={() => openEditQuestion(q)}>Edit</button>
                                            <button type="button" className="ac-btn ac-btn--danger" onClick={() => { setForm({ id: q.id, text: q.text }); setModal('question-remove'); }}>Remove</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </div>

            <AnimatePresence>
                {toast && (
                    <motion.div
                        className="ac-toast"
                        role="status"
                        initial={{ opacity: 0, y: 16, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                    >
                        {toast}
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {modal && (
                    <motion.div
                        className="ac-backdrop"
                        onClick={closeModal}
                        role="presentation"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            className="ac-modal"
                            onClick={(e) => e.stopPropagation()}
                            initial={{ opacity: 0, y: 18, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10 }}
                        >
                            {modal === 'course-add' || modal === 'course-edit' ? (
                                <form onSubmit={saveCourse}>
                                    <h3>{modal === 'course-add' ? 'Add Course' : 'Edit Course'}</h3>
                                    <p className="hint">Preview workflow. Update does not persist.</p>
                                    <div className="ac-field">
                                        <label htmlFor="c-title">Course name</label>
                                        <input id="c-title" value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                                    </div>
                                    <div className="ac-field">
                                        <label htmlFor="c-sems">Semesters (1–12, comma separated)</label>
                                        <input id="c-sems" value={form.semesters || ''} onChange={(e) => setForm({ ...form, semesters: e.target.value })} />
                                    </div>
                                    {error && <p className="hint" style={{ color: '#fca5a5' }}>{error}</p>}
                                    <div className="ac-modal__row">
                                        <button type="button" className="ac-btn" onClick={closeModal}>Cancel</button>
                                        <button type="submit" className="ac-btn ac-btn--gold">Update</button>
                                    </div>
                                </form>
                            ) : null}

                            {modal === 'course-remove' ? (
                                <div>
                                    <h3>Remove Course</h3>
                                    <p className="hint">Remove “{form.title}”? This is a preview — nothing is stored.</p>
                                    <div className="ac-modal__row">
                                        <button type="button" className="ac-btn" onClick={closeModal}>Cancel</button>
                                        <button type="button" className="ac-btn ac-btn--danger" onClick={confirmRemoveCourse}>Confirm remove</button>
                                    </div>
                                </div>
                            ) : null}

                            {modal === 'subject-add' || modal === 'subject-edit' ? (
                                <form onSubmit={saveSubject}>
                                    <h3>{modal === 'subject-add' ? 'Add Subject' : 'Edit Subject'}</h3>
                                    <p className="hint">Choose course and subject. Preview only.</p>
                                    <div className="ac-field">
                                        <label htmlFor="s-course">Course</label>
                                        <select id="s-course" value={form.courseId || ''} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>
                                            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                                        </select>
                                    </div>
                                    <div className="ac-field">
                                        <label htmlFor="s-sem">Semester</label>
                                        <select id="s-sem" value={form.sem || ''} onChange={(e) => setForm({ ...form, sem: e.target.value })}>
                                            {(courses.find((c) => c.id === form.courseId)?.semesters || []).map((n) => (
                                                <option key={n} value={n}>Sem {n}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="ac-field">
                                        <label htmlFor="s-code">Subject id</label>
                                        <input id="s-code" value={form.code || ''} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                                    </div>
                                    <div className="ac-field">
                                        <label htmlFor="s-title">Subject name</label>
                                        <input id="s-title" value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                                    </div>
                                    {error && <p className="hint" style={{ color: '#fca5a5' }}>{error}</p>}
                                    <div className="ac-modal__row">
                                        <button type="button" className="ac-btn" onClick={closeModal}>Cancel</button>
                                        <button type="submit" className="ac-btn ac-btn--gold">Update</button>
                                    </div>
                                </form>
                            ) : null}

                            {modal === 'subject-remove' ? (
                                <div>
                                    <h3>Remove Subject</h3>
                                    <p className="hint">Remove “{form.title}”? Preview only.</p>
                                    <div className="ac-modal__row">
                                        <button type="button" className="ac-btn" onClick={closeModal}>Cancel</button>
                                        <button type="button" className="ac-btn ac-btn--danger" onClick={confirmRemoveSubject}>Confirm remove</button>
                                    </div>
                                </div>
                            ) : null}

                            {modal === 'question-add' || modal === 'question-edit' ? (
                                <form onSubmit={saveQuestion}>
                                    <h3>{modal === 'question-add' ? 'Add Question' : 'Edit Question'}</h3>
                                    <p className="hint">Choose course and subject. Fields match TestsData (text / options / answers).</p>
                                    <div className="ac-field">
                                        <label htmlFor="q-course">Course</label>
                                        <select id="q-course" value={form.courseId || ''} onChange={(e) => setForm({ ...form, courseId: e.target.value, subjectId: '' })}>
                                            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                                        </select>
                                    </div>
                                    <div className="ac-field">
                                        <label htmlFor="q-subject">Subject</label>
                                        <select id="q-subject" value={form.subjectId || ''} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
                                            <option value="">Choose…</option>
                                            {subjectsForFormCourse.map((s) => (
                                                <option key={s.id} value={s.id}>{s.title} (Sem {s.sem})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="ac-field">
                                        <label htmlFor="q-type">Type</label>
                                        <select id="q-type" value={form.type || 'objective'} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                                            <option value="objective">Objective</option>
                                            <option value="subjective">Subjective</option>
                                        </select>
                                    </div>
                                    <div className="ac-field">
                                        <label htmlFor="q-text">Question</label>
                                        <textarea id="q-text" value={form.text || ''} onChange={(e) => setForm({ ...form, text: e.target.value })} />
                                    </div>
                                    {form.type === 'subjective' ? (
                                        <div className="ac-field">
                                            <label htmlFor="q-marks">Marks</label>
                                            <input id="q-marks" type="number" min="1" value={form.marks ?? 7} onChange={(e) => setForm({ ...form, marks: e.target.value })} />
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
                                                            onChange={() => setForm({ ...form, answer: i })}
                                                        />
                                                        <input
                                                            aria-label={`Option ${i + 1}`}
                                                            value={opt}
                                                            onChange={(e) => {
                                                                const options = [...(form.options || ['', '', '', ''])];
                                                                options[i] = e.target.value;
                                                                setForm({ ...form, options });
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
                            ) : null}

                            {modal === 'question-remove' ? (
                                <div>
                                    <h3>Remove Question</h3>
                                    <p className="hint">Remove this question? Preview only.</p>
                                    <div className="ac-modal__row">
                                        <button type="button" className="ac-btn" onClick={closeModal}>Cancel</button>
                                        <button type="button" className="ac-btn ac-btn--danger" onClick={confirmRemoveQuestion}>Confirm remove</button>
                                    </div>
                                </div>
                            ) : null}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
