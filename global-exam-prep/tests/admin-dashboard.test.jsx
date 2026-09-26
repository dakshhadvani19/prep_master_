/**
 * Phase 2 — admin UI shell, role-aware nav, Admin Dashboard.
 *
 * Real App + real Layout + real AdminDashboard / AdminCourses. Leaf student
 * pages are stubbed. Role still comes only from public.admins via AuthContext.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';

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

const holder = { entry: '/' };

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

function navLabels() {
  return [...document.querySelectorAll('.nav-desktop a')]
    .map((a) => a.textContent.trim())
    .filter(Boolean);
}

beforeEach(() => {
  cleanup();
  resetSupabaseStub();
  holder.entry = '/';
  sessionStorage.clear();
  localStorage.clear();
});

describe('unauthenticated visitor', () => {
  it('keeps Home and Subscriptions in the navbar', async () => {
    await at('/');
    await waitFor(() => expect(screen.getByText('LANDING')).toBeInTheDocument());
    const labels = navLabels();
    expect(labels).toContain('Home');
    expect(labels).toContain('Subscriptions');
    expect(labels).not.toContain('Courses');
    expect(document.querySelector('a[href="/"]')).toBeTruthy();
    expect(document.querySelector('a[href="/subscriptions"]')).toBeTruthy();
  });
});

describe('student', () => {
  it('keeps Home / Subscriptions and the student dashboard', async () => {
    signedInAs({ uid: 's1', email: 's@x.com', fullName: 'Student One' });
    await at('/dashboard');
    await waitFor(() => expect(screen.getByText('STUDENT DASHBOARD')).toBeInTheDocument());
    const labels = navLabels();
    expect(labels).toContain('Home');
    expect(labels).toContain('Subscriptions');
    expect(labels).not.toContain('Courses');
    expect(screen.queryByText('Admin control center')).toBeNull();
    expect(screen.queryByText('Add Admin')).toBeNull();
  });

  it('cannot open the admin Courses catalog', async () => {
    signedInAs({ uid: 's1', email: 's@x.com', fullName: 'Student One' });
    await at('/admin/courses');
    await waitFor(() => expect(screen.getByText('STUDENT DASHBOARD')).toBeInTheDocument());
    expect(screen.queryByText('Catalog')).toBeNull();
    expect(screen.queryByRole('button', { name: /Add Course/i })).toBeNull();
  });
});

describe('standard admin', () => {
  it('replaces Home→Dashboard and Subscriptions→Courses, lands on Admin Dashboard', async () => {
    signedInAs({ uid: 'a1', email: 'a@x.com', fullName: 'Admin One', staff: 'admin' });
    await at('/dashboard');
    await waitFor(() => expect(screen.getByText('Admin control center')).toBeInTheDocument());
    expect(screen.getByText('Standard Admin')).toBeInTheDocument();
    expect(screen.getByText('Feedback overview')).toBeInTheDocument();
    expect(screen.getByText('Spam users')).toBeInTheDocument();
    expect(screen.getByText('Leaderboard & ranking')).toBeInTheDocument();
    expect(screen.queryByText('STUDENT DASHBOARD')).toBeNull();
    expect(screen.queryByText('Add Admin')).toBeNull();
    expect(screen.queryByText('Remove Admin')).toBeNull();
    expect(screen.queryByText('Add Super Admin')).toBeNull();

    const labels = navLabels();
    expect(labels).toContain('Dashboard');
    expect(labels).toContain('Courses');
    expect(labels).toContain('Leaderboards');
    expect(labels).toContain('Feedback');
    expect(labels).not.toContain('Home');
    expect(labels).not.toContain('Subscriptions');
  });

  it('has no Home page — / redirects to the Admin Dashboard', async () => {
    signedInAs({ uid: 'a1', email: 'a@x.com', fullName: 'Admin One', staff: 'admin' });
    await at('/');
    await waitFor(() => expect(screen.getByText('Admin control center')).toBeInTheDocument());
    expect(screen.queryByText('LANDING')).toBeNull();
  });

  it('opens Courses for an admin without writing to public.admins', async () => {
    signedInAs({ uid: 'a1', email: 'a@x.com', fullName: 'Admin One', staff: 'admin' });
    await at('/admin/courses');
    await waitFor(() => expect(screen.getByText('Catalog')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Add Course/i })).toBeInTheDocument();
    expect(state.calls.filter((c) => c.table === 'admins' && c.op !== 'select')).toHaveLength(0);
  });
});

describe('super admin', () => {
  it('sees the same admin nav plus Add / Remove / Add Super Admin', async () => {
    signedInAs({ uid: 'r1', email: 'root@x.com', fullName: 'Root', staff: 'super' });
    await at('/dashboard');
    await waitFor(() => expect(screen.getByText('Add Admin')).toBeInTheDocument());
    expect(screen.getAllByText('Super Admin').length).toBeGreaterThan(0);
    expect(screen.getByText('Add Admin')).toBeInTheDocument();
    expect(screen.getByText('Remove Admin')).toBeInTheDocument();
    expect(screen.getByText('Add Super Admin')).toBeInTheDocument();
    const labels = navLabels();
    expect(labels).toContain('Dashboard');
    expect(labels).toContain('Courses');
    expect(labels).not.toContain('Home');
  });

  it('staff modals do not write public.admins, even on confirm', async () => {
    signedInAs({ uid: 'r1', email: 'root@x.com', fullName: 'Root', staff: 'super' });
    await at('/dashboard');
    await waitFor(() => expect(screen.getByText('Add Admin')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Add Admin'));
    fireEvent.change(screen.getByLabelText(/Full name/i), { target: { value: 'New Person' } });
    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'n@x.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirm \(preview\)/i }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Preview only/i));
    expect(state.calls.some((c) => c.table === 'admins' && c.op !== 'select')).toBe(false);
  });

  it('a students.role of admin plus localStorage cannot reveal Super Admin controls', async () => {
    signedInAs({ uid: 's9', email: 'forged@x.com', fullName: 'Forged' });
    state.profile = studentRow({ auth_uid: 's9', email: 'forged@x.com', role: 'admin' });
    localStorage.setItem('isAdmin', 'true');
    localStorage.setItem('role', 'superAdmin');
    await at('/dashboard');
    await waitFor(() => expect(screen.getByText('STUDENT DASHBOARD')).toBeInTheDocument());
    expect(screen.queryByText('Add Admin')).toBeNull();
    expect(screen.queryByText('Admin control center')).toBeNull();
  });
});
