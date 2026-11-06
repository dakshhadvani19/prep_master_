import { createElement, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
    AlertCircle, ArrowLeft, BookOpen, CheckCircle2, ChevronRight, Cpu, GraduationCap,
    Layers3, LayoutGrid, Briefcase, FlaskConical, Scale, Search, RefreshCw, X,
    LoaderCircle,
} from 'lucide-react';
import { CATALOG_DOMAINS, fetchCourseAndSubjects, fetchCoursesForDomain, getCatalogDomain, resetCatalogCache } from '../utils/catalogApi';
import AdminSubjectEditor from '../components/AdminSubjectEditor.jsx';
import './Leaderboard.css';
import './AdminCourses.css';

const DOMAIN_ICONS = {
    engineering: Cpu,
    'computer-apps': LayoutGrid,
    management: Briefcase,
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

function CatalogChoice({ icon: Icon, title, subtitle, meta, onClick, testId }) {
    return (
        <button
            type="button"
            className="lb-choice"
            onClick={onClick}
            data-testid={testId}
        >
            <span className="lb-choice__icon">
                {createElement(Icon, { size: 21, strokeWidth: 1.8 })}
            </span>
            <span className="lb-choice__copy">
                <span className="lb-choice__title">{title}</span>
                {subtitle && <span className="lb-choice__sub">{subtitle}</span>}
                {meta && <span className="lb-choice__meta">{meta}</span>}
            </span>
            <ChevronRight className="lb-choice__arrow" size={17} />
        </button>
    );
}

function EmptyState({ icon: Icon = BookOpen, title, children }) {
    return (
        <div className="lb-empty-state">
            <span className="lb-empty-state__icon">
                {createElement(Icon, { size: 21, strokeWidth: 1.8 })}
            </span>
            <h3>{title}</h3>
            {children && <p>{children}</p>}
        </div>
    );
}

function ErrorState({ message, onRetry }) {
    return (
        <div className="lb-alert" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <div>
                <strong>Could not load catalog data</strong>
                <p>{message || 'Please check your connection and try again.'}</p>
            </div>
            <button type="button" onClick={onRetry}>
                <RefreshCw size={14} /> Retry
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
        <main className="ac lb" data-testid="admin-course-catalog">
            <header className="lb-hero">
                <div className="lb-hero__copy">
                    <h1>Edit subjects</h1>
                    <p>Add a subject with its syllabus or remove a subject from the selected semester.</p>
                </div>
                <div className="ac-courses__hero-side">
                    <div className="lb-hero__mark" aria-hidden="true">
                        <BookOpen size={25} strokeWidth={1.7} />
                    </div>
                    <div className="ac-hero__actions">
                        <Link to="/dashboard" className="lb-back"><ArrowLeft size={15} /> Dashboard</Link>
                        <button type="button" className="lb-back" onClick={resetLocator}>
                            <RefreshCw size={14} /> Start over
                        </button>
                    </div>
                </div>
            </header>

            <nav className="lb-stepper" aria-label="Catalog location">
                {STEPS.map((item, index) => {
                    const complete = index < stepIndex;
                    const active = step === item.id;
                    return (
                        <button
                            type="button"
                            key={item.id}
                            className={'lb-step' + (active ? ' is-active' : '') + (complete ? ' is-complete' : '')}
                            onClick={() => goToStep(item.id)}
                            disabled={index > stepIndex}
                            aria-current={active ? 'step' : undefined}
                            data-testid={'admin-step-' + item.id}
                        >
                            <span className="lb-step__number">
                                {complete ? <CheckCircle2 size={16} /> : index + 1}
                            </span>
                            <span className="lb-step__labels">
                                <span className="lb-step__label">{item.label}</span>
                                {stepValues[index] && <span className="lb-step__value">{stepValues[index]}</span>}
                            </span>
                        </button>
                    );
                })}
            </nav>

            <section className="lb-browser" aria-live="polite" aria-label="Department, course and subject catalog">
                <div className="lb-browser__head">
                    <div>
                        <h2>
                            {step === 'department' ? 'Choose a department'
                                : step === 'course' ? (domain?.title || 'Select a course')
                                    : step === 'semester' ? (course?.courseName || 'Select a semester')
                                        : semester === 0 ? 'Edit semester 0 subjects' : 'Edit semester ' + semester + ' subjects'}
                        </h2>
                        <p>
                            {step === 'department' ? 'All six catalog departments are available to administrators.'
                                : step === 'course' ? 'Courses are loaded from the live catalog. Select a course to see its semesters.'
                                    : step === 'semester' ? 'Semester options come directly from the selected course record.'
                                        : (course?.courseName || 'Selected course') + ' · Add a new subject with its syllabus or remove an eligible subject.'}
                        </p>
                    </div>
                    {(step === 'course' || step === 'subject') && (
                        <span className="lb-count">
                            {step === 'course'
                                ? filteredCourses.length + (filteredCourses.length === 1 ? ' result' : ' results')
                                : semesterSubjects.length + (semesterSubjects.length === 1 ? ' subject' : ' subjects')}
                        </span>
                    )}
                    {step === 'course' && (
                        <button type="button" className="lb-back" onClick={() => goToStep('department')}>
                            <ArrowLeft size={15} /> Change department
                        </button>
                    )}
                    {step === 'semester' && (
                        <button type="button" className="lb-back" onClick={() => goToStep('course')}>
                            <ArrowLeft size={15} /> Courses
                        </button>
                    )}
                    {step === 'subject' && (
                        <button type="button" className="lb-back" onClick={() => goToStep('semester')}>
                            <ArrowLeft size={15} /> Change semester
                        </button>
                    )}
                </div>

                {step === 'department' && (
                    <div className="lb-grid lb-grid--departments" data-testid="admin-departments">
                        {CATALOG_DOMAINS.map(item => (
                            <CatalogChoice
                                key={item.id}
                                icon={DOMAIN_ICONS[item.id] || GraduationCap}
                                title={item.title}
                                subtitle={item.description}
                                meta="Browse courses"
                                onClick={() => chooseDepartment(item)}
                                testId={'admin-department-' + item.id}
                            />
                        ))}
                    </div>
                )}

                {step === 'course' && (
                    <>
                        <div className="lb-subject-toolbar ac-courses__toolbar">
                            <label className="lb-search" htmlFor="admin-course-search">
                                <Search size={17} />
                                <input
                                    id="admin-course-search"
                                    value={courseSearch}
                                    onChange={event => setCourseSearch(event.target.value)}
                                    placeholder="Search courses…"
                                    aria-label="Search courses"
                                />
                                {courseSearch && (
                                    <button
                                        type="button"
                                        className="ac-courses__clear"
                                        aria-label="Clear course search"
                                        onClick={() => setCourseSearch('')}
                                    >
                                        <X size={15} />
                                    </button>
                                )}
                            </label>
                        </div>
                        {coursesLoading ? (
                            <div className="lb-loading" role="status">
                                <LoaderCircle className="lb-spin" size={22} /> Loading courses from the catalog…
                            </div>
                        ) : coursesError ? (
                            <ErrorState message={coursesError} onRetry={retryCurrentStage} />
                        ) : filteredCourses.length === 0 ? (
                            <EmptyState icon={BookOpen} title="No courses found">
                                {courses.length ? 'Try another search term.' : 'No live courses are linked to this department.'}
                            </EmptyState>
                        ) : (
                            <div className="lb-grid lb-grid--courses" data-testid="admin-courses">
                                {filteredCourses.map(item => (
                                    <CatalogChoice
                                        key={item.courseId}
                                        icon={GraduationCap}
                                        title={item.courseName}
                                        subtitle={(item.sems?.length || 0) + ' listed semesters'}
                                        meta="Select course to view semesters"
                                        onClick={() => chooseCourse(item)}
                                        testId={'admin-course-' + item.courseId}
                                    />
                                ))}
                            </div>
                        )}
                    </>
                )}

                {step === 'semester' && (
                    <>
                        {subjectsLoading ? (
                            <div className="lb-loading" role="status">
                                <LoaderCircle className="lb-spin" size={22} /> Loading course and semester data…
                            </div>
                        ) : subjectsError ? (
                            <ErrorState message={subjectsError} onRetry={retryCurrentStage} />
                        ) : semesters.length === 0 ? (
                            <EmptyState icon={Layers3} title="No semesters listed">
                                This course has no semester values in the live catalog.
                            </EmptyState>
                        ) : (
                            <div className="lb-grid lb-grid--semesters" data-testid="admin-semesters">
                                {semesters.map(value => {
                                    const count = subjects.filter(item => Number(item.sem) === Number(value)).length;
                                    return (
                                        <CatalogChoice
                                            key={value}
                                            icon={Layers3}
                                            title={value === 0 ? 'Semester 0' : 'Semester ' + value}
                                            subtitle={count + (count === 1 ? ' subject' : ' subjects')}
                                            meta="Browse subjects"
                                            onClick={() => chooseSemester(value)}
                                            testId={'semester-option-' + value}
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}

                {step === 'subject' && (
                    <div className="ac-courses__subject-stage">
                        {subjectsLoading ? (
                            <div className="lb-loading" role="status">
                                <LoaderCircle className="lb-spin" size={22} /> Loading subjects…
                            </div>
                        ) : subjectsError ? (
                            <ErrorState message={subjectsError} onRetry={retryCurrentStage} />
                        ) : (
                            course && <AdminSubjectEditor
                                key={courseId + '-' + semester + '-' + editorMode + '-' + editorSubjectId}
                                course={course}
                                semester={semester}
                                subjects={semesterSubjects}
                                initialMode={editorMode}
                                initialSubjectId={editorSubjectId}
                                onEditorStateChange={handleEditorStateChange}
                                onChanged={refreshSubjectData}
                            />
                        )}
                    </div>
                )}
            </section>
        </main>
    );
}
