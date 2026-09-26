/**
 * Phase 3 — admin catalog UI. Real App + Layout + AdminCourses.
 * Actions stay in memory; they must not hit Supabase/Firebase CRUD.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react';

vi.mock('../src/supabase', async () => (await import('./supabaseMock.js')).supabaseModuleMock());
vi.mock('../src/firebase', () => ({
  auth: { currentUser: null }, db: {}, storage: {}, firebaseConfigError: null,
}));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}), collection: () => ({}),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  query: vi.fn(), orderBy: vi.fn(),
}));

const holder = { entry: '/admin/courses' };

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    BrowserRouter: ({ children }) => (
      <actual.MemoryRouter key={holder.entry} initialEntries={[holder.entry]}>
        {children}
      </actual.MemoryRouter>
    ),
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
  state.session = makeSession(authUser({ id: uid, email }));
  if (staff) {
    state.adminRow = adminRow({
      auth_uid: uid, email, full_name: fullName,
      is_super_admin: staff === 'super',
    });
  } else {
    state.profile = studentRow({ auth_uid: uid, email, full_name: fullName });
  }
}

async function at(url) {
  holder.entry = url;
  const view = render(<App />);
  await waitFor(() => expect(view.container.firstChild).toBeTruthy());
  return view;
}

function writes() {
  return state.calls.filter((c) => c.op && c.op !== 'select' && c.op !== 'rpc');
}

function courseCard(title) {
  return screen.getByRole('button', { name: new RegExp(title) }).closest('.ac-course');
}

function subjectRow(title) {
  return screen.getByRole('button', { name: new RegExp(title) });
}

beforeEach(() => {
  cleanup();
  resetSupabaseStub();
  holder.entry = '/admin/courses';
  sessionStorage.clear();
  localStorage.clear();
});

describe('access', () => {
  it('lets an admin open Courses', async () => {
    signedInAs({ uid: 'a1', email: 'a@x.com', fullName: 'Admin', staff: 'admin' });
    await at('/admin/courses');
    await waitFor(() => expect(screen.getByRole('button', { name: /Add Course/i })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /B\.Tech - Computer Engineering/ })).toBeInTheDocument();
  });

  it('keeps a student on the student dashboard', async () => {
    signedInAs({ uid: 's1', email: 's@x.com', fullName: 'Stu' });
    await at('/admin/courses');
    await waitFor(() => expect(screen.getByText('STUDENT DASHBOARD')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Add Course/i })).toBeNull();
  });

  it('student navbar still has Home and Subscriptions', async () => {
    signedInAs({ uid: 's1', email: 's@x.com', fullName: 'Stu' });
    await at('/dashboard');
    await waitFor(() => expect(screen.getByText('STUDENT DASHBOARD')).toBeInTheDocument());
    const labels = [...document.querySelectorAll('.nav-desktop a')].map((a) => a.textContent.trim());
    expect(labels).toContain('Home');
    expect(labels).toContain('Subscriptions');
    expect(labels).not.toContain('Courses');
  });
});

describe('hierarchy', () => {
  beforeEach(() => {
    signedInAs({ uid: 'a1', email: 'a@x.com', fullName: 'Admin', staff: 'admin' });
  });

  it('selecting a course shows its semesters and resets subject to that course', async () => {
    await at('/admin/courses');
    await waitFor(() => expect(subjectRow('Calculus')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /B\.Tech - IT/ }));
    await waitFor(() => expect(subjectRow('Digital Logic')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Calculus/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Sem 1' })).toBeInTheDocument();
  });

  it('semester selection filters subjects', async () => {
    await at('/admin/courses');
    await waitFor(() => expect(subjectRow('Calculus')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Sem 2' }));
    await waitFor(() => expect(subjectRow('Object Oriented Programming')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Calculus/ })).toBeNull();
  });

  it('subject selection reveals that subject\'s questions', async () => {
    await at('/admin/courses');
    await waitFor(() => expect(screen.getByText('The derivative of sin(x) is')).toBeInTheDocument());
    fireEvent.click(subjectRow('Computer Programming'));
    await waitFor(() => expect(screen.getByText(/preprocessor directive/i)).toBeInTheDocument());
    expect(screen.queryByText('The derivative of sin(x) is')).toBeNull();
  });
});

describe('mock CRUD — no persistence', () => {
  beforeEach(() => {
    signedInAs({ uid: 'a1', email: 'a@x.com', fullName: 'Admin', staff: 'admin' });
  });

  it('Add / Edit / Remove Course stay in memory; semesters have no CRUD', async () => {
    await at('/admin/courses');
    await waitFor(() => expect(screen.getByRole('button', { name: /Add Course/i })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Add Semester/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Add Course/i }));
    fireEvent.change(screen.getByLabelText(/Course name/i), { target: { value: 'B.Tech - AI' } });
    fireEvent.click(screen.getByRole('button', { name: /^Update$/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /B\.Tech - AI/ })).toBeInTheDocument());

    fireEvent.click(within(courseCard('B\\.Tech - AI')).getByRole('button', { name: /^Edit$/i }));
    fireEvent.change(screen.getByLabelText(/Course name/i), { target: { value: 'B.Tech - AIML' } });
    fireEvent.click(screen.getByRole('button', { name: /^Update$/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /B\.Tech - AIML/ })).toBeInTheDocument());

    fireEvent.click(within(courseCard('B\\.Tech - AIML')).getByRole('button', { name: /^Remove$/i }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm remove/i }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /B\.Tech - AIML/ })).toBeNull());
    expect(screen.getByRole('status').textContent).toMatch(/Preview only/i);
    expect(writes()).toHaveLength(0);
  });

  it('Add Subject preview does not write to the database', async () => {
    await at('/admin/courses');
    await waitFor(() => expect(screen.getByRole('button', { name: /Add Subject/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Add Subject/i }));
    fireEvent.change(screen.getByLabelText(/Subject name/i), { target: { value: 'Discrete Maths' } });
    fireEvent.change(screen.getByLabelText(/Subject id/i), { target: { value: '01ma0199' } });
    fireEvent.click(screen.getByRole('button', { name: /^Update$/i }));
    await waitFor(() => expect(subjectRow('Discrete Maths')).toBeInTheDocument());
    expect(screen.getByRole('status').textContent).toMatch(/Preview only/i);
    expect(writes()).toHaveLength(0);
  });

  it('Edit Subject keeps course + subject choosers and stays mock', async () => {
    await at('/admin/courses');
    await waitFor(() => expect(subjectRow('Calculus')).toBeInTheDocument());
    fireEvent.click(within(subjectRow('Calculus')).getByRole('button', { name: /^Edit$/i }));
    expect(screen.getByLabelText(/^Course$/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Subject name/i), { target: { value: 'Calculus I' } });
    fireEvent.click(screen.getByRole('button', { name: /^Update$/i }));
    await waitFor(() => expect(subjectRow('Calculus I')).toBeInTheDocument());
    expect(writes()).toHaveLength(0);
  });

  it('Remove Subject asks for confirmation and does not persist', async () => {
    await at('/admin/courses');
    await waitFor(() => expect(subjectRow('Calculus')).toBeInTheDocument());
    fireEvent.click(within(subjectRow('Calculus')).getByRole('button', { name: /^Remove$/i }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm remove/i }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Calculus/ })).toBeNull());
    expect(screen.getByRole('status').textContent).toMatch(/Preview only/i);
    expect(writes()).toHaveLength(0);
  });

  it('Add / Edit / Remove Question stay in memory', async () => {
    await at('/admin/courses');
    await waitFor(() => expect(screen.getByRole('button', { name: /Add Question/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Add Question/i }));
    expect(screen.getByLabelText(/^Course$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Subject$/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Question$/i), { target: { value: 'What is a stack?' } });
    fireEvent.change(screen.getByLabelText('Option 1'), { target: { value: 'LIFO' } });
    fireEvent.click(screen.getByRole('button', { name: /^Update$/i }));
    await waitFor(() => expect(screen.getByText('What is a stack?')).toBeInTheDocument());

    const card = screen.getByText('What is a stack?').closest('.ac-q');
    fireEvent.click(within(card).getByRole('button', { name: /^Edit$/i }));
    fireEvent.change(screen.getByLabelText(/^Question$/i), { target: { value: 'Define a stack.' } });
    fireEvent.click(screen.getByRole('button', { name: /^Update$/i }));
    await waitFor(() => expect(screen.getByText('Define a stack.')).toBeInTheDocument());

    const edited = screen.getByText('Define a stack.').closest('.ac-q');
    fireEvent.click(within(edited).getByRole('button', { name: /^Remove$/i }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm remove/i }));
    await waitFor(() => expect(screen.queryByText('Define a stack.')).toBeNull());
    expect(writes()).toHaveLength(0);
  });
});
