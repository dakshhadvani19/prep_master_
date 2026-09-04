/**
 * The Log in tab must offer both sign-in methods: Continue with Google and
 * email + password (SRS/updated_student_flow_25_8.jpg), with Google using the
 * redirect round-trip so it survives popup blockers on the deployed origin.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const holder = vi.hoisted(() => ({ entry: '/', user: null, profile: null }));

vi.mock('react-router-dom', async (orig) => {
  const actual = await orig();
  return { ...actual, BrowserRouter: ({ children }) => (
    <actual.MemoryRouter key={holder.entry} initialEntries={[holder.entry]}>{children}</actual.MemoryRouter>) };
});
vi.mock('../src/firebase', () => ({ auth: { currentUser: null }, db: {}, storage: {}, firebaseConfigError: null }));

vi.mock('firebase/auth', () => {
  class GoogleAuthProvider { setCustomParameters() { return this; } }
  return {
    GoogleAuthProvider, EmailAuthProvider: { credential: vi.fn() },
    createUserWithEmailAndPassword: vi.fn(), signInWithEmailAndPassword: vi.fn(),
    signOut: vi.fn().mockResolvedValue(), onAuthStateChanged: (a, cb) => { cb(holder.user); return () => {}; },
    updateProfile: vi.fn(), deleteUser: vi.fn(), signInWithPopup: vi.fn(),
    signInWithRedirect: vi.fn().mockResolvedValue(undefined),
    getRedirectResult: vi.fn().mockResolvedValue(null), getAdditionalUserInfo: vi.fn(),
    sendPasswordResetEmail: vi.fn().mockResolvedValue(), sendEmailVerification: vi.fn(),
    updatePassword: vi.fn(), reauthenticateWithCredential: vi.fn(),
  };
});
const fm = await import('firebase/auth');

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((db, ...p) => ({ path: p.join('/') })), setDoc: vi.fn().mockResolvedValue(),
  updateDoc: vi.fn(), collection: vi.fn(), query: vi.fn(), where: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }), increment: vi.fn(n => ({ inc: n })),
  runTransaction: vi.fn(), deleteDoc: vi.fn(), onSnapshot: vi.fn(() => () => {}),
  serverTimestamp: vi.fn(() => 'ts'),
  getDoc: vi.fn(async () => (holder.profile
    ? { exists: () => true, data: () => holder.profile } : { exists: () => false, data: () => undefined })),
}));

vi.mock('../src/pages/Dashboard', () => ({ default: () => <div>DASHBOARD</div> }));
vi.mock('../src/pages/ReviewPage', () => ({ default: () => <div>REVIEW</div> }));
vi.mock('../src/pages/LandingPage', () => ({ default: () => <div>LANDING</div> }));
vi.mock('../src/pages/SyllabusAdmin', () => ({ default: () => <div>ADMIN</div> }));
vi.mock('../src/pages/ExamPortal', () => ({ default: () => <div>EXAM</div> }));
vi.mock('../src/components/Layout', async () => {
  const { Outlet } = await import('react-router-dom');
  return { default: () => <div><Outlet /></div> };
});

const App = (await import('../src/App.jsx')).default;

function at(url) {
  holder.entry = url;
  render(<App />);
  return {
    inputs: () => Array.from(document.querySelectorAll('.auth-form input')),
    submit: () => document.querySelector('.auth-form button[type="submit"]'),
    fill: (vals) => vals.forEach((v, i) => {
      const el = document.querySelectorAll('.auth-form input')[i];
      if (el) fireEvent.change(el, { target: { value: v } });
    }),
  };
}

beforeEach(() => {
  cleanup(); holder.user = null; holder.profile = null;
  sessionStorage.clear(); localStorage.clear();
  Object.values(fm).forEach(f => f?.mockClear?.());
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });
});

describe('login tab: Google OR email+password', () => {
  it('shows BOTH sign-in options on the Log in tab', async () => {
    at('/signup?mode=login');
    const google = await screen.findByRole('button', { name: /Continue with Google/i });
    expect(google).toBeInTheDocument();
    // email + password fields and the Log in submit are still there
    expect(holder.entry).toBe('/signup?mode=login');
    await waitFor(() => {
      expect(document.querySelectorAll('.auth-form input').length).toBeGreaterThanOrEqual(2);
      expect(document.querySelector('.auth-form button[type="submit"]').textContent.trim()).toBe('Log in');
    });
    // and an "or" divider separates them
    expect(document.querySelector('.auth-divider')?.textContent).toMatch(/or/i);
  });

  it('Google on the Log in tab fires the redirect flow (not a popup)', async () => {
    at('/signup?mode=login');
    const btn = await screen.findByRole('button', { name: /Continue with Google/i });
    fireEvent.click(btn);
    // The pending flag is written synchronously, before handleGoogleSignIn awaits
    // the redirect — so read it here rather than later: the return-leg removes it,
    // and a leftover continuation from another test can too (that made a post-await
    // getItem() assertion flaky). jsdom's Storage is a Proxy, so spying on
    // sessionStorage.setItem does not intercept the call either.
    expect(sessionStorage.getItem('prepmaster_google_signup_pending')).toBe('1');

    await waitFor(() => expect(fm.signInWithRedirect).toHaveBeenCalled());
    expect(fm.signInWithPopup).not.toHaveBeenCalled();
  });

  it('email+password still logs in from the same tab', async () => {
    fm.signInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'u1', displayName: 'Raja' } });
    const { submit, fill } = at('/signup?mode=login');
    await waitFor(() => expect(submit()).toBeTruthy());
    fill(['RAJA@X.com', 'Passw0rd!23']);
    fireEvent.submit(document.querySelector('.auth-form'));
    await waitFor(() => expect(fm.signInWithEmailAndPassword).toHaveBeenCalled());
    expect(fm.signInWithEmailAndPassword.mock.calls[0][1].toLowerCase()).toBe('raja@x.com');
  });

  it('returning Google user lands in the app via the redirect return leg', async () => {
    const g = { uid: 'u1', email: 'raja@x.com', displayName: 'Raja', providerData: [{ providerId: 'google.com' }] };
    holder.user = g;
    holder.profile = { uid: 'u1', email: 'raja@x.com', role: 'student', fullName: 'Raja', studentId: 7 };
    sessionStorage.setItem('prepmaster_google_signup_pending', '1');
    fm.getRedirectResult.mockResolvedValue({ user: g });
    fm.getAdditionalUserInfo.mockReturnValue({ isNewUser: false });
    at('/signup?mode=login');
    await waitFor(() => expect(fm.getRedirectResult).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('DASHBOARD')).toBeInTheDocument(), { timeout: 9000 });
  });

  it('the signup method picker still offers exactly one Google button', async () => {
    at('/signup?mode=signup');
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Continue with Google/i }).length).toBe(1));
    expect(screen.getByRole('button', { name: /Continue with Email/i })).toBeInTheDocument();
  });
});
