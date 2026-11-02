import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    AlertCircle, ArrowLeft, BookOpen, Check, ChevronRight, Cpu, GraduationCap,
    Layers3, LayoutGrid, BriefcaseBusiness, FlaskConical, Scale, Search, RefreshCw, X,
} from 'lucide-react';
import { CATALOG_DOMAINS, fetchCourseAndSubjects, fetchCoursesForDomain, resetCatalogCache } from '../utils/catalogApi';
import AdminSubjectEditor from '../components/AdminSubjectEditor.jsx';
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
    { id: 'subject', label: 'Edit subjects' },
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
    const [courseSearch, setCourseSearch] = useState('');
    const [coursesLoading, setCoursesLoading] = useState(false);
    const [subjectsLoading, setSubjectsLoading] = useState(false);
    const [coursesError, setCoursesError] = useState('');
    const [subjectsError, setSubjectsError] = useState('');
    const [retryKey, setRetryKey] = useState(0);

    const domain = CATALOG_DOMAINS.find(item => item.id === domainId) || null;
    const semesters = useMemo(() => normalizeSemesterList(course?.sems), [course?.sems]);

    const filteredCourses = useMemo(() => {
        const query = courseSearch.trim().toLowerCase();
        return courses.filter(item => !query || item.courseName.toLowerCase().includes(query));
    }, [courses, courseSearch]);

    const semesterSubjects = useMemo(() => (
        semester === null ? [] : subjects.filter(item => Number(item.sem) === Number(semester))
    ), [subjects, semester]);

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
        setCourseSearch('');
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
        setStep('semester');
    }

    function chooseSemester(value) {
        setSemester(Number(value));
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

    async function refreshSubjectData() {
        resetCatalogCache();
        setSubjectsError('');
        try {
            const result = await fetchCourseAndSubjects(courseId);
            if (result.error) throw result.error;
            setCourse(result.course);
            setSubjects(result.subjects || []);
        } catch (error) {
            setSubjectsError(error?.message || 'The updated subject catalog could not be loaded.');
        } finally {
            setSubjectsLoading(false);
        }
    }

    function resetLocator() {
        setStep('department');
        setDomainId(null);
        setCourses([]);
        setCourseId(null);
        setCourse(null);
        setSubjects([]);
        setSemester(null);
        setCourseSearch('');
        setCoursesError('');
        setSubjectsError('');
    }

    const stepIndex = Math.max(0, STEPS.findIndex(item => item.id === step));
    const stepValues = [
        domain?.title,
        course?.courseName,
        semester === null ? null : (semester === 0 ? 'Semester 0' : 'Semester ' + semester),
        step === 'subject' ? 'Edit subjects' : null,
    ];

    return (
        <main className="ac">
            <header className="ac-hero">
                <div className="ac-hero__copy">
                    <div className="ac-kicker">ADMIN · COURSE CATALOG</div>
                    <h1>Edit subjects</h1>
                    <p>Add a subject with its syllabus or remove a subject from the selected semester.</p>
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
                            <StageHeading
                                eyebrow="STEP 4 · SUBJECT MANAGEMENT"
                                title={semester === 0 ? 'Edit semester 0 subjects' : 'Edit semester ' + semester + ' subjects'}
                                description={(course?.courseName || 'Selected course') + ' · Add a new subject with its syllabus or remove an eligible subject.'}
                                count={semesterSubjects.length}
                            />
                            <div className="ac-toolbar">
                                <span className="ac-context-label">{domain?.title} · {course?.courseName} · Semester {semester}</span>
                                <button type="button" className="ac-btn ac-btn--secondary" onClick={() => setStep('semester')}><ArrowLeft size={15} /> Change semester</button>
                            </div>
                            {subjectsLoading ? <div className="ac-loading" role="status"><span className="ac-spinner" /> Loading subjects…</div>
                                : subjectsError ? <ErrorState message={subjectsError} onRetry={retryCurrentStage} />
                                    : course && <AdminSubjectEditor
                                        course={course}
                                        semester={semester}
                                        subjects={semesterSubjects}
                                        onChanged={refreshSubjectData}
                                    />}
                        </div>
                    )}
                </section>

            <footer className="ac-footer">
                <span><span className="ac-footer__dot" /> Live catalog · Subject management</span>
                <span>Department → Course → Semester → Add / Remove Subject</span>
            </footer>
        </main>
    );
}
