/**
 * Phase 4 — leaderboard UI. Real App + Layout + Leaderboard.
 * Ranks stay in memory; no Supabase/Firebase writes.
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

const holder = { entry: '/leaderboards' };

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

async function at(url) {
  holder.entry = url;
  const view = render(<App />);
  await waitFor(() => expect(view.container.firstChild).toBeTruthy());
  return view;
}

function writes() {
  return state.calls.filter((c) => c.op && c.op !== 'select' && c.op !== 'rpc');
}

beforeEach(() => {
  cleanup();
  resetSupabaseStub();
  holder.entry = '/leaderboards';
  sessionStorage.clear();
  localStorage.clear();
});

describe('access', () => {
  it('sends a guest to sign in', async () => {
    await at('/leaderboards');
    await waitFor(() => expect(screen.getByText('SIGNUP')).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Leaderboard' })).toBeNull();
  });

  it('lets a student open the student leaderboard', async () => {
    signedInAs({ uid: 's1', email: 's@x.com', fullName: 'Stu Kapoor' });
    await at('/leaderboards');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Leaderboard' })).toBeInTheDocument());
    expect(screen.getByText(/Student · Rankings/)).toBeInTheDocument();
    expect(screen.getByTestId('lb-student-boards')).toBeInTheDocument();
    expect(screen.queryByTestId('lb-admin-filters')).toBeNull();
    expect(screen.queryByLabelText(/^Course$/i)).toBeNull();
  });

  it('lets an admin open the all-boards view', async () => {
    signedInAs({ uid: 'a1', email: 'a@x.com', fullName: 'Admin One', staff: 'admin' });
    await at('/leaderboards');
    await waitFor(() => expect(screen.getByTestId('lb-admin-filters')).toBeInTheDocument());
    expect(screen.getByLabelText(/^Course$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Semester$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Subject$/i)).toBeInTheDocument();
    expect(screen.queryByTestId('lb-student-boards')).toBeNull();
    expect(screen.queryByTestId('lb-you')).toBeNull();
  });

  it('super admin inherits the admin leaderboard, with no extra controls', async () => {
    signedInAs({ uid: 'r1', email: 'root@x.com', fullName: 'Root', staff: 'super' });
    await at('/leaderboards');
    await waitFor(() => expect(screen.getByTestId('lb-admin-filters')).toBeInTheDocument());
    expect(screen.queryByText(/Super Admin only/i)).toBeNull();
  });

  it('student navbar is unchanged', async () => {
    signedInAs({ uid: 's1', email: 's@x.com', fullName: 'Stu Kapoor' });
    await at('/dashboard');
    await waitFor(() => expect(screen.getByText('STUDENT DASHBOARD')).toBeInTheDocument());
    const labels = [...document.querySelectorAll('.nav-desktop a')].map((a) => a.textContent.trim());
    expect(labels).toContain('Home');
    expect(labels).toContain('Subscriptions');
    expect(labels).toContain('Leaderboards');
  });
});

describe('student ranking', () => {
  beforeEach(() => {
    signedInAs({ uid: 's1', email: 's@x.com', fullName: 'Stu Kapoor' });
  });

  it('shows Top 100, own rank outside that list, and percentile', async () => {
    await at('/leaderboards');
    await waitFor(() => expect(screen.getByTestId('lb-you')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: /Top 100/ })).toBeInTheDocument();
    const rows = document.querySelectorAll('[data-testid="lb-top100"] .lb-row');
    expect(rows.length).toBe(10);
    expect(rows[0].querySelector('.lb-badge').textContent).toBe('4');
    expect(screen.getByTestId('lb-you').textContent).toMatch(/#118/);
    expect(screen.getByTestId('lb-you').textContent).toMatch(/Stu Kapoor/);
    expect(screen.getByTestId('lb-percentile').textContent).toMatch(/%/);
    expect(screen.getByTestId('lb-you').textContent).toMatch(/Outside the Top 100/i);
    expect(writes()).toHaveLength(0);
  });

  it('switching a participating board updates rank', async () => {
    await at('/leaderboards');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Computer Programming' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Computer Programming' }));
    await waitFor(() => expect(screen.getByTestId('lb-you').textContent).toMatch(/#14/));
    expect(screen.getByRole('status').textContent).toMatch(/Preview ranks/i);
    expect(writes()).toHaveLength(0);
  });
});

describe('admin filters', () => {
  beforeEach(() => {
    signedInAs({ uid: 'a1', email: 'a@x.com', fullName: 'Admin One', staff: 'admin' });
  });

  it('Course selection restricts semester/subject lists', async () => {
    await at('/leaderboards');
    await waitFor(() => expect(screen.getByLabelText(/^Subject$/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/^Subject$/i).textContent).toMatch(/Calculus/);
    fireEvent.change(screen.getByLabelText(/^Course$/i), { target: { value: 'btech-it' } });
    await waitFor(() => expect(screen.getByLabelText(/^Subject$/i).textContent).toMatch(/Digital Logic/));
    expect(screen.getByLabelText(/^Subject$/i).textContent).not.toMatch(/Calculus/);
    expect(screen.getByRole('status').textContent).toMatch(/Preview ranks/i);
  });

  it('semester selection loads that semester’s subjects', async () => {
    await at('/leaderboards');
    await waitFor(() => expect(screen.getByLabelText(/^Semester$/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/^Semester$/i), { target: { value: '2' } });
    await waitFor(() => expect(screen.getByLabelText(/^Subject$/i).textContent).toMatch(/Object Oriented Programming/));
    expect(screen.getByLabelText(/^Subject$/i).textContent).not.toMatch(/Calculus/);
  });

  it('renders Top 100 for the selected board and does not persist', async () => {
    await at('/leaderboards');
    await waitFor(() => expect(screen.getByTestId('lb-top100')).toBeInTheDocument());
    expect(document.querySelectorAll('[data-testid="lb-top100"] .lb-row').length).toBe(10);
    fireEvent.click(screen.getByRole('button', { name: /Show more/i }));
    await waitFor(() => {
      expect(document.querySelectorAll('[data-testid="lb-top100"] .lb-row').length).toBe(97);
    });
    expect(screen.getByRole('button', { name: /Show less/i })).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });
});
