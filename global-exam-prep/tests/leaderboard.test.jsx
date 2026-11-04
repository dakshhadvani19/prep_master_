/** Real catalog-filter phase tests. Ranking rows are intentionally absent until result projection is implemented. */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';

vi.mock('../src/supabase', async () => (await import('./supabaseMock.js')).supabaseModuleMock());

vi.mock('../src/data/subjectIdBridge.json', () => ({
  default: {
    '1001131010601': { s: '01ma0106', c: 'btech-ce', n: 1, sem: 1 },
    '1000135110101': { s: '01ce1101', c: 'btech-ce', n: 1, sem: 1 },
    '1000135010401': { s: '01ce0104', c: 'btech-ce', n: 1, sem: 2 },
  },
}));

vi.mock('../src/utils/catalogApi', async (importOriginal) => {
  const actual = await importOriginal();
  const course = {
    courseId: 1,
    courseName: 'B.Tech - Computer Engineering',
    sems: [1, 2],
    domainId: 'engineering',
    courseSourceId: 'btech-ce',
  };
  const lockedCourse = {
    courseId: 2,
    courseName: 'B.Tech - Information Technology',
    sems: [1, 2],
    domainId: 'engineering',
    courseSourceId: 'btech-it',
  };
  const subjects = [
    { subjectId: 1001131010601, subjectName: 'Calculus', courseId: 1, sem: 1, isDepartmentalSubject: false },
    { subjectId: 1000135110101, subjectName: 'Computer Programming', courseId: 1, sem: 1, isDepartmentalSubject: false },
    { subjectId: 1000135010401, subjectName: 'Object Oriented Programming', courseId: 1, sem: 2, isDepartmentalSubject: false },
  ];
  return {
    ...actual,
    fetchCoursesForDomain: vi.fn(async (domainId) => ({
      domain: actual.getCatalogDomain(domainId),
      courses: domainId === 'engineering' ? [course, lockedCourse] : [],
      error: null,
    })),
    fetchCourseAndSubjects: vi.fn(async (courseId) => Number(courseId) === 1
      ? { course, subjects, unmapped: [], error: null }
      : { course: null, subjects: [], unmapped: [], error: new Error('Course not found.') }),
    mappingForCourseId: vi.fn((courseId) => Number(courseId) === 1
      ? { courseId: 1, domainId: 'engineering', subjectCount: 3 }
      : Number(courseId) === 2
        ? { courseId: 2, domainId: 'engineering', subjectCount: 2 }
        : actual.mappingForCourseId(courseId)),
  };
});

vi.mock('../src/pages/LandingPage', () => ({ default: () => <div>LANDING</div> }));
vi.mock('../src/pages/Dashboard', () => ({ default: () => <div>STUDENT DASHBOARD</div> }));
vi.mock('../src/pages/SyllabusAdmin', () => ({ default: () => <div>ADMIN SYLLABUS</div> }));
vi.mock('../src/pages/ExamPortal', () => ({ default: () => <div>EXAM</div> }));
vi.mock('../src/pages/ReviewPage', () => ({ default: () => <div>REVIEW</div> }));
vi.mock('../src/pages/Signup', () => ({ default: () => <div>SIGNUP</div> }));

const { state, resetSupabaseStub, makeSession, authUser, studentRow, adminRow } =
  await import('./supabaseMock.js');
const App = (await import('../src/App.jsx')).default;

function signedInAs({ uid, email, staff, fullName }) {
  state.session = makeSession(authUser({
    id: uid, email,
    user_metadata: { full_name: fullName },
  }));
  if (staff) {
    state.adminRow = adminRow({
      auth_uid: uid, email, full_name: fullName,
      is_super_admin: staff === 'super',
    });
  } else {
    state.profile = studentRow({ auth_uid: uid, email, full_name: fullName });
  }
}

async function at(url = '/leaderboards') {
  window.history.pushState({}, '', url);
  const view = render(<App />);
  await waitFor(() => expect(view.container.firstChild).toBeTruthy());
  return view;
}

function mockUnlockResponse(completedSubjects = []) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ completedSubjects }),
  })));
}

beforeEach(() => {
  cleanup();
  resetSupabaseStub();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  localStorage.clear();
});

describe('leaderboard filtering access', () => {
  it('sends a guest to sign in', async () => {
    await at();
    await waitFor(() => expect(screen.getByText('SIGNUP')).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Leaderboards' })).toBeNull();
  });

  it('loads the real department-first hierarchy without showing mock ranks', async () => {
    signedInAs({ uid: 's1', email: 's@x.com', fullName: 'Student One' });
    mockUnlockResponse([]);
    await at();

    expect(await screen.findByRole('heading', { name: 'Choose a department' })).toBeInTheDocument();
    expect(screen.getByTestId('lb-departments')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Engineering & Technology/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('lb-department-engineering')).toHaveTextContent(/Locked/));
    expect(screen.getByTestId('lb-department-engineering')).toBeDisabled();
    expect(screen.queryByText(/Top 100/i)).toBeNull();
    expect(screen.queryByText(/Preview ranks/i)).toBeNull();
    expect(screen.queryByTestId('lb-top100')).toBeNull();
  });

  it('unlocks only a matching completed subject and leaves another subject locked', async () => {
    signedInAs({ uid: 's1', email: 's@x.com', fullName: 'Student One' });
    mockUnlockResponse([
      { subject_id: 1001131010601, course_id: 1, semester: 1, subject_code: '01ma0106', subject_name: 'Calculus', exam_type: 'Mid-Term 2', completed_at: '2026-10-27T10:00:00Z' },
    ]);
    await at();
    await waitFor(() => expect(screen.getByTestId('lb-department-engineering')).not.toBeDisabled());

    fireEvent.click(screen.getByTestId('lb-department-engineering'));
    await waitFor(() => expect(screen.getByTestId('lb-course-1')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('lb-course-1'));
    await waitFor(() => expect(screen.getByTestId('lb-semester-1')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('lb-semester-1'));

    const calculus = await screen.findByTestId('lb-subject-1001131010601');
    const programming = await screen.findByTestId('lb-subject-1000135110101');
    expect(calculus.textContent).toMatch(/Unlocked/);
    expect(programming.textContent).toMatch(/Locked/);

    fireEvent.click(calculus);
    expect((await screen.findByTestId('lb-selected-subject')).textContent).toMatch(/Your completed exam unlocks this exact subject/i);
    expect(screen.queryByTestId('lb-top100')).toBeNull();

    expect(programming).toBeDisabled();
    expect(screen.getByTestId('lb-selected-subject').textContent).not.toMatch(/BOARD LOCKED/i);
    expect(screen.queryByText(/Preview ranks/i)).toBeNull();
  });

  it('prevents direct navigation through locked hierarchy levels', async () => {
    signedInAs({ uid: 's1', email: 's@x.com', fullName: 'Student One' });
    mockUnlockResponse([
      { subject_id: 1001131010601, course_id: 1, semester: 1, subject_code: '01ma0106', subject_name: 'Calculus', exam_type: 'Mid-Term 2', completed_at: '2026-10-27T10:00:00Z' },
    ]);
    await at();

    const lockedDepartment = await screen.findByTestId('lb-department-computer-apps');
    expect(lockedDepartment).toBeDisabled();
    fireEvent.click(lockedDepartment);
    expect(screen.getByRole('heading', { name: 'Choose a department' })).toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId('lb-department-engineering')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('lb-department-engineering'));
    await waitFor(() => expect(screen.getByTestId('lb-course-1')).not.toBeDisabled());
    const lockedCourseButton = await screen.findByTestId('lb-course-2');
    fireEvent.click(lockedCourseButton);
    expect(screen.getByRole('heading', { name: 'Select your course' })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('lb-course-1'));
    await waitFor(() => expect(screen.getByTestId('lb-semester-1')).not.toBeDisabled());
    const lockedSemester = await screen.findByTestId('lb-semester-2');
    fireEvent.click(lockedSemester);
    expect(screen.getByRole('heading', { name: 'Choose a semester' })).toBeInTheDocument();
  });

  it('fails closed when exam access cannot be verified and lets the student retry', async () => {
    signedInAs({ uid: 's1', email: 's@x.com', fullName: 'Student One' });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Could not verify completed exams right now. Please retry.' }),
    })));
    await at();
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t verify completed exams/i);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('allows admins to browse all filters without student-specific locks', async () => {
    signedInAs({ uid: 'admin-1', email: 'a@x.com', fullName: 'Admin One', staff: 'admin' });
    mockUnlockResponse([]);
    await at();
    const engineering = await screen.findByTestId('lb-department-engineering');
    expect(engineering).not.toBeDisabled();
    expect(screen.getByTestId('lb-department-computer-apps')).not.toBeDisabled();
    fireEvent.click(engineering);
    const unlockedCourse = await screen.findByTestId('lb-course-1');
    const lockedCourseButton = await screen.findByTestId('lb-course-2');
    expect(unlockedCourse).not.toBeDisabled();
    expect(lockedCourseButton).not.toBeDisabled();
    fireEvent.click(unlockedCourse);
    const unlockedSemester = await screen.findByTestId('lb-semester-1');
    const lockedSemester = await screen.findByTestId('lb-semester-2');
    expect(unlockedSemester).not.toBeDisabled();
    expect(lockedSemester).not.toBeDisabled();
    fireEvent.click(unlockedSemester);
    const calculus = await screen.findByTestId('lb-subject-1001131010601');
    expect(calculus.textContent).toMatch(/Preview/);
    expect(calculus.textContent).not.toMatch(/Locked/);
    fireEvent.click(calculus);
    expect(screen.getByTestId('lb-selected-subject').textContent).toMatch(/Administrator preview/i);
    expect(screen.queryByTestId('lb-top100')).toBeNull();
  });
  it('stores the hierarchy in the URL and restores fresh lock status after refresh', async () => {
    signedInAs({ uid: 's1', email: 's@x.com', fullName: 'Student One' });
    let currentAccess = [
      { subject_id: 1001131010601, course_id: 1, semester: 1 },
    ];
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      const body = JSON.parse(options?.body || '{}');
      if (body.action === 'load') {
        expect(options.cache).toBe('no-store');
        return { ok: true, status: 200, json: async () => ({ completedSubjects: currentAccess }) };
      }
      return { ok: false, status: 503, json: async () => ({ error: 'Leaderboard unavailable.' }) };
    }));

    const firstVisit = await at();
    await waitFor(() => expect(screen.getByTestId('lb-department-engineering')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('lb-department-engineering'));
    await waitFor(() => expect(screen.getByTestId('lb-course-1')).not.toBeDisabled());
    expect(new URLSearchParams(window.location.search).get('department')).toBe('engineering');

    fireEvent.click(screen.getByTestId('lb-course-1'));
    await waitFor(() => expect(screen.getByTestId('lb-semester-1')).not.toBeDisabled());
    expect(new URLSearchParams(window.location.search).get('courseId')).toBe('1');

    fireEvent.click(screen.getByTestId('lb-semester-1'));
    await waitFor(() => expect(screen.getByTestId('lb-subject-1001131010601')).toBeInTheDocument());
    expect(new URLSearchParams(window.location.search).get('semester')).toBe('1');

    fireEvent.click(screen.getByTestId('lb-subject-1001131010601'));
    await waitFor(() => expect(screen.getByTestId('lb-selected-subject')).toHaveTextContent(/SUBJECT SELECTED/i));
    fireEvent.click(screen.getByTestId('lb-step-semester'));
    await screen.findByRole('heading', { name: 'Choose a semester' });
    expect(new URLSearchParams(window.location.search).get('step')).toBe('semester');

    // Re-selecting the same semester returns to its subject list and clears
    // the temporary step marker before selecting the subject again.
    fireEvent.click(screen.getByTestId('lb-semester-1'));
    await waitFor(() => expect(screen.getByTestId('lb-subject-1001131010601')).toBeInTheDocument());
    expect(new URLSearchParams(window.location.search).get('step')).toBeNull();
    fireEvent.click(screen.getByTestId('lb-subject-1001131010601'));
    await waitFor(() => expect(screen.getByTestId('lb-selected-subject')).toHaveTextContent(/SUBJECT SELECTED/i));

    const savedSearch = window.location.search;
    expect(new URLSearchParams(savedSearch).get('subjectId')).toBe('1001131010601');

    // Refresh with another completion in the same semester: the parent remains
    // available, but the previously selected subject becomes locked.
    currentAccess = [{ subject_id: 1000135110101, course_id: 1, semester: 1 }];
    firstVisit.unmount();
    await at(`/leaderboards${savedSearch}`);

    const restoredSelection = await screen.findByTestId('lb-selected-subject');
    expect(restoredSelection).toHaveTextContent(/BOARD LOCKED/i);
    expect(screen.getByTestId('lb-subject-1001131010601')).toBeDisabled();
    expect(screen.queryByTestId('lb-top100')).toBeNull();
    expect(new URLSearchParams(window.location.search).get('subjectId')).toBe('1001131010601');
  });

  it('restores an administrator deep link without student access restrictions', async () => {
    signedInAs({ uid: 'admin-1', email: 'a@x.com', fullName: 'Admin One', staff: 'admin' });
    mockUnlockResponse([]);
    await at('/leaderboards?department=engineering&courseId=1&semester=1&subjectId=1001131010601');

    expect(await screen.findByTestId('lb-selected-subject')).toHaveTextContent(/Administrator preview/i);
    expect(screen.getByTestId('lb-subject-1001131010601')).not.toBeDisabled();
    expect(new URLSearchParams(window.location.search).get('subjectId')).toBe('1001131010601');
  });

});
