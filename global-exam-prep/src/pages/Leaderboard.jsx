import { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertCircle,
    ArrowLeft,
    BadgeCheck,
    BookOpen,
    Briefcase,
    Building2,
    CheckCircle2,
    ChevronRight,
    Cpu,
    FlaskConical,
    GraduationCap,
    Layers3,
    LayoutGrid,
    LoaderCircle,
    LockKeyhole,
    RotateCcw,
    Scale,
    Search,
    Trophy,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
    CATALOG_DOMAINS,
    fetchCourseAndSubjects,
    fetchCoursesForDomain,
    mappingForCourseId,
} from '../utils/catalogApi';
import { getLeaderboardCompletedSubjects } from '../utils/supabaseExam';
import './Leaderboard.css';

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
    { id: 'subject', label: 'Subject' },
];

function normalizeName(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function subjectIsCompleted(subject, completedSubjects) {
    const subjectId = Number(subject?.subjectId);
    if (!Number.isSafeInteger(subjectId) || subjectId <= 0) return false;
    return completedSubjects.some((entry) => Number(entry?.subject_id) === subjectId);
}

function EmptyState({ icon = BookOpen, title, children }) {
    return (
        <div className="lb-empty-state">
            <span className="lb-empty-state__icon">{createElement(icon, { size: 21, strokeWidth: 1.8 })}</span>
            <h3>{title}</h3>
            {children && <p>{children}</p>}
        </div>
    );
}

function ChoiceCard({
    icon,
    title,
    subtitle,
    meta,
    selected = false,
    locked = false,
    checking = false,
    badge,
    onClick,
    testId,
}) {
    return (
        <button
            type="button"
            className={[
                'lb-choice',
                selected ? 'is-selected' : '',
                locked ? 'is-locked' : '',
            ].filter(Boolean).join(' ')}
            onClick={onClick}
            aria-pressed={selected}
            data-testid={testId}
        >
            <span className="lb-choice__icon">
                {checking
                    ? <LoaderCircle size={21} className="lb-spin" />
                    : locked
                        ? <LockKeyhole size={20} strokeWidth={1.8} />
                        : createElement(icon, { size: 21, strokeWidth: 1.8 })}
            </span>
            <span className="lb-choice__copy">
                <span className="lb-choice__title">{title}</span>
                {subtitle && <span className="lb-choice__sub">{subtitle}</span>}
                {meta && <span className="lb-choice__meta">{meta}</span>}
            </span>
            {badge && <span className={`lb-tag ${locked ? 'lb-tag--locked' : selected ? 'lb-tag--selected' : ''}`}>{badge}</span>}
            {!badge && <ChevronRight className="lb-choice__arrow" size={17} />}
        </button>
    );
}

export default function Leaderboard() {
    const auth = useAuth();
    const isAdmin = Boolean(auth.isAdmin);
    const userId = auth.currentUser?.uid || '';
    const [step, setStep] = useState('department');
    const [domain, setDomain] = useState(null);
    const [courses, setCourses] = useState([]);
    const [course, setCourse] = useState(null);
    const [subjects, setSubjects] = useState([]);
    const [semester, setSemester] = useState(null);
    const [selectedSubjectId, setSelectedSubjectId] = useState(null);
    const [courseQuery, setCourseQuery] = useState('');
    const [subjectQuery, setSubjectQuery] = useState('');
    const [loadingCourses, setLoadingCourses] = useState(false);
    const [loadingSubjects, setLoadingSubjects] = useState(false);
    const [loadingAccess, setLoadingAccess] = useState(!isAdmin);
    const [completedSubjects, setCompletedSubjects] = useState([]);
    const [accessError, setAccessError] = useState('');
    const [catalogError, setCatalogError] = useState('');

    const loadCompletedSubjects = useCallback(async () => {
        if (isAdmin) {
            setCompletedSubjects([]);
            setAccessError('');
            setLoadingAccess(false);
            return;
        }
        setLoadingAccess(true);
        setCompletedSubjects([]);
        setAccessError('');
        const result = await getLeaderboardCompletedSubjects();
        setCompletedSubjects(result.subjects || []);
        setAccessError(result.error || '');
        setLoadingAccess(false);
    }, [isAdmin]);

    useEffect(() => {
        let active = true;
        async function load() {
            if (isAdmin) {
                setLoadingAccess(false);
                setCompletedSubjects([]);
                setAccessError('');
                return;
            }
            setLoadingAccess(true);
            setCompletedSubjects([]);
            setAccessError('');
            const result = await getLeaderboardCompletedSubjects();
            if (!active) return;
            setCompletedSubjects(result.subjects || []);
            setAccessError(result.error || '');
            setLoadingAccess(false);
        }
        load();
        return () => { active = false; };
    }, [userId, isAdmin]);

    const filteredCourses = useMemo(() => {
        const query = normalizeName(courseQuery);
        return [...courses]
            .sort((a, b) => a.courseName.localeCompare(b.courseName))
            .filter((item) => !query || normalizeName(item.courseName).includes(query));
    }, [courses, courseQuery]);

    const semesterOptions = useMemo(() => (
        [...new Set(subjects.map((item) => Number(item.sem)).filter(Number.isFinite))]
            .sort((a, b) => a - b)
    ), [subjects]);

    const filteredSubjects = useMemo(() => {
        const query = normalizeName(subjectQuery);
        return subjects
            .filter((item) => Number(item.sem) === Number(semester))
            .sort((a, b) => a.subjectName.localeCompare(b.subjectName))
            .filter((item) => !query || normalizeName(item.subjectName).includes(query));
    }, [subjects, semester, subjectQuery]);

    const unlockedCount = useMemo(
        () => subjects.filter((item) => subjectIsCompleted(item, completedSubjects)).length,
        [subjects, completedSubjects],
    );

    const selectedSubject = subjects.find((item) => String(item.subjectId) === String(selectedSubjectId)) || null;
    const selectedIsUnlocked = Boolean(isAdmin || (!loadingAccess && !accessError && selectedSubject && subjectIsCompleted(selectedSubject, completedSubjects)));
    const stepIndex = Math.max(0, STEPS.findIndex((item) => item.id === step));

    async function chooseDomain(nextDomain) {
        setDomain(nextDomain);
        setCourse(null);
        setSubjects([]);
        setSemester(null);
        setSelectedSubjectId(null);
        setCourseQuery('');
        setSubjectQuery('');
        setCatalogError('');
        setLoadingCourses(true);
        setStep('course');
        const result = await fetchCoursesForDomain(nextDomain.id);
        setCourses(result.courses || []);
        setCatalogError(result.error?.message || '');
        setLoadingCourses(false);
    }

    async function chooseCourse(nextCourse) {
        setCourse(nextCourse);
        setSemester(null);
        setSelectedSubjectId(null);
        setSubjectQuery('');
        setCatalogError('');
        setLoadingSubjects(true);
        setStep('semester');
        const result = await fetchCourseAndSubjects(nextCourse.courseId);
        if (result.error) {
            setSubjects([]);
            setCatalogError(result.error.message || 'Could not load this course’s subjects.');
        } else {
            setCourse(result.course || nextCourse);
            setSubjects(result.subjects || []);
            if (!result.subjects?.length) {
                setCatalogError('No subjects are currently listed for this course.');
            }
        }
        setLoadingSubjects(false);
    }

    function chooseSemester(value) {
        setSemester(Number(value));
        setSelectedSubjectId(null);
        setSubjectQuery('');
        setStep('subject');
    }

    function resetPath() {
        setStep('department');
        setDomain(null);
        setCourses([]);
        setCourse(null);
        setSubjects([]);
        setSemester(null);
        setSelectedSubjectId(null);
        setCourseQuery('');
        setSubjectQuery('');
        setCatalogError('');
    }

    function moveToStep(target) {
        const targetIndex = STEPS.findIndex((item) => item.id === target);
        if (targetIndex < 0 || targetIndex > stepIndex) return;
        setStep(target);
        if (targetIndex === 0) {
            setDomain(null);
            setCourse(null);
            setSubjects([]);
            setSemester(null);
            setSelectedSubjectId(null);
            setCatalogError('');
        } else if (targetIndex === 1) {
            setCourse(null);
            setSubjects([]);
            setSemester(null);
            setSelectedSubjectId(null);
            setCatalogError('');
        } else if (targetIndex === 2) {
            setSelectedSubjectId(null);
        }
    }

    
    return (
        <main className="lb" data-testid="leaderboard-filter-page">
            <header className="lb-hero">
                <div className="lb-hero__copy">
                    <div className="lb-eyebrow"><span /> LEARN · COMPETE · IMPROVE</div>
                    <h1>Leaderboards</h1>
                    <p>Explore academic boards through your department, course, semester, and subject.</p>
                </div>
                <div className="lb-hero__mark" aria-hidden="true"><Trophy size={27} strokeWidth={1.6} /></div>
            </header>

            <section className="lb-guidance" aria-label="How leaderboard access works">
                <span className="lb-guidance__icon"><BadgeCheck size={19} /></span>
                <div>
                    <strong>Subject-based access</strong>
                    <p>{isAdmin
                        ? 'Administrator preview: explore the full course catalog. Ranking data will be connected in the next phase.'
                        : 'A subject unlocks after you submit a scored exam for that subject. Locked subjects remain visible so you can see what is available.'}</p>
                </div>
                <div className="lb-guidance__phase">FILTERS · PHASE 1</div>
            </section>

            {accessError && !isAdmin && (
                <div className="lb-alert" role="alert">
                    <AlertCircle size={18} />
                    <div>
                        <strong>Couldn’t verify completed exams</strong>
                        <p>Subject access is locked until the saved exam history can be checked.</p>
                    </div>
                    <button type="button" onClick={loadCompletedSubjects}>Retry</button>
                </div>
            )}

            <nav className="lb-stepper" aria-label="Leaderboard filters">
                {STEPS.map((item, index) => {
                    const completed = index < stepIndex;
                    const active = item.id === step;
                    const label = item.id === 'department' ? domain?.title
                        : item.id === 'course' ? course?.courseName
                            : item.id === 'semester' ? (semester == null ? '' : semester === 0 ? 'Semester 0' : `Semester ${semester}`)
                                : selectedSubject?.subjectName;
                    return (
                        <button
                            type="button"
                            key={item.id}
                            className={`lb-step ${active ? 'is-active' : ''} ${completed ? 'is-complete' : ''}`}
                            onClick={() => moveToStep(item.id)}
                            disabled={!completed && !active}
                            aria-current={active ? 'step' : undefined}
                            data-testid={`lb-step-${item.id}`}
                        >
                            <span className="lb-step__number">{completed ? <CheckCircle2 size={16} /> : index + 1}</span>
                            <span className="lb-step__labels">
                                <span className="lb-step__label">{item.label}</span>
                                {label && <span className="lb-step__value">{label}</span>}
                            </span>
                        </button>
                    );
                })}
            </nav>

            <section className="lb-browser" aria-labelledby="lb-stage-heading">
                <div className="lb-browser__head">
                    <div>
                        <div className="lb-stage-kicker">STEP {stepIndex + 1} OF {STEPS.length}</div>
                        <h2 id="lb-stage-heading">
                            {step === 'department' ? 'Choose a department'
                                : step === 'course' ? 'Select your course'
                                    : step === 'semester' ? 'Choose a semester'
                                        : 'Choose a subject'}
                        </h2>
                        <p>{step === 'department' ? 'Start with the academic area you want to explore.'
                            : step === 'course' ? 'Courses are grouped under the department you selected.'
                                : step === 'semester' ? 'Only semesters with subjects in the current catalog are shown.'
                                    : isAdmin ? 'Choose any subject to prepare the board filter.'
                                        : 'Unlocked subjects can be selected; locked ones need a completed exam first.'}</p>
                    </div>
                    {step !== 'department' && (
                        <button type="button" className="lb-back" onClick={() => moveToStep(STEPS[stepIndex - 1]?.id)}>
                            <ArrowLeft size={16} /> Back
                        </button>
                    )}
                </div>

                {catalogError && (
                    <div className="lb-alert lb-alert--catalog" role="alert">
                        <AlertCircle size={18} />
                        <div><strong>Catalog unavailable</strong><p>{catalogError}</p></div>
                        <button type="button" onClick={() => {
                            if (step === 'course' && domain) chooseDomain(domain);
                            else if (step === 'semester' && course) chooseCourse(course);
                        }}>Retry</button>
                    </div>
                )}

                {step === 'department' && (
                    <div className="lb-grid lb-grid--departments" data-testid="lb-departments">
                        {CATALOG_DOMAINS.map((item) => {
                            const Icon = DOMAIN_ICONS[item.id] || Building2;
                            return (
                                <ChoiceCard
                                    key={item.id}
                                    icon={Icon}
                                    title={item.title}
                                    subtitle={item.description}
                                    meta="Browse courses"
                                    onClick={() => chooseDomain(item)}
                                    testId={`lb-department-${item.id}`}
                                />
                            );
                        })}
                    </div>
                )}

                {step === 'course' && (
                    loadingCourses ? (
                        <div className="lb-loading"><LoaderCircle className="lb-spin" size={22} /> Loading courses…</div>
                    ) : filteredCourses.length ? (
                        <>
                            <label className="lb-search" htmlFor="lb-course-search">
                                <Search size={17} />
                                <input
                                    id="lb-course-search"
                                    value={courseQuery}
                                    onChange={(event) => setCourseQuery(event.target.value)}
                                    placeholder="Search courses in this department"
                                />
                            </label>
                            <div className="lb-grid lb-grid--courses" data-testid="lb-courses">
                                {filteredCourses.map((item) => {
                                    const mapping = mappingForCourseId(item.courseId);
                                    return (
                                        <ChoiceCard
                                            key={item.courseId}
                                            icon={GraduationCap}
                                            title={item.courseName}
                                            subtitle={`${item.sems?.length || 0} listed semesters`}
                                            meta={mapping?.subjectCount ? `${mapping.subjectCount} catalog subjects` : 'Explore subjects'}
                                            onClick={() => chooseCourse(item)}
                                            selected={course?.courseId === item.courseId}
                                            testId={`lb-course-${item.courseId}`}
                                        />
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        <EmptyState icon={GraduationCap} title="No courses found">
                            {catalogError || 'No courses are mapped to this department yet.'}
                        </EmptyState>
                    )
                )}

                {step === 'semester' && (
                    loadingSubjects ? (
                        <div className="lb-loading"><LoaderCircle className="lb-spin" size={22} /> Loading semesters and subjects…</div>
                    ) : semesterOptions.length ? (
                        <div className="lb-grid lb-grid--semesters" data-testid="lb-semesters">
                            {semesterOptions.map((value) => {
                                const count = subjects.filter((item) => Number(item.sem) === value).length;
                                const ready = subjects.filter((item) => Number(item.sem) === value
                                    && subjectIsCompleted(item, completedSubjects)).length;
                                return (
                                    <ChoiceCard
                                        key={value}
                                        icon={Layers3}
                                        title={value === 0 ? 'Semester 0' : `Semester ${value}`}
                                        subtitle={`${count} subjects`}
                                        meta={isAdmin ? 'All subjects available to inspect' : loadingAccess ? 'Checking access' : `${ready} unlocked`}
                                        selected={semester === value}
                                        checking={!isAdmin && loadingAccess}
                                        onClick={() => chooseSemester(value)}
                                        testId={`lb-semester-${value}`}
                                    />
                                );
                            })}
                        </div>
                    ) : (
                        <EmptyState icon={Layers3} title="No semester data">
                            {catalogError || 'This course has no semester-linked subjects in the catalog.'}
                        </EmptyState>
                    )
                )}

                {step === 'subject' && (
                    <>
                        <div className="lb-subject-toolbar">
                            <label className="lb-search" htmlFor="lb-subject-search">
                                <Search size={17} />
                                <input
                                    id="lb-subject-search"
                                    value={subjectQuery}
                                    onChange={(event) => setSubjectQuery(event.target.value)}
                                    placeholder="Search subjects in this semester"
                                />
                            </label>
                            <div className="lb-count">
                                {isAdmin ? 'Administrator view' : loadingAccess ? 'Checking access…' : `${unlockedCount} of ${subjects.filter((item) => Number(item.sem) === Number(semester)).length} unlocked in this course`}
                            </div>
                        </div>
                        {loadingAccess && !isAdmin && (
                            <div className="lb-access-loading"><LoaderCircle className="lb-spin" size={16} /> Verifying completed exams before enabling boards.</div>
                        )}
                        <div className="lb-grid lb-grid--subjects" data-testid="lb-subjects">
                            {filteredSubjects.map((item) => {
                                const unlocked = isAdmin || (!loadingAccess && subjectIsCompleted(item, completedSubjects));
                                const checking = !isAdmin && loadingAccess;
                                return (
                                    <ChoiceCard
                                        key={item.subjectId}
                                        icon={unlocked ? BookOpen : LockKeyhole}
                                        title={item.subjectName}
                                        subtitle={`Subject ID ${item.subjectId}`}
                                        meta={unlocked ? (isAdmin ? 'Administrator preview' : 'Exam completed') : 'Complete and submit an exam to unlock'}
                                        selected={String(selectedSubjectId) === String(item.subjectId)}
                                        locked={!unlocked && !checking}
                                        checking={checking}
                                        badge={checking ? 'Checking' : unlocked ? (isAdmin ? 'Preview' : 'Unlocked') : 'Locked'}
                                        onClick={() => setSelectedSubjectId(item.subjectId)}
                                        testId={`lb-subject-${item.subjectId}`}
                                    />
                                );
                            })}
                        </div>
                        {filteredSubjects.length === 0 && (
                            <EmptyState icon={BookOpen} title="No matching subjects">
                                Try another search or select a different semester.
                            </EmptyState>
                        )}
                        {selectedSubject && (
                            <section className={`lb-selection ${selectedIsUnlocked ? 'is-open' : 'is-locked'}`} data-testid="lb-selected-subject">
                                <span className="lb-selection__icon">
                                    {selectedIsUnlocked ? <CheckCircle2 size={21} /> : <LockKeyhole size={21} />}
                                </span>
                                <div className="lb-selection__copy">
                                    <span className="lb-selection__eyebrow">{selectedIsUnlocked ? 'SUBJECT SELECTED' : 'BOARD LOCKED'}</span>
                                    <h3>{selectedSubject.subjectName}</h3>
                                    <p>{selectedIsUnlocked
                                        ? isAdmin
                                            ? 'The department, course, semester, and subject filters are set. Verified leaderboard rankings will be connected in the next phase.'
                                            : 'Your completed exam unlocks this subject. The ranking list and verified scores will be connected in the next phase.'
                                        : accessError
                                            ? 'We could not confirm your exam history. Retry the access check before trying again.'
                                            : 'Submit an exam for this exact subject and wait for it to be recorded as completed. The subject will unlock automatically when your saved result can be verified.'}</p>
                                </div>
                                {selectedIsUnlocked
                                    ? <span className="lb-selection__state"><CheckCircle2 size={16} /> Unlocked</span>
                                    : <span className="lb-selection__state"><LockKeyhole size={16} /> Locked</span>}
                            </section>
                        )}
                    </>
                )}
            </section>

            <footer className="lb-footer">
                <div><span className="lb-footer__dot" /> Rankings are not fabricated or shown until the verified result feed is enabled.</div>
                <button type="button" onClick={resetPath}><RotateCcw size={15} /> Start over</button>
            </footer>
        </main>
    );
}
