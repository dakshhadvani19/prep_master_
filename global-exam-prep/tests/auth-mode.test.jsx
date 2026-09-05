/**
 * Reproduces the reported bug from progress.txt:
 *   "if user selected log in button from home page then select that option by
 *    default and if sign up then that on authentication page but that
 *    signupmode url is not working currently"
 *
 * These tests drive the REAL src/pages/Signup.jsx (only firebase + AuthContext
 * are mocked), asserting which tab the SegmentedControl reports as selected.
 */
import React, { useEffect } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';

// ─── Mock: src/firebase (auth/db/storage singletons) ─────────────────────────
vi.mock('../src/firebase', () => ({
  auth: { currentUser: null },
  db: {},
  storage: {},
}));

// ─── Mock: firebase/auth (Signup + AuthContext import these) ────────────────
vi.mock('firebase/auth', () => {
  class GoogleAuthProvider {
    setCustomParameters() { return this; }
  }
  return {
    GoogleAuthProvider,
    createUserWithEmailAndPassword: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(),
    onAuthStateChanged: vi.fn((a, cb) => { cb(null); return () => {}; }),
    updateProfile: vi.fn(),
    signInWithPopup: vi.fn(),
    signInWithRedirect: vi.fn(),
    getRedirectResult: vi.fn().mockResolvedValue(null),
    getAdditionalUserInfo: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
  };
});

// ─── Mock: firebase/firestore ───────────────────────────────────────────────
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  setDoc: vi.fn().mockResolvedValue(undefined),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => null }),
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ empty: true }),
  increment: vi.fn(),
  runTransaction: vi.fn(),
}));

// ─── Mock: AuthContext so Signup renders without a live Firebase project ────
const authState = { current: {} };
vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => authState.current,
  AuthProvider: ({ children }) => children,
}));

import Signup from '../src/pages/Signup.jsx';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/signup" element={<Signup />} />
      </Routes>
    </MemoryRouter>
  );
}

function selectedTab() {
  const tabs = screen.getAllByRole('tab');
  const active = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
  return active ? active.textContent.trim() : null;
}

beforeEach(() => {
  cleanup();
  authState.current = {
    currentUser: null,
    studentData: null,
    authLoading: false,
    isAdmin: false,
    isSuperAdmin: false,
    login: vi.fn(),
    signupWithEmail: vi.fn(),
    requestSignup: vi.fn().mockResolvedValue({ status: 'otp_sent' }),
    verifySignupOtp: vi.fn().mockResolvedValue({ status: 'signed_in' }),
    resendSignupOtp: vi.fn(),
    cancelSignupOtp: vi.fn(),
    resendSupabaseVerification: vi.fn(),
    recoveryMode: false,
    needsEmailVerification: false,
    clearRecoveryMode: vi.fn(),
    completePasswordRecovery: vi.fn(),
    completeGoogleProfile: vi.fn(),
    checkEmailExists: vi.fn().mockResolvedValue(false),
    sendPasswordReset: vi.fn(),
    startGoogleRedirect: vi.fn(),
    completeGoogleRedirect: vi.fn(),
    signInWithGoogle: vi.fn(),
    logout: vi.fn(),
  };
});

describe('?mode= URL param selects the default tab', () => {
  it('?mode=login opens the Log in tab', () => {
    renderAt('/signup?mode=login');
    expect(selectedTab()).toBe('Log in');
  });

  it('?mode=signup opens the Create account tab  <-- reported broken', () => {
    renderAt('/signup?mode=signup');
    expect(selectedTab()).toBe('Create account');
  });

  it('no mode param defaults to Create account', () => {
    renderAt('/signup');
    expect(selectedTab()).toBe('Create account');
  });

  it('?method=email skips the picker and shows the details form', () => {
    renderAt('/signup?mode=signup&method=email');
    // Picker buttons must be gone, details submit must be present.
    expect(screen.queryByRole('button', { name: /Continue with Email/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Continue →/i })).toBeInTheDocument();
  });

  it('signup tab without ?method shows the Google/Email method picker', () => {
    renderAt('/signup?mode=signup');
    expect(screen.getByRole('button', { name: /Continue with Email/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue with Google/i })).toBeInTheDocument();
  });

  it('unknown mode value falls back to signup instead of blanking the page', () => {
    renderAt('/signup?mode=garbage');
    expect(selectedTab()).toBe('Create account');
  });
});

describe('URL <-> tab synchronisation', () => {
  // MemoryRouter never writes window.location, so assert on the router
  // location via a probe rendered inside the same router context.
  function LocationProbe() {
    const loc = useLocation();
    return <span data-testid="probe">{loc.pathname + loc.search}</span>;
  }

  function renderWithNavigate(path) {
    let navigateRef = null;
    const setNavigate = (fn) => { navigateRef = fn; };
    function NavCatcher() {
      const fn = useNavigate();
      useEffect(() => { setNavigate(fn); }, [fn]);
      return null;
    }
    render(
      <MemoryRouter initialEntries={[path]}>
        <NavCatcher />
        <LocationProbe />
        <Routes><Route path="/signup" element={<Signup />} /></Routes>
      </MemoryRouter>
    );
    return { navigate: (to) => navigateRef(to) };
  }

  it('clicking a tab reflects the choice in the URL', async () => {
    const user = (await import('@testing-library/user-event')).default;
    renderWithNavigate('/signup?mode=login');
    expect(selectedTab()).toBe('Log in');

    await user.click(screen.getByRole('tab', { name: 'Create account' }));
    expect(selectedTab()).toBe('Create account');

    // The chosen tab must be written back to the URL so a refresh,
    // a browser-back, or a copyable link keeps the user's selection.
    expect(screen.getByTestId('probe').textContent).toContain('mode=signup');
  });

  it('in-app navigation from ?mode=login to ?mode=signup switches the tab', async () => {
    const { navigate } = renderWithNavigate('/signup?mode=login');
    expect(selectedTab()).toBe('Log in');

    await act(async () => { navigate('/signup?mode=signup'); });
    expect(selectedTab()).toBe('Create account');
  });

  it('in-app navigation from ?mode=signup to ?mode=login switches the tab', async () => {
    const { navigate } = renderWithNavigate('/signup?mode=signup');
    expect(selectedTab()).toBe('Create account');

    await act(async () => { navigate('/signup?mode=login'); });
    expect(selectedTab()).toBe('Log in');
  });
});
