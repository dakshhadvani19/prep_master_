/**
 * Phase 1 — admin authentication, end to end.
 *
 * Real AuthContext + real src/utils/supabaseAuth.js + the shared Supabase stub, so
 * every assertion is about what the app actually asks the database for. There is no
 * fake admin anywhere in this file: the only thing that makes a session staff is a
 * public.admins row whose auth_uid is the uid Supabase Auth just signed in.
 *
 * The ten behaviours this pins down:
 *   1 student + email/password          6 logout
 *   2 student + Google                  7 password recovery (student and admin)
 *   3 admin + email/password            8 no self-promotion from frontend state
 *   4 admin + Google                     9 role survives a refresh
 *   5 one listener, one read per uid   10 super admin vs standard admin
 * plus the two degraded paths that decide what happens when the lookup function is
 * not deployed, and the one rule that must never break: nothing writes public.admins.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';

vi.mock('../src/supabase', async () => (await import('./supabaseMock.js')).supabaseModuleMock());

const {
  state, client, resetSupabaseStub, callsTo, lastCall, studentRow, adminRow,
  authUser, makeSession, emit, setAuthCallback,
} = await import('./supabaseMock.js');

const { AuthProvider, useAuth } = await import('../src/context/AuthContext.jsx');
const { MemoryRouter } = await import('react-router-dom');

const PASSWORD = 'Str0ng!Passw0rd';
const NEW_PASSWORD = 'N3w!Str0ng#Pass';
const ctx = { current: null };

function Harness() {
  const value = useAuth();
  ctx.current = value;
  return (
    <div>
      <span data-testid="role">{value.role}</span>
      <span data-testid="uid">{value.currentUser?.uid ?? 'anon'}</span>
      <span data-testid="admin">{value.adminProfile ? JSON.stringify(value.adminProfile) : 'none'}</span>
      <span data-testid="authz">{value.authorizationError || 'clear'}</span>
    </div>
  );
}

/** Fire an auth event the way the real SDK does, inside act(). */
async function fire(event, session) {
  await act(async () => { emit(event, session); await Promise.resolve(); });
}

async function mount() {
  render(<MemoryRouter><AuthProvider><Harness /></AuthProvider></MemoryRouter>);
  await waitFor(() => expect(ctx.current).toBeTruthy(), { timeout: 5000 });
}

/** Email+password through Supabase Auth, then the session event the SDK emits. */
async function logInWithPassword(email) {
  await act(async () => { await ctx.current.login(email, PASSWORD); });
  await fire('SIGNED_IN', state.session);
}

/** The Google round trip: the return leg's one-time code, exchanged on boot. */
async function arriveFromGoogle(user) {
  if (user) state.session = makeSession(user);
  setAuthCallback({ kind: 'code', code: 'one-time-code', type: 'signin' });
  await mount();
  await waitFor(() => expect(ctx.current.authLoading).toBe(false), { timeout: 8000 });
}

const role = () => screen.getByTestId('role').textContent;

/** The uid the stub hands out for a fresh password/Google sign-in. */
const UID = 'u1';

beforeEach(() => {
  cleanup();
  resetSupabaseStub();
  ctx.current = null;
  sessionStorage.clear();
  localStorage.clear();
  client.auth.onAuthStateChange.mockClear();
});

describe('students are untouched by this phase', () => {
  it('1. email + password → Supabase Auth signs in, the lookup answers "not staff"', async () => {
    state.profile = studentRow({ auth_uid: UID });
    await mount();
    await logInWithPassword('raja@x.com');

    expect(lastCall('signInWithPassword').email).toBe('raja@x.com');
    expect(callsTo('update:admins')).toHaveLength(0);
    await waitFor(() => expect(role()).toBe('student'));
    expect(ctx.current.isAdmin).toBe(false);
    expect(ctx.current.isSuperAdmin).toBe(false);
    expect(ctx.current.adminProfile).toBeNull();
    expect(ctx.current.studentData.email).toBe('raja@x.com');

    // Authentication first, authorization after — and the answer came from the uid,
    // not from the address that was typed into the form.
    const names = state.calls.map((c) => c.name);
    expect(names.indexOf('signInWithPassword')).toBeLessThan(names.indexOf(`rpc:admin_role_for_uid`));
    expect(state.calls.some((c) => c.name === 'select:students' && c.filters.auth_uid === UID)).toBe(true);
  });

  it('2. Google → a student stays a student, and no staff row is created for them', async () => {
    state.profile = studentRow({ auth_uid: UID, email: 'raja@gmail.com' });
    await arriveFromGoogle(authUser({
      id: UID,
      email: 'raja@gmail.com',
      app_metadata: { provider: 'google' },
      identities: [{ provider: 'google', identity_id: 'g1' }],
    }));

    await waitFor(() => expect(ctx.current.currentUser).toBeTruthy());
    expect(role()).toBe('student');
    expect(ctx.current.studentData.provider).toBe('google');
    expect(callsTo('insert:admins')).toHaveLength(0);
    expect(callsTo('update:admins')).toHaveLength(0);
    // The exchange is the only credential step; no email was searched beforehand.
    expect(callsTo('exchangeCodeForSession').map((c) => c.code)).toEqual(['one-time-code']);
  });
});

describe('admins authenticate the same way and are resolved from public.admins', () => {
  it('3. email + password → admin, with no student profile required', async () => {
    state.profile = null;                        // staff accounts are not in students
    state.adminRow = adminRow({ auth_uid: UID, is_super_admin: false });
    await mount();
    await logInWithPassword('admin@x.com');

    await waitFor(() => expect(role()).toBe('admin'));
    expect(ctx.current.isAdmin).toBe(true);
    expect(ctx.current.isSuperAdmin).toBe(false);
    expect(ctx.current.hasRole('admin')).toBe(true);
    expect(ctx.current.hasRole('superAdmin')).toBe(false);
    // An admin must not be told their student profile is missing.
    expect(ctx.current.profileError).toBe('');
    expect(ctx.current.authorizationError).toBe('');
    expect(screen.getByTestId('authz').textContent).toBe('clear');
  });

  it('4. Google → admin, through the existing return leg and no extra linking step', async () => {
    state.profile = null;
    state.adminRow = adminRow({ auth_uid: UID, full_name: 'Daksh Patel', is_super_admin: false });
    await arriveFromGoogle();                    // the stub's default Google identity

    await waitFor(() => expect(role()).toBe('admin'));
    // The Google identity is already on this auth.users record: Supabase did the
    // linking, the app only read the result.
    expect(ctx.current.currentUser.providerData).toEqual([{ providerId: 'google', uid: 'g1' }]);
    expect(ctx.current.adminProfile).toMatchObject({ fullName: 'Daksh Patel', isSuperAdmin: false });
    // Google sign-in never provisions or edits staff membership: an admins row for a
    // brand-new account is the operator's decision, not the app's.
    expect(callsTo('insert:admins')).toHaveLength(0);
    expect(callsTo('update:admins')).toHaveLength(0);
    expect(state.calls.filter((c) => c.op === 'insert' || c.op === 'update')).toHaveLength(0);
  });
});

describe('session lifecycle', () => {
  it('9. the role is re-resolved from the session on a refresh, not restored from state', async () => {
    state.profile = null;
    state.adminRow = adminRow({ auth_uid: UID });
    state.session = makeSession(authUser({ id: UID, email: 'admin@x.com' }));
    await mount();
    await waitFor(() => expect(role()).toBe('admin'));
    expect(callsTo('rpc:admin_role_for_uid')).toHaveLength(1);

    // A refresh: a new provider tree, nothing carried over but the stored session.
    cleanup();
    ctx.current = null;
    await mount();
    await waitFor(() => expect(ctx.current.authLoading).toBe(false), { timeout: 8000 });
    expect(role()).toBe('admin');
    expect(callsTo('rpc:admin_role_for_uid')).toHaveLength(2);   // asked the DB again
    // and nothing was remembered client-side to shortcut that lookup
    expect(Object.keys(localStorage).filter((k) => /role|admin/i.test(k))).toEqual([]);
    expect(Object.keys(sessionStorage).filter((k) => /role|admin/i.test(k))).toEqual([]);
  });

  it('6. logout clears the session and the role with it', async () => {
    state.profile = null;
    state.adminRow = adminRow({ auth_uid: UID });
    await mount();
    await logInWithPassword('admin@x.com');
    await waitFor(() => expect(role()).toBe('admin'));

    await act(async () => { await ctx.current.logout(); });

    expect(callsTo('signOut')).toHaveLength(1);
    expect(state.session).toBeNull();
    expect(ctx.current.currentUser).toBeNull();
    expect(ctx.current.session).toBeNull();
    expect(ctx.current.role).toBe('student');
    expect(ctx.current.isAdmin).toBe(false);
    expect(ctx.current.adminProfile).toBeNull();
    expect(role()).toBe('student');
  });

  it('5. one listener, and one lookup per uid however many events arrive', async () => {
    state.profile = studentRow({ auth_uid: UID });
    state.adminRow = null;
    await mount();
    expect(client.auth.onAuthStateChange).toHaveBeenCalledTimes(1);

    await logInWithPassword('raja@x.com');
    await waitFor(() => expect(role()).toBe('student'));
    // The events the real SDK produces for one sign-in, replayed at the same uid:
    // no second read, so no answer can land out of order.
    await fire('SIGNED_IN', state.session);
    await fire('TOKEN_REFRESHED', state.session);
    await fire('INITIAL_SESSION', state.session);
    await act(async () => { await Promise.resolve(); });

    expect(client.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(callsTo('rpc:admin_role_for_uid')).toHaveLength(1);
    expect(ctx.current.authorizationError).toBe('');
  });
});

describe('password recovery is one flow for both kinds of account', () => {
  it('7. a student and an admin hit the identical reset calls, and the role returns', async () => {
    // — student —
    state.profile = studentRow({ auth_uid: UID });
    await mount();
    await logInWithPassword('raja@x.com');
    await waitFor(() => expect(role()).toBe('student'));

    await act(async () => { await ctx.current.sendPasswordReset('raja@x.com'); });
    const studentReset = lastCall('resetPasswordForEmail');
    expect(studentReset.email).toBe('raja@x.com');
    expect(studentReset.options.redirectTo).toMatch(/\/signup\?mode=login$/);

    await fire('PASSWORD_RECOVERY', state.session);
    expect(ctx.current.recoveryMode).toBe(true);
    await act(async () => { await ctx.current.completePasswordRecovery(NEW_PASSWORD); });
    expect(lastCall('updateUser').attrs.password).toBe(NEW_PASSWORD);
    expect(ctx.current.recoveryMode).toBe(false);
    expect(ctx.current.role).toBe('student');

    // — admin: same endpoint, same arguments, role intact afterwards —
    cleanup();
    ctx.current = null;
    state.profile = null;
    state.adminRow = adminRow({ auth_uid: UID });
    state.session = makeSession(authUser({ id: UID, email: 'admin@x.com' }));
    await mount();
    await waitFor(() => expect(role()).toBe('admin'));

    await act(async () => { await ctx.current.sendPasswordReset('admin@x.com'); });
    const adminReset = lastCall('resetPasswordForEmail');
    expect(adminReset.options.redirectTo).toBe(studentReset.options.redirectTo);
    expect(callsTo('resetPasswordForEmail')).toHaveLength(2);   // no separate admin path

    await fire('PASSWORD_RECOVERY', state.session);
    await act(async () => { await ctx.current.completePasswordRecovery(NEW_PASSWORD); });
    await waitFor(() => expect(role()).toBe('admin'));
    expect(ctx.current.isAdmin).toBe(true);
  });
});

describe('what cannot make somebody an admin', () => {
  it('8. frontend state, session metadata and public.students.role are all ignored', async () => {
    state.profile = studentRow({ auth_uid: UID, role: 'admin' });   // legacy column
    localStorage.setItem('role', 'superAdmin');
    localStorage.setItem('isAdmin', 'true');
    sessionStorage.setItem('prepmaster_admin', '1');
    state.session = makeSession(authUser({ id: UID, email: 'sneaky@x.com' }));
    state.session.user.app_metadata.role = 'superAdmin';
    state.session.user.user_metadata.role = 'superAdmin';
    await mount();
    await waitFor(() => expect(ctx.current.authLoading).toBe(false), { timeout: 8000 });

    expect(role()).toBe('student');
    expect(ctx.current.isAdmin).toBe(false);
    expect(ctx.current.hasRole('admin')).toBe(false);
    expect(ctx.current.adminProfile).toBeNull();
    // The app wrote nothing back to storage and nothing to the staff table.
    expect(localStorage.getItem('role')).toBe('superAdmin');   // untouched by the app
    expect(callsTo('insert:admins')).toHaveLength(0);
    expect(callsTo('update:admins')).toHaveLength(0);
  });

  it('a staff row keyed to a different uid never applies to this session', async () => {
    state.profile = studentRow({ auth_uid: UID });
    state.adminRow = adminRow({ auth_uid: 'other-uid', is_super_admin: true });
    await mount();
    await logInWithPassword('raja@x.com');

    await waitFor(() => expect(ctx.current.studentData).toBeTruthy());
    expect(role()).toBe('student');
    expect(ctx.current.isAdmin).toBe(false);
    // The lookup takes no argument, so the app cannot even ask about that other uid.
    expect(lastCall('rpc:admin_role_for_uid').args).toBeNull();
  });
});

describe('the lookup itself, and its degraded shapes', () => {
  it('10. is_super_admin decides the tier, including a boolean exported as text', async () => {
    state.profile = null;
    state.adminRow = adminRow({ auth_uid: UID, is_super_admin: false });
    state.session = makeSession(authUser({ id: UID, email: 'admin@x.com' }));
    await mount();
    await waitFor(() => expect(role()).toBe('admin'));
    expect(ctx.current.isSuperAdmin).toBe(false);

    state.adminRow = adminRow({ auth_uid: UID, is_super_admin: true });
    await act(async () => { await ctx.current.refreshStudentProfile(); });
    expect(role()).toBe('superAdmin');
    expect(ctx.current.isSuperAdmin).toBe(true);
    expect(ctx.current.hasRole('admin')).toBe(true);          // ranking still holds
    expect(ctx.current.hasRole('superAdmin')).toBe(true);

    // PostgREST returns a JSON boolean for a boolean column, which is what this path
    // models; the text/0-1 spellings are pinned in admin-authorization.test.js.
    state.adminRow = adminRow({ auth_uid: UID, is_super_admin: null });
    await act(async () => { await ctx.current.refreshStudentProfile(); });
    expect(role()).toBe('admin');                               // null is not "super"
    expect(ctx.current.hasRole('admin')).toBe(true);
    expect(ctx.current.hasRole('superAdmin')).toBe(false);
  });

  it('without the lookup function, a self-read policy on the caller\'s row is enough', async () => {
    state.profile = null;
    state.adminLookup = 'missing';
    state.adminsSelfRead = true;
    state.adminRow = adminRow({ auth_uid: UID });
    await mount();
    await logInWithPassword('admin@x.com');

    await waitFor(() => expect(role()).toBe('admin'));
    const read = lastCall('select:admins');
    expect(read.filters).toEqual({ auth_uid: UID });
    expect(read.cols).not.toMatch(/password/i);
    expect(ctx.current.authorizationError).toBe('');
  });

  it('when neither read answers, the session is a student and the reason is exposed', async () => {
    state.profile = null;
    state.adminLookup = 'error';
    state.adminRowError = { code: '42501', message: 'permission denied for function admin_role_for_uid' };
    await mount();
    await logInWithPassword('admin@x.com');

    await waitFor(() => expect(ctx.current.authLoading).toBe(false), { timeout: 8000 });
    expect(role()).toBe('student');
    expect(ctx.current.isAdmin).toBe(false);
    // Never a silent downgrade: the caller can say "could not verify".
    expect(screen.getByTestId('authz').textContent).toMatch(/could not be verified/i);
  });
});
