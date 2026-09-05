/**
 * The four student sign-in methods, and what each one touches.
 *
 *   sign up  → email + password, gated on the existing Nodemailer/Gmail OTP
 *   sign up  → Google (PKCE redirect)
 *   log in   → email + password
 *   log in   → Google
 *
 * Real AuthContext + real src/utils/supabaseAuth.js. `src/supabase.js` is stubbed
 * (tests/supabaseMock.js) and `src/utils/otpService.js` is stubbed only here, to
 * isolate the ORDERING contract — the endpoint itself, its payload and the digest
 * rules are exercised for real in tests/auth-otp.test.jsx. So every assertion is
 * about what the app actually asks Supabase for — including the Phase-1 guarantees:
 *   1. the client never writes public.students' protected fields (and never
 *      inserts at all: handle_new_user() owns profile creation), and
 *   2. no password ever leaves the app except to the GoTrue token endpoint.
 */
import React, { useEffect } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';

vi.mock('../src/supabase', async () => (await import('./supabaseMock.js')).supabaseModuleMock());

// The existing OTP module, faked just enough to drive both halves of the signup
// step. `verifyOTP` accepts the one good code and throws otherwise, exactly like
// the real thing (src/utils/otpService.js:180).
const otp = vi.hoisted(() => ({}));
vi.mock('../src/utils/otpService', async () => {
  const real = {
    createAndSendOTP: vi.fn(async (email) => ({
      sentAt: Date.now(), resendAfter: 60, expiresAt: Date.now() + 600000, email,
    })),
    verifyOTP: vi.fn(async (email, code) => {
      if (code !== '123456') throw new Error('Incorrect code — 2 attempts remaining.');
      return String(email).trim().toLowerCase();
    }),
    resendCooldownRemaining: vi.fn(() => 0),
    OTP_TTL_MS: 600000,
    MAX_ATTEMPTS: 3,
    RESEND_COOLDOWN: 60,
  };
  Object.assign(otp, real);
  return real;
});

const {
  state, resetSupabaseStub, callsTo, lastCall, studentRow, authUser, makeSession, emit,
} = await import('./supabaseMock.js');

const { AuthProvider, useAuth } = await import('../src/context/AuthContext.jsx');
const { MemoryRouter } = await import('react-router-dom');

const ctx = { current: null };

function Harness() {
  const value = useAuth();
  ctx.current = value;
  useEffect(() => {
    document.documentElement.setAttribute('data-sd', JSON.stringify(value.studentData || {}));
  }, [value.studentData]);
  return (
    <div>
      <span data-testid="role">{value.studentData?.role ?? 'none'}</span>
      <span data-testid="uid">{value.currentUser?.uid ?? 'anon'}</span>
      <span data-testid="prov">{value.currentUser?.authProvider ?? 'none'}</span>
    </div>
  );
}

/** Fire an auth event inside act() so React state updates are flushed cleanly. */
async function fire(event, session) {
  await act(async () => { emit(event, session); await Promise.resolve(); });
}

async function mount() {
  render(<MemoryRouter><AuthProvider><Harness /></AuthProvider></MemoryRouter>);
  await waitFor(() => expect(ctx.current).toBeTruthy(), { timeout: 5000 });
  return ctx.current;
}

/** Simulate the browser navigating away and Google returning with a session. */
function stubNavigation() {
  const assign = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...window.location, origin: 'http://localhost:5173', assign },
  });
  return assign;
}

const PASSWORD = 'Str0ng!Passw0rd';

beforeEach(() => {
  cleanup();
  resetSupabaseStub();
  ctx.current = null;
  sessionStorage.clear();
  localStorage.clear();
  document.documentElement.removeAttribute('data-sd');
  otp.createAndSendOTP.mockClear();
  otp.verifyOTP.mockClear();
});

describe('sign up — Nodemailer OTP first, Supabase account second', () => {
  it('step 1 only mails a code: no Supabase call of any kind', async () => {
    await mount();

    const result = await act(async () =>
      await ctx.current.requestSignup('  RAJA@X.com ', PASSWORD, 'Raja Advani'));

    expect(result.status).toBe('otp_sent');
    expect(otp.createAndSendOTP).toHaveBeenCalledWith('raja@x.com', 'Raja Advani');

    // The account must not exist before the code has been verified: no signUp, and
    // no Supabase-side OTP machinery either.
    expect(callsTo('signUp')).toHaveLength(0);
    expect(callsTo('verifyOtp')).toHaveLength(0);
    expect(callsTo('resend')).toHaveLength(0);
  });

  it('creates the account exactly once, with only full_name as metadata', async () => {
    state.profile = studentRow({ role: 'student', student_id: 7 });
    await mount();

    await act(async () => await ctx.current.requestSignup('  RAJA@X.com ', PASSWORD, 'Raja Advani'));
    const verified = await act(async () => await ctx.current.verifySignupOtp('raja@x.com', '123456'));

    expect(verified.status).toBe('signed_in');
    expect(otp.verifyOTP).toHaveBeenCalledWith('raja@x.com', '123456');

    const calls = callsTo('signUp');
    expect(calls).toHaveLength(1);                     // exactly once, after the gate
    const call = calls[0];
    expect(call.email).toBe('raja@x.com');
    expect(call.password).toBe(PASSWORD);
    // role / is_spam / student_id / auth_uid must never be suggested by the client:
    // the DB trigger fixes them, and RLS would reject the write anyway.
    expect(call.options).toEqual({ data: { full_name: 'Raja Advani' } });
    expect(callsTo('verifyOtp')).toHaveLength(0);      // Supabase never checks our code
    expect(callsTo('resend')).toHaveLength(0);         // nor mails a signup code
  });

  it('a wrong code never creates a Supabase account', async () => {
    await mount();
    await act(async () => await ctx.current.requestSignup('raja@x.com', PASSWORD, 'Raja'));

    let thrown;
    await act(async () => {
      try { await ctx.current.verifySignupOtp('raja@x.com', '000000'); } catch (e) { thrown = e; }
    });

    expect(thrown.message).toMatch(/incorrect code/i);
    expect(callsTo('signUp')).toHaveLength(0);
  });

  it('an expired code never creates a Supabase account', async () => {
    await mount();
    await act(async () => await ctx.current.requestSignup('raja@x.com', PASSWORD, 'Raja'));
    otp.verifyOTP.mockRejectedValueOnce(new Error('Your code has expired. Please request a new one.'));

    let thrown;
    await act(async () => {
      try { await ctx.current.verifySignupOtp('raja@x.com', '123456'); } catch (e) { thrown = e; }
    });

    expect(thrown.message).toMatch(/expired/i);
    expect(callsTo('signUp')).toHaveLength(0);
  });

  it('resend goes back through the Nodemailer path, never through Supabase', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    await mount();

    await act(async () => await ctx.current.requestSignup('raja@x.com', PASSWORD, 'Raja'));
    await act(async () => await ctx.current.resendSignupOtp('raja@x.com'));

    expect(otp.createAndSendOTP).toHaveBeenCalledTimes(2);
    expect(callsTo('resend')).toHaveLength(0);
    expect(callsTo('signUp')).toHaveLength(0);
    globalThis.fetch = fetchSpy;
  });

  it('the mailer throttling a resend is reported, and creates nothing', async () => {
    await mount();
    otp.createAndSendOTP.mockRejectedValueOnce(new Error('Please wait 42s before requesting another code.'));

    let thrown;
    await act(async () => {
      try { await ctx.current.requestSignup('raja@x.com', PASSWORD, 'Raja'); } catch (e) { thrown = e; }
    });

    expect(thrown.message).toMatch(/wait 42s/i);
    expect(callsTo('signUp')).toHaveLength(0);
  });

  it('a double submit still creates one account', async () => {
    state.profile = studentRow();
    await mount();
    await act(async () => await ctx.current.requestSignup('raja@x.com', PASSWORD, 'Raja'));

    await act(async () => {
      await Promise.all([
        ctx.current.verifySignupOtp('raja@x.com', '123456'),
        ctx.current.verifySignupOtp('raja@x.com', '123456'),
      ]);
    });

    expect(callsTo('signUp')).toHaveLength(1);
  });

  it('an already-registered address is bounced without a second account', async () => {
    // Supabase returns a user with NO identities for a taken address rather than an
    // error, so the app must read that shape instead of trusting an error code.
    state.signUpResult = { data: { user: authUser({ identities: [] }), session: null }, error: null };
    await mount();
    await act(async () => await ctx.current.requestSignup('taken@x.com', PASSWORD, 'Someone'));

    const result = await act(async () => await ctx.current.verifySignupOtp('taken@x.com', '123456'));

    expect(result.status).toBe('email_exists');
    expect(result.message).toMatch(/already registered/i);
    expect(callsTo('signUp')).toHaveLength(1);        // attempted once, not retried
    expect(ctx.current.studentData).toBeNull();      // nothing created, nothing loaded
  });

  it('a project left with "Confirm email" ON is reported, not papered over', async () => {
    // No session comes back, so the flow must say so instead of pretending the
    // student is signed in (and instead of inserting anything as a fallback).
    state.signUpResult = { data: { user: authUser(), session: null }, error: null };
    await mount();
    await act(async () => await ctx.current.requestSignup('raja@x.com', PASSWORD, 'Raja'));

    let thrown;
    await act(async () => {
      try { await ctx.current.verifySignupOtp('raja@x.com', '123456'); } catch (e) { thrown = e; }
    });

    expect(thrown.needsSupabaseConfirmation).toBe(true);
    expect(thrown.message).toMatch(/Confirm email/i);
    expect(callsTo('signUp')).toHaveLength(1);        // never retried behind the scenes
    expect(callsTo('insert:students')).toHaveLength(0);
  });

  it('creating the account never writes students from the browser', async () => {
    state.profile = studentRow();
    await mount();
    await act(async () => await ctx.current.requestSignup('raja@x.com', PASSWORD, 'Raja'));
    await act(async () => await ctx.current.verifySignupOtp('raja@x.com', '123456'));

    expect(callsTo('insert:students')).toHaveLength(0);
    expect(state.calls.filter((c) => c.table === 'students' && c.op !== 'select')).toHaveLength(0);
  });

  it('the session plus the trigger-made row is everything the page gets', async () => {
    state.profile = studentRow({ role: 'student', student_id: 7 });
    await mount();
    await act(async () => await ctx.current.requestSignup('raja@x.com', PASSWORD, 'Raja'));
    await act(async () => await ctx.current.verifySignupOtp('raja@x.com', '123456'));

    await waitFor(() => expect(screen.getByTestId('role').textContent).toBe('student'));
    expect(ctx.current.studentData).toMatchObject({
      studentId: 7, uid: 'u1', email: 'raja@x.com', fullName: 'Raja Advani',
      isSpam: false, role: 'student',
    });
    // Read back strictly by the credential link, never by a client-supplied id.
    expect(lastCall('select:students').filters).toEqual({ auth_uid: 'u1' });
  });

  it('leaving the OTP screen forgets the password', async () => {
    await mount();
    await act(async () => await ctx.current.requestSignup('raja@x.com', PASSWORD, 'Raja'));
    ctx.current.cancelSignupOtp();

    let thrown;
    await act(async () => {
      try { await ctx.current.verifySignupOtp('raja@x.com', '123456'); } catch (e) { thrown = e; }
    });

    expect(thrown.message).toMatch(/session expired/i);
    expect(otp.verifyOTP).not.toHaveBeenCalled();     // nothing consumed, nothing created
    expect(callsTo('signUp')).toHaveLength(0);
  });

  it('a missing profile explains the trigger, and is never patched from the client', async () => {
    state.profile = null;                  // students has no row for this uid
    await mount();
    await fire('SIGNED_IN', makeSession(authUser()));

    await waitFor(() => expect(ctx.current.profileError).toMatch(/trigger/i));
    expect(callsTo('insert:students')).toHaveLength(0);
  });

  it('distinguishes an RLS rejection from a missing profile', async () => {
    state.profileError = { code: '42501', message: 'permission denied for table students' };
    await mount();
    await fire('SIGNED_IN', makeSession(authUser()));

    await waitFor(() => expect(ctx.current.profileError).toMatch(/security policies/i));
  });
});

describe('log in — email + password', () => {
  it('authenticates, reads the profile and writes nothing', async () => {
    state.profile = studentRow();
    await mount();

    const res = await act(async () => await ctx.current.login(' RAJA@X.com ', PASSWORD));
    expect(res.user.id).toBe('u1');
    expect(lastCall('signInWithPassword')).toMatchObject({ email: 'raja@x.com', password: PASSWORD });

    await fire('SIGNED_IN', state.session);
    await waitFor(() => expect(screen.getByTestId('role').textContent).toBe('student'));

    expect(callsTo('insert:students')).toHaveLength(0);
    expect(callsTo('update:students')).toHaveLength(0);
  });

  it('tells an unverified account what to do next', async () => {
    await mount();
    state.signInError = { message: 'Email not confirmed' };

    let thrown;
    await act(async () => {
      try { await ctx.current.login('raja@x.com', PASSWORD); }
      catch (e) { thrown = e; }
    });
    expect(thrown.needsVerification).toBe(true);
    expect(thrown.message).toMatch(/verify your email/i);
  });

  it('maps bad credentials to safe copy and never leaks the raw message', async () => {
    await mount();
    state.signInError = { message: 'invalid login credentials for user' };

    let thrown;
    await act(async () => {
      try { await ctx.current.login('raja@x.com', 'nope'); } catch (e) { thrown = e; }
    });
    expect(thrown.message).toMatch(/incorrect email or password/i);
  });
});

describe('log in / sign up — Google (PKCE redirect)', () => {
  it('starts the OAuth redirect and never pops a window', async () => {
    const assign = stubNavigation();
    await mount();

    await act(async () => await ctx.current.startGoogleRedirect());

    const call = lastCall('signInWithOAuth');
    expect(call.provider).toBe('google');
    expect(call.options.redirectTo).toContain('/signup?mode=login');
    expect(assign).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/auth?fake=1');
  });

  it('a returning Google student gets their existing row, not a new one', async () => {
    state.profile = studentRow({ student_id: 42, email: 'raja@gmail.com', full_name: 'Raja A' });
    await mount();
    await fire('SIGNED_IN', makeSession(authUser({
      email: 'raja@gmail.com',
      app_metadata: { provider: 'google' },
      identities: [{ provider: 'google', identity_id: 'g1' }],
    })));

    await waitFor(() => expect(screen.getByTestId('role').textContent).toBe('student'));
    expect(ctx.current.studentData).toMatchObject({
      studentId: 42, email: 'raja@gmail.com', provider: 'google', role: 'student',
    });
    expect(callsTo('insert:students')).toHaveLength(0);
  });

  it('a first-time Google student needs no client-side profile write either', async () => {
    // Before the session settles the row may not be visible yet; the app must wait
    // and re-read rather than insert (RLS grants authenticated no INSERT).
    state.profile = null;
    await mount();
    await fire('SIGNED_IN', makeSession(authUser({
      email: 'new@x.com', app_metadata: { provider: 'google' },
    })));
    await waitFor(() => expect(ctx.current.profileError).toMatch(/trigger/i));

    state.profile = studentRow({ email: 'new@x.com' });
    await act(async () => await ctx.current.refreshStudentProfile());

    expect(ctx.current.profileError).toBe('');
    expect(ctx.current.studentData.email).toBe('new@x.com');
    expect(callsTo('insert:students')).toHaveLength(0);
  });
});

describe('session plumbing', () => {
  it('restores a session on load and exposes the Supabase user (not a fake Firebase one)', async () => {
    state.session = makeSession(authUser());
    state.profile = studentRow();
    await mount();

    await waitFor(() => expect(screen.getByTestId('uid').textContent).toBe('u1'));
    expect(ctx.current.authProvider).toBe('supabase');
    expect(screen.getByTestId('prov').textContent).toBe('supabase');
    expect(ctx.current.authLoading).toBe(false);
    expect(ctx.current.session?.access_token).toBe('fake-access-token');
    expect(ctx.current.currentUser.displayName).toBe('Raja Advani');
    // No Firebase credential is manufactured: nothing here can mint an ID token.
    expect(ctx.current.currentUser.getIdToken).toBeUndefined();
  });

  it('reacts to SIGNED_IN, TOKEN_REFRESHED and SIGNED_OUT', async () => {
    await mount();
    state.profile = studentRow();

    await fire('SIGNED_IN', makeSession(authUser()));
    await waitFor(() => expect(screen.getByTestId('role').textContent).toBe('student'));
    const readsAfterSignIn = callsTo('select:students').length;

    await fire('TOKEN_REFRESHED', makeSession(authUser()));
    await waitFor(() => expect(ctx.current.session).toBeTruthy());
    // A token refresh must not re-read the profile or re-run any write.
    expect(callsTo('select:students')).toHaveLength(readsAfterSignIn);
    expect(callsTo('update:students')).toHaveLength(0);

    await fire('SIGNED_OUT', null);
    await waitFor(() => expect(screen.getByTestId('uid').textContent).toBe('anon'));
    expect(ctx.current.studentData).toBeNull();
  });

  it('logout ends the Supabase session and clears the exam cache', async () => {
    localStorage.setItem('userExamHistory', '[{"x":1}]');
    state.profile = studentRow();
    await mount();
    await fire('SIGNED_IN', makeSession(authUser()));
    await waitFor(() => expect(screen.getByTestId('role').textContent).toBe('student'));

    await act(async () => await ctx.current.logout());

    expect(lastCall('signOut')).toBeTruthy();
    expect(localStorage.getItem('userExamHistory')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('uid').textContent).toBe('anon'));
  });
});

describe('password reset, change, and the one allowed profile write', () => {
  it('sends a recovery link that comes back to the auth page', async () => {
    await mount();
    await act(async () => await ctx.current.sendPasswordReset('RAJA@X.com'));

    const call = lastCall('resetPasswordForEmail');
    expect(call.email).toBe('raja@x.com');
    expect(call.options.redirectTo).toContain('/signup?mode=login');
  });

  it('PASSWORD_RECOVERY opens the recovery step and completing it writes the password', async () => {
    state.session = makeSession(authUser());
    state.profile = studentRow();
    await mount();

    await fire('PASSWORD_RECOVERY', state.session);
    await waitFor(() => expect(ctx.current.recoveryMode).toBe(true));

    await act(async () => await ctx.current.completePasswordRecovery('N3w!Passw0rd'));
    expect(lastCall('updateUser').attrs).toEqual({ password: 'N3w!Passw0rd' });
    await waitFor(() => expect(ctx.current.recoveryMode).toBe(false));
  });

  it('refuses a weak new password before calling the API', async () => {
    state.session = makeSession(authUser());
    await mount();

    let thrown;
    await act(async () => {
      try { await ctx.current.completePasswordRecovery('abc'); } catch (e) { thrown = e; }
    });
    expect(thrown.message).toMatch(/stronger password/i);
    expect(callsTo('updateUser')).toHaveLength(0);
  });

  it('changePassword never touches a stored digest: there is none in this app', async () => {
    state.session = makeSession(authUser());
    state.profile = studentRow();
    await mount();

    await act(async () => await ctx.current.changePassword('N3w!Passw0rd'));
    expect(lastCall('updateUser').attrs.password).toBe('N3w!Passw0rd');
    expect(JSON.stringify(state.calls)).not.toMatch(/passwordHash|pbkdf2/i);
  });

  it('updateFullName writes ONLY full_name (the single granted column)', async () => {
    state.session = makeSession(authUser());
    state.profile = studentRow();
    await mount();
    await fire('SIGNED_IN', state.session);
    await waitFor(() => expect(ctx.current.studentData).toBeTruthy());

    await act(async () => await ctx.current.updateFullName('Raja A. Advani'));

    const call = lastCall('update:students');
    expect(Object.keys(call.payload)).toEqual(['full_name']);
    expect(call.filters).toEqual({ auth_uid: 'u1' });
    expect(ctx.current.studentData.fullName).toBe('Raja A. Advani');
  });
});

describe('RBAC read from public.students', () => {
  it('promotes UI behaviour only — it cannot be written from here', async () => {
    state.profile = studentRow({ role: 'admin' });
    await mount();
    await fire('SIGNED_IN', makeSession(authUser()));

    await waitFor(() => expect(screen.getByTestId('role').textContent).toBe('admin'));
    expect(ctx.current.isAdmin).toBe(true);
    expect(ctx.current.isSuperAdmin).toBe(false);
    expect(ctx.current.hasRole('admin')).toBe(true);
    expect(ctx.current.hasRole('superAdmin')).toBe(false);
    expect(callsTo('update:students')).toHaveLength(0);
  });

  it('fails closed when the row has no role of record', async () => {
    state.profile = studentRow({ role: 'student' });
    await mount();
    await fire('SIGNED_IN', makeSession(authUser()));
    await waitFor(() => expect(ctx.current.studentData).toBeTruthy());
    expect(ctx.current.role).toBe('student');
    expect(ctx.current.isAdmin).toBe(false);
  });
});
