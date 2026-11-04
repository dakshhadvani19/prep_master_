import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
    AlertCircle, ArrowLeft, BookOpen, Check, ChevronRight, Cpu, GraduationCap,
    Layers3, LayoutGrid, BriefcaseBusiness, FlaskConical, Scale, Search, RefreshCw, X,
} from 'lucide-react';
import { CATALOG_DOMAINS, fetchCourseAndSubjects, fetchCoursesForDomain, getCatalogDomain, resetCatalogCache } from '../utils/catalogApi';
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

function adminCoursesSearch({ department, courseId, semester, step, mode, subjectId } = {}) {
    const params = new URLSearchParams();
    if (department) params.set('department', String(department));
    if (courseId != null) params.set('courseId', String(courseId));
    if (semester != null) params.set('semester', String(semester));
    if (step) params.set('step', String(step));
    if (mode === 'remove') params.set('mode', 'remove');
    if (subjectId != null && subjectId !== '') params.set('subjectId', String(subjectId));
    const query = params.toString();
    return query ? `?${query}` : '';
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
    const location = useLocation();
    const navigate = useNavigate();
    const routeParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
    const editorMode = routeParams.get('mode') === 'remove' || routeParams.has('subjectId') ? 'remove' : 'add';
    const editorSubjectId = routeParams.get('subjectId') || '';
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

    // The URL is the source of truth for the admin locator. Re-read the live
    // catalog on refresh and browser history navigation before restoring each level.
    useEffect(() => {
        let cancelled = false;

        async function restoreLocator() {
            const params = new URLSearchParams(location.search);
            const departmentParam = params.get('department');
            const courseParam = params.get('courseId');
            const semesterParam = params.get('semester');
            const requestedStep = params.get('step');
            const modeParam = params.get('mode');
            const subjectParam = params.get('subjectId');

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
            setCoursesLoading(false);
            setSubjectsLoading(false);

            if (!departmentParam) {
                if (courseParam || semesterParam !== null || requestedStep || modeParam || subjectParam) {
                    navigate({ pathname: '/admin/courses', search: '' }, { replace: true });
                }
                return;
            }

            const nextDomain = getCatalogDomain(departmentParam);
            if (!nextDomain) {
                navigate({ pathname: '/admin/courses', search: '' }, { replace: true });
                return;
            }

            setDomainId(nextDomain.id);
            setCoursesLoading(true);
            let availableCourses = [];
            try {
                const courseResult = await fetchCoursesForDomain(nextDomain.id);
                if (cancelled) return;
                if (courseResult.error) throw courseResult.error;
                availableCourses = courseResult.courses || [];
                setCourses(availableCourses);
            } catch (error) {
                if (!cancelled) {
                    setCoursesError(error?.message || 'The department courses could not be loaded.');
                    setStep('course');
                }
                return;
            } finally {
                if (!cancelled) setCoursesLoading(false);
            }

            let nextCourse = null;
            let nextCourseId = null;
            let availableSubjects = [];
            if (courseParam !== null) {
                const parsedCourseId = /^[0-9]+$/.test(courseParam) ? Number(courseParam) : NaN;
                nextCourse = Number.isSafeInteger(parsedCourseId) && parsedCourseId > 0
                    ? availableCourses.find(item => Number(item.courseId) === parsedCourseId
                        && item.domainId === nextDomain.id)
                    : null;

                if (!nextCourse) {
                    navigate({
                        pathname: '/admin/courses',
                        search: adminCoursesSearch({ department: nextDomain.id }),
                    }, { replace: true });
                    return;
                }

                nextCourseId = Number(nextCourse.courseId);
                setCourseId(nextCourseId);
                setCourse(nextCourse);
                setSubjectsLoading(true);
                try {
                    const subjectResult = await fetchCourseAndSubjects(nextCourseId);
                    if (cancelled) return;
                    if (subjectResult.error) throw subjectResult.error;
                    if (!subjectResult.course) throw new Error('The selected course is no longer available in the catalog.');
                    nextCourse = subjectResult.course;
                    availableSubjects = subjectResult.subjects || [];
                    setCourse(nextCourse);
                    setSubjects(availableSubjects);
                } catch (error) {
                    if (!cancelled) {
                        setSubjectsError(error?.message || 'The selected course subjects could not be loaded.');
                    }
                } finally {
                    if (!cancelled) setSubjectsLoading(false);
                }
            } else if (semesterParam !== null || modeParam || subjectParam) {
                navigate({
                    pathname: '/admin/courses',
                    search: adminCoursesSearch({ department: nextDomain.id }),
                }, { replace: true });
                return;
            }

            let nextSemester = null;
            if (semesterParam !== null) {
                const parsedSemester = /^[0-9]+$/.test(semesterParam) ? Number(semesterParam) : NaN;
                if (!nextCourse || !normalizeSemesterList(nextCourse.sems).includes(parsedSemester)) {
                    navigate({
                        pathname: '/admin/courses',
                        search: adminCoursesSearch({
                            department: nextDomain.id,
                            courseId: nextCourseId,
                        }),
                    }, { replace: true });
                    return;
                }
                nextSemester = parsedSemester;
                setSemester(nextSemester);
            }

            let nextSubjectId = null;
            if (subjectParam !== null && nextSemester !== null) {
                const parsedSubjectId = /^[0-9]+$/.test(subjectParam) ? Number(subjectParam) : NaN;
                const selectedSubject = Number.isSafeInteger(parsedSubjectId) && parsedSubjectId > 0
                    ? availableSubjects.find(item => Number(item.subjectId) === parsedSubjectId
                        && Number(item.sem) === nextSemester)
                    : null;
                if (selectedSubject) nextSubjectId = Number(selectedSubject.subjectId);
            }

            const nextMode = nextSemester !== null && (modeParam === 'remove' || nextSubjectId !== null)
                ? 'remove'
                : null;
            const maxStepIndex = nextSemester !== null ? 3 : nextCourseId !== null ? 2 : 1;
            const requestedStepIndex = STEPS.findIndex(item => item.id === requestedStep);
            const restoredStepIndex = requestedStepIndex < 0
                ? maxStepIndex
                : Math.min(requestedStepIndex, maxStepIndex);
            const restoredStep = STEPS[restoredStepIndex].id;
            setStep(restoredStep);

            const canonicalSearch = adminCoursesSearch({
                department: nextDomain.id,
                courseId: nextCourseId,
                semester: nextSemester,
                step: restoredStepIndex === maxStepIndex ? null : restoredStep,
                mode: nextMode,
                subjectId: nextSubjectId,
            });
            if (canonicalSearch !== location.search) {
                navigate({ pathname: '/admin/courses', search: canonicalSearch }, { replace: true });
            }
        }

        restoreLocator().catch(error => {
            if (!cancelled) {
                setCoursesError(error?.message || 'The department courses could not be loaded.');
                setCoursesLoading(false);
                setSubjectsLoading(false);
            }
        });

        return () => { cancelled = true; };
    }, [location.search, navigate, retryKey]);

    function navigateToLocator(filters, replace = false) {
        navigate({
            pathname: '/admin/courses',
            search: adminCoursesSearch(filters),
        }, { replace });
    }

    function chooseDepartment(nextDomain) {
        navigateToLocator({ department: nextDomain.id });
    }

    function chooseCourse(nextCourse) {
        navigateToLocator({
            department: domainId,
            courseId: nextCourse.courseId,
        });
    }

    function chooseSemester(value) {
        navigateToLocator({
            department: domainId,
            courseId,
            semester: Number(value),
        });
    }

    function goToStep(target) {
        const targetIndex = STEPS.findIndex(item => item.id === target);
        if (targetIndex < 0 || targetIndex > stepIndex) return;
        navigateToLocator({
            department: domainId,
            courseId,
            semester,
            step: target,
            mode: editorMode,
            subjectId: editorSubjectId || null,
        });
    }

    function resetLocator() {
        navigateToLocator({});
    }

    function handleEditorStateChange({ mode, subjectId }) {
        navigateToLocator({
            department: domainId,
            courseId,
            semester,
            mode,
            subjectId,
        });
    }

    async function refreshSubjectData() {
        resetCatalogCache();
        setSubjectsError('');
        try {
            const result = await fetchCourseAndSubjects(courseId);
            if (result.error) throw result.error;
            setCourse(result.course);
            setSubjects(result.subjects || []);
            const selectedId = new URLSearchParams(location.search).get('subjectId');
            if (selectedId && !(result.subjects || []).some(item => String(item.subjectId) === selectedId)) {
                navigateToLocator({
                    department: domainId,
                    courseId,
                    semester,
                    mode: editorMode,
                }, true);
            }
        } catch (error) {
            setSubjectsError(error?.message || 'The updated subject catalog could not be loaded.');
        } finally {
            setSubjectsLoading(false);
        }
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
                                onClick={() => goToStep(item.id)}
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
                                <button type="button" className="ac-btn ac-btn--secondary" onClick={() => goToStep('department')}>Change department</button>
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
                            <div className="ac-toolbar"><button type="button" className="ac-btn ac-btn--secondary" onClick={() => goToStep('course')}><ArrowLeft size={15} /> Courses</button></div>
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
                                <button type="button" className="ac-btn ac-btn--secondary" onClick={() => goToStep('semester')}><ArrowLeft size={15} /> Change semester</button>
                            </div>
                            {subjectsLoading ? <div className="ac-loading" role="status"><span className="ac-spinner" /> Loading subjects…</div>
                                : subjectsError ? <ErrorState message={subjectsError} onRetry={retryCurrentStage} />
                                    : course && <AdminSubjectEditor
                                        key={`${courseId}-${semester}-${editorMode}-${editorSubjectId}`}
                                        course={course}
                                        semester={semester}
                                        subjects={semesterSubjects}
                                        initialMode={editorMode}
                                        initialSubjectId={editorSubjectId}
                                        onEditorStateChange={handleEditorStateChange}
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
