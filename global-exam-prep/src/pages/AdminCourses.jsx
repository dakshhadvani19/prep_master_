import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    AlertCircle, ArrowLeft, BookOpen, Check, ChevronRight, Cpu, GraduationCap,
    Layers3, LayoutGrid, BriefcaseBusiness, FlaskConical, Scale, Search, RefreshCw, X,
} from 'lucide-react';
import { CATALOG_DOMAINS, fetchCourseAndSubjects, fetchCoursesForDomain } from '../utils/catalogApi';
import { getExamTypesForSubject, getSubjectExamInfo } from '../utils/subjectExamPolicy';
import './AdminCourses.css';

const DOMAIN_ICONS = {
    engineering: Cpu,
    'computer-apps': LayoutGrid,
    management: BriefcaseBusiness,
    'science-pharmacy': FlaskConical,
    'law-arts': Scale,
    diploma: GraduationCap,
};
const STEPS = [
    { id: 'department', label: 'Department' },
    { id: 'course', label: 'Course' },
    { id: 'semester', label: 'Semester' },
    { id: 'subject', label: 'Subject' },
];

function normalizeSemesterList(values) {
    if (!Array.isArray(values)) return [];
    return [...new Set(values.map(Number).filter(Number.isInteger).filter(value => value >= 0 && value <= 20))]
        .sort((a, b) => a - b);
}

function StageHeading({ eyebrow, title, description, count }) {
    return (
        <div className="ac-stage-heading">
            <div>
                <span className="ac-eyebrow">{eyebrow}</span>
                <h2>{title}</h2>
                <p>{description}</p>
            </div>
            {count !== undefined && <span className="ac-count">{count} {count === 1 ? 'result' : 'results'}</span>}
        </div>
    );
}

function ErrorState({ message, onRetry }) {
    return (
        <div className="ac-state ac-state--error" role="alert">
            <AlertCircle size={20} aria-hidden="true" />
            <div>
                <strong>Could not load catalog data</strong>
                <p>{message || 'Please check your connection and try again.'}</p>
            </div>
            <button type="button" className="ac-btn ac-btn--secondary" onClick={onRetry}>
                <RefreshCw size={15} /> Retry
            </button>
        </div>
    );
}

export default function AdminCourses() {
    const [step, setStep] = useState('department');
    const [domainId, setDomainId] = useState(null);
    const [courses, setCourses] = useState([]);
    const [courseId, setCourseId] = useState(null);
    const [course, setCourse] = useState(null);
    const [subjects, setSubjects] = useState([]);
    const [semester, setSemester] = useState(null);
    const [subjectId, setSubjectId] = useState(null);
    const [courseSearch, setCourseSearch] = useState('');
    const [subjectSearch, setSubjectSearch] = useState('');
    const [coursesLoading, setCoursesLoading] = useState(false);
    const [subjectsLoading, setSubjectsLoading] = useState(false);
    const [coursesError, setCoursesError] = useState('');
    const [subjectsError, setSubjectsError] = useState('');
    const [retryKey, setRetryKey] = useState(0);

    const domain = CATALOG_DOMAINS.find(item => item.id === domainId) || null;
    const selectedSubject = subjects.find(item => String(item.subjectId) === String(subjectId)) || null;
    const semesters = useMemo(() => normalizeSemesterList(course?.sems), [course?.sems]);

    const filteredCourses = useMemo(() => {
        const query = courseSearch.trim().toLowerCase();
        return courses.filter(item => !query || item.courseName.toLowerCase().includes(query));
    }, [courses, courseSearch]);

    const semesterSubjects = useMemo(() => (
        semester === null ? [] : subjects.filter(item => Number(item.sem) === Number(semester))
    ), [subjects, semester]);

    const filteredSubjects = useMemo(() => {
        const query = subjectSearch.trim().toLowerCase();
        return semesterSubjects
            .filter(item => !query
                || item.subjectName.toLowerCase().includes(query)
                || String(item.subjectId).includes(query))
            .sort((a, b) => a.subjectName.localeCompare(b.subjectName));
    }, [semesterSubjects, subjectSearch]);

    useEffect(() => {
        if (!domainId) return undefined;
        let cancelled = false;
        fetchCoursesForDomain(domainId)
            .then(result => {
                if (cancelled) return;
                if (result.error) throw result.error;
                setCourses(result.courses || []);
            })
            .catch(error => {
                if (!cancelled) setCoursesError(error?.message || 'The department courses could not be loaded.');
            })
            .finally(() => { if (!cancelled) setCoursesLoading(false); });
        return () => { cancelled = true; };
    }, [domainId, retryKey]);

    useEffect(() => {
        if (courseId === null) return undefined;
        let cancelled = false;
        fetchCourseAndSubjects(courseId)
            .then(result => {
                if (cancelled) return;
                if (result.error) throw result.error;
                if (!result.course) throw new Error('The selected course is no longer available in the catalog.');
                setCourse(result.course);
                setSubjects(result.subjects || []);
            })
            .catch(error => {
                if (!cancelled) setSubjectsError(error?.message || 'The selected course subjects could not be loaded.');
            })
            .finally(() => { if (!cancelled) setSubjectsLoading(false); });
        return () => { cancelled = true; };
    }, [courseId, retryKey]);

    function chooseDepartment(nextDomain) {
        setDomainId(nextDomain.id);
        setCourseId(null);
        setCourse(null);
        setCourses([]);
        setSemester(null);
        setSubjects([]);
        setSubjectId(null);
        setCourseSearch('');
        setSubjectSearch('');
        setCoursesError('');
        setCoursesLoading(true);
        setStep('course');
    }

    function chooseCourse(nextCourse) {
        setCourseId(nextCourse.courseId);
        setCourse(nextCourse);
        setSemester(null);
        setSubjects([]);
        setSubjectsError('');
        setSubjectsLoading(true);
        setSubjectId(null);
        setSubjectSearch('');
        setStep('semester');
    }

    function chooseSemester(value) {
        setSemester(Number(value));
        setSubjectId(null);
        setSubjectSearch('');
        setStep('subject');
    }

    function retryCurrentStage() {
        if (step === 'course') {
            setCoursesError('');
            setCoursesLoading(true);
        } else {
            setSubjectsError('');
            setSubjectsLoading(true);
        }
        setRetryKey(value => value + 1);
    }

    function resetLocator() {
        setStep('department');
        setDomainId(null);
        setCourses([]);
        setCourseId(null);
        setCourse(null);
        setSubjects([]);
        setSemester(null);
        setSubjectId(null);
        setCourseSearch('');
        setSubjectSearch('');
        setCoursesError('');
        setSubjectsError('');
    }

    const stepIndex = Math.max(0, STEPS.findIndex(item => item.id === step));
    const stepValues = [
        domain?.title,
        course?.courseName,
        semester === null ? null : (semester === 0 ? 'Semester 0' : 'Semester ' + semester),
        selectedSubject?.subjectName,
    ];

    return (
        <main className="ac">
            <header className="ac-hero">
                <div className="ac-hero__copy">
                    <div className="ac-kicker">ADMIN · COURSE CATALOG</div>
                    <h1>Subject &amp; Question Locator</h1>
                    <p>Browse the full academic catalog by department, course, semester and subject.</p>
                </div>
                <div className="ac-hero__actions">
                    <Link to="/dashboard" className="ac-btn ac-btn--secondary"><ArrowLeft size={16} /> Dashboard</Link>
                    <button type="button" className="ac-btn ac-btn--secondary" onClick={resetLocator}><RefreshCw size={15} /> Start over</button>
                </div>
            </header>

            <nav className="ac-stepper" aria-label="Catalog location">
                {STEPS.map((item, index) => {
                    const complete = index < stepIndex || (index === stepIndex && Boolean(stepValues[index]));
                    return (
                        <div className="ac-stepper__item" key={item.id}>
                            <button
                                type="button"
                                className={'ac-step' + (step === item.id ? ' is-active' : '') + (complete ? ' is-complete' : '')}
                                onClick={() => setStep(item.id)}
                                disabled={index > stepIndex}
                                aria-current={step === item.id ? 'step' : undefined}
                            >
                                <span className="ac-step__number">{complete ? <Check size={16} /> : index + 1}</span>
                                <span className="ac-step__copy">
                                    <span className="ac-step__label">{item.label}</span>
                                    {stepValues[index] && <span className="ac-step__value">{stepValues[index]}</span>}
                                </span>
                            </button>
                            {index < STEPS.length - 1 && <ChevronRight className="ac-stepper__arrow" size={16} />}
                        </div>
                    );
                })}
            </nav>

            <section className="ac-workspace" aria-live="polite">
                        {step === 'department' && (
                        <div className="ac-stage animate-fade-in">
                            <StageHeading eyebrow="STEP 1 · ACADEMIC AREA" title="Choose a department" description="All six catalog departments are available to administrators." />
                            <div className="ac-department-grid">
                                {CATALOG_DOMAINS.map(item => {
                                    const Icon = DOMAIN_ICONS[item.id] || GraduationCap;
                                    return (
                                        <button type="button" key={item.id} className="ac-department-card" onClick={() => chooseDepartment(item)}>
                                            <span className="ac-department-card__icon"><Icon size={21} /></span>
                                            <span className="ac-department-card__title">{item.title}</span>
                                            <span className="ac-department-card__description">{item.description}</span>
                                            <span className="ac-department-card__action">Browse courses <ChevronRight size={15} /></span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {step === 'course' && (
                        <div className="ac-stage animate-fade-in">
                            <StageHeading eyebrow="STEP 2 · COURSE" title={domain?.title || 'Select a course'} description="Courses are loaded from the live catalog. Select a course to see its semesters." count={filteredCourses.length} />
                            <div className="ac-toolbar">
                                <label className="ac-search"><Search size={17} /><input value={courseSearch} onChange={event => setCourseSearch(event.target.value)} placeholder="Search courses…" aria-label="Search courses" />
                                    {courseSearch && <button type="button" aria-label="Clear course search" onClick={() => setCourseSearch('')}><X size={15} /></button>}
                                </label>
                                <button type="button" className="ac-btn ac-btn--secondary" onClick={() => setStep('department')}>Change department</button>
                            </div>
                            {coursesLoading ? <div className="ac-loading" role="status"><span className="ac-spinner" /> Loading courses from the catalog…</div>
                                : coursesError ? <ErrorState message={coursesError} onRetry={retryCurrentStage} />
                                    : filteredCourses.length === 0 ? <div className="ac-empty-state"><BookOpen size={26} /><strong>No courses found</strong><span>{courses.length ? 'Try another search term.' : 'No live courses are linked to this department.'}</span></div>
                                        : <div className="ac-course-grid">
                                            {filteredCourses.map(item => (
                                                <button type="button" key={item.courseId} className="ac-course-card" onClick={() => chooseCourse(item)}>
                                                    <span className="ac-course-card__top"><GraduationCap size={20} /><span>{item.sems?.length || 0} semesters</span></span>
                                                    <strong>{item.courseName}</strong>
                                                    <span className="ac-course-card__action">Select course <ChevronRight size={15} /></span>
                                                </button>
                                            ))}
                                        </div>}
                        </div>
                    )}

                    {step === 'semester' && (
                        <div className="ac-stage animate-fade-in">
                            <StageHeading eyebrow="STEP 3 · SEMESTER" title={course?.courseName || 'Select a semester'} description="Semester options come directly from the selected course record." />
                            <div className="ac-toolbar"><button type="button" className="ac-btn ac-btn--secondary" onClick={() => setStep('course')}><ArrowLeft size={15} /> Courses</button></div>
                            {subjectsLoading ? <div className="ac-loading" role="status"><span className="ac-spinner" /> Loading course and semester data…</div>
                                : subjectsError ? <ErrorState message={subjectsError} onRetry={retryCurrentStage} />
                                    : semesters.length === 0 ? <div className="ac-empty-state"><Layers3 size={26} /><strong>No semesters listed</strong><span>This course has no semester values in the live catalog.</span></div>
                                        : <div className="ac-semester-grid">
                                            {semesters.map(value => (
                                                <button type="button" key={value} data-testid={"semester-option-" + value} className="ac-semester-card" onClick={() => chooseSemester(value)}>
                                                    <span className="ac-semester-card__number">{String(value).padStart(2, '0')}</span>
                                                    <strong>{value === 0 ? 'Semester 0' : 'Semester ' + value}</strong>
                                                    <span>Browse subjects <ChevronRight size={15} /></span>
                                                </button>
                                            ))}
                                        </div>}
                        </div>
                    )}

                    {step === 'subject' && (
                        <div className="ac-stage animate-fade-in">
                            <StageHeading eyebrow="STEP 4 · SUBJECT" title={semester === 0 ? 'Semester 0 subjects' : 'Semester ' + semester + ' subjects'} description={(course?.courseName || 'Selected course') + ' · Search by subject name or numeric Subject ID.'} count={filteredSubjects.length} />
                            <div className="ac-toolbar">
                                <label className="ac-search"><Search size={17} /><input value={subjectSearch} onChange={event => setSubjectSearch(event.target.value)} placeholder="Search subjects or Subject ID…" aria-label="Search subjects" />
                                    {subjectSearch && <button type="button" aria-label="Clear subject search" onClick={() => setSubjectSearch('')}><X size={15} /></button>}
                                </label>
                                <button type="button" className="ac-btn ac-btn--secondary" onClick={() => setStep('semester')}><ArrowLeft size={15} /> Semesters</button>
                            </div>
                            {subjectsLoading ? <div className="ac-loading" role="status"><span className="ac-spinner" /> Loading subjects…</div>
                                : subjectsError ? <ErrorState message={subjectsError} onRetry={retryCurrentStage} />
                                    : <div className={'ac-subject-layout' + (selectedSubject ? ' has-selection' : '')}>
                                        <div className="ac-subject-list">
                                            {filteredSubjects.length === 0
                                                ? <div className="ac-empty-state"><BookOpen size={26} /><strong>No subjects found</strong><span>{semesterSubjects.length ? 'Try a different search.' : 'No subjects are linked to this semester in the live catalog.'}</span></div>
                                                : filteredSubjects.map(item => (
                                                    <button type="button" key={item.subjectId} className={'ac-subject-row' + (String(subjectId) === String(item.subjectId) ? ' is-selected' : '')} onClick={() => setSubjectId(item.subjectId)} aria-pressed={String(subjectId) === String(item.subjectId)}>
                                                        <span className="ac-subject-row__mark"><BookOpen size={17} /></span>
                                                        <span className="ac-subject-row__copy"><strong>{item.subjectName}</strong><small>Subject ID · {item.subjectId}</small></span>
                                                        <span className={'ac-subject-row__type' + (item.isDepartmentalSubject ? ' is-departmental' : '')}>{item.isDepartmentalSubject ? 'Departmental' : 'Non-departmental'}</span>
                                                        <ChevronRight size={17} className="ac-subject-row__arrow" />
                                                    </button>
                                                ))}
                                        </div>
                                        <aside className="ac-subject-detail" aria-label="Selected subject details">
                                            {selectedSubject ? (
                                                <>
                                                    <div className="ac-detail-heading"><span className="ac-detail-icon"><BookOpen size={21} /></span><div><span className="ac-eyebrow">SELECTED SUBJECT</span><h3>{selectedSubject.subjectName}</h3></div></div>
                                                    <dl className="ac-detail-meta">
                                                        <div><dt>Subject ID</dt><dd>{selectedSubject.subjectId}</dd></div>
                                                        <div><dt>Course ID</dt><dd>{selectedSubject.courseId}</dd></div>
                                                        <div><dt>Semester</dt><dd>{selectedSubject.sem}</dd></div>
                                                        <div><dt>Subject type</dt><dd>{selectedSubject.isDepartmentalSubject ? 'Departmental' : 'Non-departmental'}</dd></div>
                                                    </dl>
                                                    <section className="ac-exam-types">
                                                        <h4>Applicable exam types</h4>
                                                        <div className="ac-exam-type-list">
                                                            {getExamTypesForSubject(selectedSubject.isDepartmentalSubject).map(type => {
                                                                const info = getSubjectExamInfo(type, selectedSubject.isDepartmentalSubject);
                                                                if (!info) return null;
                                                                return (
                                                                    <div className="ac-exam-type" key={type}>
                                                                        <span><strong>{info.title}</strong><small>{info.type === 'objective' ? 'MCQ' : 'Theory'} · {info.totalMarks}M · {info.timeMinutes} min</small></span>
                                                                        <Check size={16} />
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </section>
                                                    <section className="ac-question-locator">
                                                        <div className="ac-question-locator__heading"><Layers3 size={18} /><h4>Question locator</h4><span>Phase 3</span></div>
                                                        <p>The subject is identified. Current TestsData rows do not carry Course ID, Subject ID or Semester, so this screen will not attach unrelated question papers to this subject.</p>
                                                        <div className="ac-question-locator__target"><span>INGESTION TARGET</span><strong>{selectedSubject.subjectId} · Sem {selectedSubject.sem}</strong><small>{selectedSubject.subjectName}</small></div>
                                                        <p className="ac-question-locator__next">Phase 3 will create the canonical question-bank index during validated file ingestion.</p>
                                                    </section>
                                                </>
                                            ) : (
                                                <div className="ac-detail-empty"><BookOpen size={28} /><strong>Select a subject</strong><span>Its catalog identity, exam eligibility and question-bank target will appear here.</span></div>
                                            )}
                                        </aside>
                                    </div>}
                        </div>
                    )}
                </section>

            <footer className="ac-footer">
                <span><span className="ac-footer__dot" /> Live catalog · Read-only Phase 1 locator</span>
                <span>Departments → Courses → Semesters → Subjects</span>
            </footer>
        </main>
    );
}
