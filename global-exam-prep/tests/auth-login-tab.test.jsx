/**
 * The Log in tab must offer both sign-in methods: Continue with Google and
 * email + password (SRS/updated_student_flow_25_8.jpg), with Google using the
 * Supabase PKCE redirect round-trip — a popup cannot survive the deployed origin's
 * popup blocker, and Supabase has no popup API at all.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

vi.mock('../src/supabase', async () => (await import('./supabaseMock.js')).supabaseModuleMock());
vi.mock('../src/firebase', () => ({
  auth: { currentUser: null }, db: {}, storage: {}, firebaseConfigError: null,
}));

const {
  state, resetSupabaseStub, lastCall, callsTo, studentRow,
  setAuthCallback,
} = await import('./supabaseMock.js');

const holder = { entry: '/' };

vi.mock('react-router-dom', async (orig) => {
  const actual = await orig();
  return { ...actual, BrowserRouter: ({ children }) => (
    <actual.MemoryRouter key={holder.entry} initialEntries={[holder.entry]}>{children}</actual.MemoryRouter>) };
});

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
  cleanup();
  resetSupabaseStub();
  holder.entry = '/';
  sessionStorage.clear();
  localStorage.clear();
  // Supabase hands the browser a URL to leave for; jsdom cannot navigate.
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...window.location, origin: 'http://localhost:5173', assign: vi.fn() },
  });
});

describe('login tab: Google OR email+password', () => {
  it('shows BOTH sign-in options on the Log in tab', async () => {
    at('/signup?mode=login');
    const google = await screen.findByRole('button', { name: /Continue with Google/i });
    expect(google).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelectorAll('.auth-form input').length).toBeGreaterThanOrEqual(2);
      expect(document.querySelector('.auth-form button[type="submit"]').textContent.trim()).toBe('Log in');
    });
    // and an "or" divider separates them
    expect(document.querySelector('.auth-divider')?.textContent).toMatch(/or/i);
  });

  it('Google on the Log in tab starts the Supabase OAuth redirect (not a popup)', async () => {
    at('/signup?mode=login');
    const btn = await screen.findByRole('button', { name: /Continue with Google/i });
    fireEvent.click(btn);

    // The pending flag is written synchronously, before the redirect starts: the
    // return leg clears it, and it is what keeps the success overlay from being
    // skipped while the code is being exchanged.
    expect(sessionStorage.getItem('prepmaster_google_signup_pending')).toBe('1');

    await waitFor(() => expect(lastCall('signInWithOAuth')).toBeTruthy());
    expect(lastCall('signInWithOAuth').provider).toBe('google');
    expect(lastCall('signInWithOAuth').options.redirectTo).toBe('http://localhost:5173/signup?mode=login');
    expect(window.location.assign).toHaveBeenCalledWith(expect.stringContaining('accounts.google.com'));
  });

  it('email+password logs in through Supabase from the same tab', async () => {
    const { submit, fill } = at('/signup?mode=login');
    await waitFor(() => expect(submit()).toBeTruthy());
    fill(['RAJA@X.com', 'Passw0rd!23']);
    fireEvent.submit(document.querySelector('.auth-form'));

    await waitFor(() => expect(lastCall('signInWithPassword')).toBeTruthy());
    expect(lastCall('signInWithPassword').email).toBe('raja@x.com');
    expect(callsTo('signUp')).toHaveLength(0);
  });

  it('a student whose address is not confirmed is offered a new code, not a dead end', async () => {
    state.signInError = { message: 'Email not confirmed' };
    const { submit, fill } = at('/signup?mode=login');
    await waitFor(() => expect(submit()).toBeTruthy());
    fill(['raja@x.com', 'Passw0rd!23']);
    fireEvent.submit(document.querySelector('.auth-form'));

    await waitFor(() => expect(/not verified yet/i.test(document.body.textContent)).toBe(true));
    const resend = await screen.findByRole('button', { name: /resend verification code/i });

    state.signInError = null;
    fireEvent.click(resend);
    await waitFor(() => expect(lastCall('resend')).toMatchObject({ type: 'signup', email: 'raja@x.com' }));
  });

  it('a returning Google student lands in the app via the redirect return leg', async () => {
    // The return leg is a one-time code in the URL; src/supabase.js captures it and
    // AuthContext exchanges it. Nothing here pre-sets a session: the session is what
    // the exchange must produce, which is the whole behaviour under test.
    setAuthCallback({ kind: 'code', code: 'auth-code-1', state: 's1' });
    state.profile = studentRow({ auth_uid: 'u1', email: 'raja@x.com', full_name: 'Raja', student_id: 7 });
    sessionStorage.setItem('prepmaster_google_signup_pending', '1');

    at('/signup?mode=login');
    await waitFor(() => expect(screen.getByText('DASHBOARD')).toBeInTheDocument(), { timeout: 9000 });

    // Exchanged once, with the code from the URL, and NOT re-authorised on the way.
    expect(callsTo('exchangeCodeForSession').map((c) => c.code)).toEqual(['auth-code-1']);
    expect(callsTo('signInWithOAuth')).toHaveLength(0);
    // The profile came from the existing row, not from a client-side write.
    expect(state.session.user.id).toBe('u1');
    expect(callsTo('insert:students')).toHaveLength(0);

    // The flag must not outlive the return leg, or the next sign-in stalls on it.
    expect(sessionStorage.getItem('prepmaster_google_signup_pending')).toBeNull();
  });

  it('a cancelled Google consent reports itself instead of looping back silently', async () => {
    setAuthCallback({
      kind: 'error', errorCode: 'access_denied', errorDescription: 'User closed the window',
    });
    sessionStorage.setItem('prepmaster_google_signup_pending', '1');

    at('/signup?mode=login');
    await waitFor(() => expect(/cancelled/i.test(document.body.textContent)).toBe(true));
    expect(sessionStorage.getItem('prepmaster_google_signup_pending')).toBeNull();
    // A cancelled consent must not be "resolved" by silently starting another flow.
    expect(callsTo('signInWithOAuth')).toHaveLength(0);
    expect(callsTo('exchangeCodeForSession')).toHaveLength(0);
  });

  it('the signup method picker still offers exactly one Google button', async () => {
    at('/signup?mode=signup');
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Continue with Google/i }).length).toBe(1));
    expect(screen.getByRole('button', { name: /Continue with Email/i })).toBeInTheDocument();
  });
});
