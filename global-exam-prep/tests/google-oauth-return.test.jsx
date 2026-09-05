/**
 * The Google return leg, end to end through the real App.
 *
 * This is the flow that broke in production and that two rounds of guessing could
 * not fix, because the failure was reported as a generic "did not complete". What
 * is asserted here is the contract that replaces it:
 *
 *   - a `?code=` arrival is exchanged exactly once, by one owner (AuthContext), and
 *     the exchange — not a race against `authLoading` — decides the UI;
 *   - a return leg never starts a second OAuth flow (a second `signInWithOAuth`
 *     rewrites the PKCE verifier and invalidates the code in flight, which is what
 *     "Unable to exchange external code" always meant);
 *   - every real reason arrives with its own sentence: bad verifier, expired flow
 *     state, cancelled consent;
 *   - nothing strands the spinner, and no stale tab flag can manufacture a
 *     "failure" for a round trip the user never started.
 *
 * `src/supabase.js` is stubbed at the client boundary, but the callback API it
 * exports is modelled exactly (one-shot consume), because that capture step is the
 * fix.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

vi.mock('../src/supabase', async () => (await import('./supabaseMock.js')).supabaseModuleMock());
vi.mock('../src/firebase', () => ({
  auth: { currentUser: null }, db: {}, storage: {}, firebaseConfigError: null,
}));

const holder = vi.hoisted(() => ({ entry: '/' }));
const {
  state, resetSupabaseStub, callsTo, lastCall, studentRow, setAuthCallback,
} = await import('./supabaseMock.js');

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

const text = () => document.body.textContent || '';

function at(url) {
  holder.entry = url;
  render(<App />);
  return {
    googleButton: () => screen.queryAllByRole('button', { name: /continue with google/i })[0],
    error: () => document.querySelector('.error-box'),
  };
}

beforeEach(() => {
  cleanup();
  resetSupabaseStub();
  holder.entry = '/';
  sessionStorage.clear();
  localStorage.clear();
  globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, text: async () => '{}' }));
  Object.defineProperty(window, 'location', {
    configurable: true, writable: true,
    value: { ...window.location, origin: 'https://prepmaster-tau.vercel.app', assign: vi.fn() },
  });
});

describe('a Google return leg that works', () => {
  it('exchanges the code once, signs the student in, and moves them onward', async () => {
    setAuthCallback({ kind: 'code', code: 'real-auth-code', state: 'uuid-state' });
    state.profile = studentRow({ auth_uid: 'u1', email: 'raja@gmail.com', full_name: 'Raja' });

    at('/signup?mode=signup');
    await waitFor(() => expect(screen.getByText('DASHBOARD')).toBeInTheDocument(), { timeout: 9000 });

    expect(callsTo('exchangeCodeForSession').map((c) => c.code)).toEqual(['real-auth-code']);
    // Nothing else consumed the code, and no second flow was started on the way in.
    expect(callsTo('signInWithOAuth')).toHaveLength(0);
    expect(callsTo('verifyOtp')).toHaveLength(0);
    // The profile comes from the trigger's row; the browser never writes it.
    expect(callsTo('insert:students')).toHaveLength(0);
    expect(lastCall('select:students').filters.auth_uid).toBe('u1');
    expect(text()).not.toMatch(/did not complete/i);
  });

  it('leaves no stale pending marker behind, so the next sign-in is not blocked', async () => {
    setAuthCallback({ kind: 'code', code: 'c2' });
    sessionStorage.setItem('prepmaster_google_signup_pending', '1');
    localStorage.setItem('prepmaster_oauth_attempt_v1', String(Date.now()));

    at('/signup?mode=signup');
    await waitFor(() => expect(screen.getByText('DASHBOARD')).toBeInTheDocument(), { timeout: 9000 });

    expect(sessionStorage.getItem('prepmaster_google_signup_pending')).toBeNull();
    expect(localStorage.getItem('prepmaster_oauth_attempt_v1')).toBeNull();
  });

  it('a recovery link lands in the password form instead of the dashboard', async () => {
    // The same one-time-code path serves password recovery now that the SDK's own
    // detectSessionInUrl is off — so this has to keep working.
    setAuthCallback({ kind: 'code', code: 'recovery-code', type: 'recovery' });
    state.profile = studentRow({ auth_uid: 'u1' });

    at('/signup?mode=login&method=email');
    await waitFor(() => expect(/choose a new password/i.test(text())).toBe(true), { timeout: 3000 });
    expect(callsTo('exchangeCodeForSession')).toHaveLength(1);
    expect(screen.queryByText('DASHBOARD')).toBeNull();
  });
});

describe('a Google return leg that fails says why', () => {
  const expectError = async (re) => {
    await waitFor(() => expect(re.test(text())).toBe(true), { timeout: 9000 });
  };

  it('a replaced PKCE verifier is named, not hidden behind "did not complete"', async () => {
    setAuthCallback({ kind: 'code', code: 'c3' });
    state.exchangeError = {
      code: 'bad_verifier',
      message: 'Unable to exchange external code: code verifier does not match',
    };

    at('/signup?mode=signup');
    await expectError(/no longer matches the request/i);

    expect(text()).not.toMatch(/Unable to exchange external code/);   // internals stay out
    expect(state.session).toBeNull();
    // The student is not stuck: the button is live for one clean retry.
    const btn = screen.getAllByRole('button', { name: /continue with google/i })[0];
    expect(btn).toBeTruthy();
    expect(btn).not.toBeDisabled();
    expect(document.querySelector('.mini-spin-dark')).toBeNull();
  });

  it('an expired flow state is reported as expired, with the fix', async () => {
    setAuthCallback({ kind: 'code', code: 'c4' });
    state.exchangeError = { code: 'flow_state_not_found', message: 'invalid flow state, no valid flow state found' };

    at('/signup?mode=signup');
    await expectError(/expired before it could be finished/i);
    expect(callsTo('signInWithOAuth')).toHaveLength(0);
  });

  it('a cancelled consent is called cancelled and creates nothing', async () => {
    setAuthCallback({ kind: 'error', errorCode: 'access_denied', errorDescription: 'User closed the window' });

    at('/signup?mode=signup');
    await expectError(/cancelled/i);

    expect(callsTo('exchangeCodeForSession')).toHaveLength(0);
    expect(callsTo('signUp')).toHaveLength(0);
    expect(state.session).toBeNull();
  });

  it('a provider rejection carries its own reason through to the card', async () => {
    setAuthCallback({
      kind: 'error', errorCode: 'server_error',
      errorDescription: 'Google returned an error while verifying the code',
    });

    at('/signup?mode=signup');
    await expectError(/google sign-in did not complete/i);
    // Not a silent retry loop: the message is on screen and no new flow started.
    expect(callsTo('signInWithOAuth')).toHaveLength(0);
  });
});

describe('a return leg is never mistaken for a fresh start', () => {
  it('the ?method=google trigger does not re-fire while a code is being exchanged', async () => {
    setAuthCallback({ kind: 'code', code: 'c5' });
    state.exchangeDelayMs = 250;                     // exchange is in flight
    state.profile = studentRow({ auth_uid: 'u1' });

    // `method=google` is the homepage CTA's auto-start trigger. Arriving back on the
    // page with a code plus that trigger must not launch a second OAuth round trip.
    at('/signup?mode=signup&method=google');

    await waitFor(() => expect(callsTo('exchangeCodeForSession')).toHaveLength(1));
    expect(callsTo('signInWithOAuth')).toHaveLength(0);
    await waitFor(() => expect(screen.getByText('DASHBOARD')).toBeInTheDocument(), { timeout: 9000 });
  });

  it('while an exchange is running, a second click cannot start another flow', async () => {
    setAuthCallback({ kind: 'code', code: 'c6' });
    state.exchangeDelayMs = 500;                      // slow enough to click into
    state.profile = studentRow({ auth_uid: 'u1' });

    const ui = at('/signup?mode=signup');
    await waitFor(() => expect(ui.googleButton()).toBeTruthy(), { timeout: 9000 });
    await waitFor(() => expect(callsTo('exchangeCodeForSession')).toHaveLength(1));

    // The control is inert for the duration: the button carries the in-flight state.
    fireEvent.click(ui.googleButton());
    fireEvent.click(ui.googleButton());
    await waitFor(() => expect(ui.googleButton().disabled || /finishing/i.test(text())).toBe(true));

    // Refused either way: a second flow would overwrite the verifier of the code that
    // is mid-exchange, which is the bug that produced "Unable to exchange external code".
    expect(window.location.assign).not.toHaveBeenCalled();
    expect(callsTo('signInWithOAuth')).toHaveLength(0);

    await waitFor(() => expect(screen.getByText('DASHBOARD')).toBeInTheDocument(), { timeout: 9000 });
    expect(callsTo('exchangeCodeForSession')).toHaveLength(1);
  });

  it('a stale tab flag alone does not invent a failure', async () => {
    // A visitor who simply lands here with an old marker (no code, no error) must see
    // the normal page — not a sign-in failure they never earned.
    sessionStorage.setItem('prepmaster_google_signup_pending', '1');

    at('/signup?mode=signup');
    await waitFor(() => expect(screen.getAllByRole('button', { name: /continue with google/i }).length).toBe(1));

    expect(text()).not.toMatch(/did not complete|cancelled|expired/i);
    expect(callsTo('exchangeCodeForSession')).toHaveLength(0);
    expect(callsTo('signInWithOAuth')).toHaveLength(0);
  });

  it('a departure marker with no callback explains itself and releases the UI', async () => {
    // This is the "we left, and came back with nothing" case: Google bounced the
    // request, or a second tab finished it. The page must say so once, usefully.
    localStorage.setItem('prepmaster_oauth_attempt_v1', String(Date.now()));
    sessionStorage.setItem('prepmaster_google_signup_pending', '1');

    at('/signup?mode=signup');
    await waitFor(() => expect(/without a sign-in code/i.test(text())).toBe(true), { timeout: 9000 });
    expect(document.querySelector('.mini-spin-dark')).toBeNull();
    // The marker is consumed, so a refresh shows the page, not the same message.
    expect(localStorage.getItem('prepmaster_oauth_attempt_v1')).toBeNull();
  });
});
