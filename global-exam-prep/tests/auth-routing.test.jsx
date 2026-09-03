/**
 * Integration: real App.jsx routing + real AuthContext + real ProtectedRoute +
 * real Signup page. Only Firebase itself and the heavy leaf pages are stubbed,
 * so this exercises the actual redirect/gating code paths.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

const holder = vi.hoisted(() => ({
  entry: '/',
  user: null,
  profile: null,
}));

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

vi.mock('../src/firebase', () => ({
  auth: { currentUser: null, providerData: [] },
  db: {},
  storage: {},
  firebaseConfigError: null,
}));

vi.mock('firebase/auth', () => {
  class GoogleAuthProvider { setCustomParameters() { return this; } }
  return {
    GoogleAuthProvider,
    EmailAuthProvider: { credential: vi.fn() },
    createUserWithEmailAndPassword: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
    onAuthStateChanged: (a, cb) => { cb(holder.user); return () => {}; },
    updateProfile: vi.fn(),
    deleteUser: vi.fn(),
    signInWithPopup: vi.fn(),
    signInWithRedirect: vi.fn(),
    getRedirectResult: vi.fn().mockResolvedValue(null),
    getAdditionalUserInfo: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
    sendEmailVerification: vi.fn(),
    updatePassword: vi.fn(),
    reauthenticateWithCredential: vi.fn(),
  };
});

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(),
  getDoc: vi.fn(async () => ({ exists: () => !!holder.profile, data: () => holder.profile })),
  updateDoc: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(),
  increment: vi.fn(),
  runTransaction: vi.fn(),
}));

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
  const active = tabs.find(t => t.getAttribute('aria-selected') === 'true');
  return active ? active.textContent.trim() : null;
}

beforeEach(() => {
  cleanup();
  holder.user = null;
  holder.profile = null;
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

describe('RBAC role derivation', () => {
  it('keeps a signed-in student out of the admin area', async () => {
    holder.entry = '/admin/syllabus';
    holder.user = { uid: 'u1', email: 's@x.com', providerData: [{ providerId: 'password' }] };
    holder.profile = { uid: 'u1', email: 's@x.com', role: 'student', fullName: 'Student One' };
    render(<App />);
    await waitFor(() => expect(screen.getByText('DASHBOARD')).toBeInTheDocument());
    expect(screen.queryByText('ADMIN SYLLABUS')).not.toBeInTheDocument();
  });

  it('lets an admin through', async () => {
    holder.entry = '/admin/syllabus';
    holder.user = { uid: 'u2', email: 'a@x.com', providerId: 'password', providerData: [{ providerId: 'password' }] };
    holder.profile = { uid: 'u2', email: 'a@x.com', role: 'admin', fullName: 'Admin One' };
    render(<App />);
    await waitFor(() => expect(screen.getByText('ADMIN SYLLABUS')).toBeInTheDocument());
  });

  it('treats a missing role as student (fail closed, not open)', async () => {
    holder.entry = '/admin/syllabus';
    holder.user = { uid: 'u3', email: 'n@x.com', providerData: [{ providerId: 'password' }] };
    holder.profile = { uid: 'u3', email: 'n@x.com', fullName: 'No Role' };
    render(<App />);
    await waitFor(() => expect(screen.getByText('DASHBOARD')).toBeInTheDocument());
  });
});

describe('legacy /login URL', () => {
  it('still resolves to the auth page with the login tab selected', async () => {
    holder.entry = '/login';
    render(<App />);
    await waitFor(() => expect(selectedTab()).toBe('Log in'));
  });
});
