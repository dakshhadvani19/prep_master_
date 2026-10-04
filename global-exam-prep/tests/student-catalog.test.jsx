/**
 * Student catalog: Department → Courses → Subjects → Semester.
 * Catalog pages read public."Courses" / public."Subjects" (never the full mockData.js tree).
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const holder = vi.hoisted(() => ({ entry: '/' }));

vi.mock('../src/supabase', async () => (await import('./supabaseMock.js')).supabaseModuleMock());
const { state, resetSupabaseStub, callsTo } = await import('./supabaseMock.js');
const { resetCatalogCache, courseIdsForDomain, resolveCourseParam } = await import('../src/utils/catalogApi.js');
const { CATALOG_DOMAINS } = await import('../src/data/catalogDomains.js');
const courseMapping = (await import('../src/data/courseMapping.json')).default;
const App = (await import('../src/App.jsx')).default;
const CourseExplorer = (await import('../src/pages/CourseExplorer.jsx')).default;
const SubjectDetails = (await import('../src/pages/SubjectDetails.jsx')).default;

const ENG_IDS = courseIdsForDomain('engineering');
const MATH_ID = 1001131010601; // course 1, semester 1 (current final numeric id)

function seedEngineering() {
  state.catalogCourses = [
    { CourseId: 1, CourseName: 'B.Tech - Computer Engineering', Sems: [1, 2, 3, 4, 5, 6, 7, 8] },
    { CourseId: 2, CourseName: 'B.Tech - IT', Sems: [1, 2, 3, 4, 5, 6, 7, 8] },
    { CourseId: 18, CourseName: 'BCA - should never appear in engineering', Sems: [1, 2, 3] },
  ];
}

function renderExplorer(domainId = 'engineering') {
  return render(
    <MemoryRouter initialEntries={[`/domains/${domainId}/courses`]}>
      <Routes>
        <Route path="/domains/:domainId/courses" element={<CourseExplorer />} />
        <Route path="/courses/:courseId/subjects" element={<div>SUBJECTS-PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderSubjects(courseId) {
  return render(
    <MemoryRouter initialEntries={[`/courses/${courseId}/subjects`]}>
      <Routes>
        <Route path="/courses/:courseId/subjects" element={<SubjectDetails />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  cleanup();
  resetSupabaseStub();
  resetCatalogCache();
  holder.entry = '/';
});

describe('homepage departments', () => {
  it('renders six departments without fetching Courses or Subjects', async () => {
    holder.entry = '/';
    render(<App />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Select Your Academic/i));
    for (const d of CATALOG_DOMAINS) {
      expect(document.body.textContent).toContain(d.title);
    }
    expect(CATALOG_DOMAINS).toHaveLength(6);
    const catalogReads = state.calls.filter((c) => c.table === 'Courses' || c.table === 'Subjects');
    expect(catalogReads).toEqual([]);
  }, 20000);
});

describe('department → courses', () => {
  it('fetches only that department’s CourseIds', async () => {
    seedEngineering();
    renderExplorer('engineering');
    await waitFor(() => expect(screen.getByText('B.Tech - Computer Engineering')).toBeTruthy());
    const courseSelects = callsTo('select:Courses');
    expect(courseSelects.length).toBeGreaterThan(0);
    expect(courseSelects[0].cols).toBe('CourseId,CourseName,Sems');
    expect(courseSelects[0].filters.CourseId).toEqual(ENG_IDS);
    expect(courseSelects[0].filters.CourseId).not.toContain(18);
    expect(screen.queryByText(/BCA/)).toBeNull();
    expect(screen.getByRole('link', { name: /B.Tech - Computer Engineering/i }).getAttribute('href')).toBe('/courses/1/subjects');
  });

  it('shows a loading state while courses are in flight', async () => {
    seedEngineering();
    state.catalogDelayMs = 80;
    renderExplorer('engineering');
    expect(screen.getByTestId('catalog-loading')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('B.Tech - Computer Engineering')).toBeTruthy());
  });

  it('renders error UI when the course query fails', async () => {
    seedEngineering();
    state.catalogError = { message: 'permission denied for table Courses' };
    renderExplorer('engineering');
    await waitFor(() => expect(screen.getByTestId('catalog-error')).toBeTruthy());
    expect(document.body.textContent).toMatch(/permission denied/i);
    expect(screen.queryByText('B.Tech - Computer Engineering')).toBeNull();
  });

  it('renders an empty state when the department has no course rows', async () => {
    state.catalogCourses = [];
    renderExplorer('engineering');
    await waitFor(() => expect(screen.getByTestId('catalog-empty')).toBeTruthy());
  });
});

describe('course → subjects', () => {
  it('fetches subjects only for that CourseId and keeps numeric ids in the route', async () => {
    seedEngineering();
    state.catalogSubjects = [
      { SubjectId: MATH_ID, SubjectName: 'Mathematics-I', CourseId: 1, Semester: 1 },
      { SubjectId: 1800001110101, SubjectName: 'Should not appear', CourseId: 18, Semester: 1 },
    ];
    renderSubjects(1);
    await waitFor(() => expect(screen.getByText('B.Tech - Computer Engineering')).toBeTruthy());
    const subjectSelects = callsTo('select:Subjects');
    expect(subjectSelects.length).toBe(1);
    expect(subjectSelects[0].cols).toBe('SubjectId,SubjectName,CourseId,Semester');
    expect(subjectSelects[0].filters.CourseId).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: /Sem 1/i }));
    expect(screen.getByText('Mathematics-I')).toBeTruthy();
    expect(screen.queryByText('Should not appear')).toBeNull();
  });

  it('uses Course.Sems and Subjects.Semester returned by Supabase', async () => {
    seedEngineering();
    state.catalogCourses = [
      { CourseId: 1, CourseName: 'B.Tech - Computer Engineering', Sems: [1, 2, 3] },
    ];
    state.catalogSubjects = [
      { SubjectId: MATH_ID, SubjectName: 'Mathematics-I', CourseId: 1, Semester: 1 },
      { SubjectId: 999999, SubjectName: 'Database Systems', CourseId: 1, Semester: 3 },
    ];
    renderSubjects('1');
    await waitFor(() => expect(screen.getByText('B.Tech - Computer Engineering')).toBeTruthy());

    expect(screen.getByRole('button', { name: /Sem 1/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Sem 2/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Sem 3/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Sem 3/i }));
    expect(screen.getByText('Database Systems')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Sem 1/i }));
    expect(screen.getByText('Mathematics-I')).toBeTruthy();
  });

  it('accepts numeric database CourseIds in the route', async () => {
    expect(resolveCourseParam('1')).toBe(1);
    expect(resolveCourseParam('btech-ce')).toBe(1);
    seedEngineering();
    state.catalogSubjects = [
      { SubjectId: MATH_ID, SubjectName: 'Mathematics-I', CourseId: 1, Semester: 1 },
    ];
    renderSubjects('1');
    await waitFor(() => expect(screen.getByText('B.Tech - Computer Engineering')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Sem 1/i }));
    fireEvent.click(screen.getByText('Mathematics-I'));
    fireEvent.click(screen.getByRole('button', { name: /Mid-Term 1/i }));
    fireEvent.click(screen.getByRole('button', { name: /Auto AI Exam/i }));
    const start = screen.getByRole('button', { name: /Start Exam/i });
    expect(start).toBeTruthy();
  });
});

describe('catalog bridge', () => {
  it('maps 49 courses for department scoping while semester data stays backend-backed', () => {
    expect(courseMapping).toHaveLength(49);
    expect(ENG_IDS.every((id) => id >= 1 && id <= 17)).toBe(true);
  });
});

describe('department course order + source CourseId', () => {
  it('keeps mapping order even if the database returns rows shuffled', async () => {
    state.catalogCourses = [
      { CourseId: 2, CourseName: 'B.Tech - IT', Sems: [1, 2] },
      { CourseId: 1, CourseName: 'B.Tech - Computer Engineering', Sems: [1, 2] },
    ];
    renderExplorer('engineering');
    await waitFor(() => expect(screen.getByText('B.Tech - IT')).toBeTruthy());
    const names = screen.getAllByRole('link').map((a) => a.textContent);
    const iCe = names.findIndex((t) => t.includes('Computer Engineering'));
    const iIt = names.findIndex((t) => t.includes('B.Tech - IT'));
    expect(iCe).toBeGreaterThanOrEqual(0);
    expect(iIt).toBeGreaterThan(iCe);
  });

  it('resolves a legacy source course id to the numeric CourseId fetch', async () => {
    seedEngineering();
    state.catalogSubjects = [
      { SubjectId: MATH_ID, SubjectName: 'Mathematics-I', CourseId: 1, Semester: 1 },
    ];
    renderSubjects('btech-ce');
    await waitFor(() => expect(screen.getByText('B.Tech - Computer Engineering')).toBeTruthy());
    expect(callsTo('select:Subjects')[0].filters.CourseId).toBe(1);
  });
});

describe('course page states', () => {
  it('shows loading then the subjects for a numeric CourseId', async () => {
    seedEngineering();
    state.catalogDelayMs = 80;
    state.catalogSubjects = [
      { SubjectId: MATH_ID, SubjectName: 'Mathematics-I', CourseId: 1, Semester: 1 },
    ];
    renderSubjects(1);
    expect(screen.getByTestId('catalog-loading')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('B.Tech - Computer Engineering')).toBeTruthy());
  });

  it('renders error UI when the subject query fails', async () => {
    seedEngineering();
    state.catalogError = { message: 'permission denied for table Subjects' };
    renderSubjects(1);
    await waitFor(() => expect(screen.getByTestId('catalog-error')).toBeTruthy());
    expect(document.body.textContent).toMatch(/permission denied/i);
  });

  it('renders empty state when the course has no subjects', async () => {
    seedEngineering();
    state.catalogSubjects = [];
    renderSubjects(1);
    await waitFor(() => expect(screen.getByTestId('catalog-empty')).toBeTruthy());
  });
});