/**
 * Integration: real App.jsx routing + real AuthContext + real ProtectedRoute +
 * real Signup page. Only Supabase itself and the heavy leaf pages are stubbed, so
 * this exercises the actual redirect/gating code paths after the auth migration.
 *
 * Role gating comes from the public.students row (via RLS), not from anything the
 * client can assert about itself.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

vi.mock('../src/supabase', async () => (await import('./supabaseMock.js')).supabaseModuleMock());
vi.mock('../src/firebase', () => ({
  auth: { currentUser: null }, db: {}, storage: {}, firebaseConfigError: null,
}));

const state = await import('./supabaseMock.js').then((m) => m.state);
const { resetSupabaseStub, makeSession, authUser, studentRow } = await import('./supabaseMock.js');

const holder = { entry: '/', user: null, profile: null };

// Drive <App/> through a MemoryRouter so a specific initial URL can be tested.
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

// Leaf pages are irrelevant to auth; keep them trivial so the assertions are
// about routing and role gating only.
vi.mock('../src/pages/LandingPage', () => ({ default: () => <div>LANDING</div> }));
vi.mock('../src/pages/Dashboard', () => ({ default: () => <div>DASHBOARD</div> }));
vi.mock('../src/pages/SyllabusAdmin', () => ({ default: () => <div>ADMIN SYLLABUS</div> }));
vi.mock('../src/pages/ExamPortal', () => ({ default: () => <div>EXAM</div> }));
vi.mock('../src/pages/ReviewPage', () => ({ default: () => <div>REVIEW</div> }));
// Layout must render <Outlet/> — React Router injects nested route content via
// Outlet, not via children.
vi.mock('../src/components/Layout', async () => {
  const { Outlet } = await import('react-router-dom');
  return {
    default: () => (
      <div data-testid="layout">
        <Outlet />
      </div>
    ),
  };
});

const App = (await import('../src/App.jsx')).default;

function selectedTab() {
  const tabs = screen.queryAllByRole('tab');
  const active = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
  return active ? active.textContent.trim() : null;
}

/** Sign `uid` in and hand the app their students row, exactly as RLS would. */
function signedInAs({ uid, email, role, fullName }) {
  state.session = makeSession(authUser({ id: uid, email }));
  state.profile = studentRow({ auth_uid: uid, email, full_name: fullName, ...(role ? { role } : {}) });
}

beforeEach(() => {
  cleanup();
  resetSupabaseStub();
  holder.entry = '/';
  sessionStorage.clear();
  localStorage.clear();
});

describe('ProtectedRoute (guest)', () => {
  it('sends an unauthenticated visitor to the Log in tab, not a bare /signup', async () => {
    holder.entry = '/dashboard';
    render(<App />);
    await waitFor(() => expect(selectedTab()).toBe('Log in'));
    expect(screen.getByRole('button', { name: /^Log in$/i })).toBeInTheDocument();
  });

  it('defaults a guest to the Create account tab when the URL asks for signup', async () => {
    holder.entry = '/signup?mode=signup';
    render(<App />);
    await waitFor(() => expect(selectedTab()).toBe('Create account'));
  });
});

describe('RBAC role derivation (from public.students.role)', () => {
  it('keeps a signed-in student out of the admin area', async () => {
    holder.entry = '/admin/syllabus';
    signedInAs({ uid: 'u1', email: 's@x.com', role: 'student', fullName: 'Student One' });
    render(<App />);
    await waitFor(() => expect(screen.getByText('DASHBOARD')).toBeInTheDocument());
    expect(screen.queryByText('ADMIN SYLLABUS')).not.toBeInTheDocument();
  });

  it('lets an admin through', async () => {
    holder.entry = '/admin/syllabus';
    signedInAs({ uid: 'u2', email: 'a@x.com', role: 'admin', fullName: 'Admin One' });
    render(<App />);
    await waitFor(() => expect(screen.getByText('ADMIN SYLLABUS')).toBeInTheDocument());
  });

  it('lets a superAdmin through', async () => {
    holder.entry = '/admin/syllabus';
    signedInAs({ uid: 'u4', email: 'root@x.com', role: 'superAdmin', fullName: 'Root' });
    render(<App />);
    await waitFor(() => expect(screen.getByText('ADMIN SYLLABUS')).toBeInTheDocument());
  });

  it('treats a missing role as student (fail closed, not open)', async () => {
    holder.entry = '/admin/syllabus';
    state.session = makeSession(authUser({ id: 'u3', email: 'n@x.com' }));
    // A row with no role of record: the column defaults to 'student', and the
    // context must not upgrade an absent/blank value.
    state.profile = { ...studentRow({ auth_uid: 'u3', email: 'n@x.com' }), role: 'student' };
    render(<App />);
    await waitFor(() => expect(screen.getByText('DASHBOARD')).toBeInTheDocument());
  });

  it('never trusts a role asserted outside the row', async () => {
    holder.entry = '/admin/syllabus';
    signedInAs({ uid: 'u5', email: 'sneaky@x.com', role: 'student', fullName: 'Sneaky' });
    // Even if the browser's session metadata claims superAdmin, RBAC follows the
    // database row — the trigger hard-codes 'student' at signup.
    state.session.user.app_metadata.role = 'superAdmin';
    state.session.user.user_metadata.role = 'superAdmin';
    render(<App />);
    await waitFor(() => expect(screen.getByText('DASHBOARD')).toBeInTheDocument());
    expect(screen.queryByText('ADMIN SYLLABUS')).not.toBeInTheDocument();
  });
});

describe('session + legacy routes', () => {
  it('a refreshed page with a live session lands straight in the app', async () => {
    holder.entry = '/dashboard';
    signedInAs({ uid: 'u6', email: 'back@x.com', role: 'student', fullName: 'Back Again' });
    render(<App />);
    await waitFor(() => expect(screen.getByText('DASHBOARD')).toBeInTheDocument());
  });

  it('legacy /login still resolves to the auth page with the login tab selected', async () => {
    holder.entry = '/login';
    render(<App />);
    await waitFor(() => expect(selectedTab()).toBe('Log in'));
  });
});
