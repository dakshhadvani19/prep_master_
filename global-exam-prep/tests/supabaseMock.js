/**
 * supabaseMock.js — one shared stub of `src/supabase.js` for the auth tests.
 *
 * It records every call the app makes, in the shape the real client has
 * (chainable `from().select().eq().maybeSingle()`), while mirroring the current
 * SRS-named database tables:
 *   - `Students`
 *   - `Admins`
 *
 * Legacy fixture property names are normalized at the boundary only, so existing
 * tests that seed an old-shaped fixture remain valid during this database rename.
 */
import { vi } from 'vitest';

export const state = {
  session: null,
  profile: null,
  profileError: null,
  signUpResult: null,
  signUpError: null,
  verifyError: null,

  adminRow: null,
  adminLookup: 'rpc',
  adminRowError: null,
  adminsSelfRead: false,
  signInError: null,
  oauthError: null,
  updateUserError: null,
  resendError: null,
  emit: null,
  calls: [],

  authCallback: null,
  exchangeError: null,
  exchangeDelayMs: 0,
};

export function resetSupabaseStub() {
  state.session = null;
  state.profile = null;
  state.profileError = null;
  state.signUpResult = null;
  state.signUpError = null;
  state.verifyError = null;
  state.adminRow = null;
  state.adminLookup = 'rpc';
  state.adminRowError = null;
  state.adminsSelfRead = false;
  state.signInError = null;
  state.oauthError = null;
  state.updateUserError = null;
  state.resendError = null;
  state.emit = null;
  state.calls.length = 0;
  state.authCallback = null;
  state.exchangeError = null;
  state.exchangeDelayMs = 0;
}

export function setAuthCallback(callback) {
  state.authCallback = callback;
  return callback;
}

export const callsTo = (name) => state.calls.filter((c) => c.name === name);
export const lastCall = (name) => callsTo(name).at(-1);

function normalizeStudentFixture(overrides = {}) {
  const out = { ...overrides };
  if (out.StudentId === undefined && out.student_id !== undefined) out.StudentId = out.student_id;
  if (out.FullName === undefined && out.full_name !== undefined) out.FullName = out.full_name;
  if (out.Email === undefined && out.email !== undefined) out.Email = out.email;
  if (out.IsSpam === undefined && out.is_spam !== undefined) out.IsSpam = out.is_spam;
  delete out.student_id;
  delete out.full_name;
  delete out.email;
  delete out.is_spam;
  return out;
}

/** Mirrors the live public."Students" row shape. */
export function studentRow(overrides = {}) {
  return {
    StudentId: 1,
    auth_uid: 'u1',
    FullName: 'Raja Advani',
    Email: 'raja@x.com',
    IsSpam: false,
    role: 'student',
    created_at: '2026-01-01T00:00:00.000Z',
    ...normalizeStudentFixture(overrides),
  };
}

function normalizeAdminFixture(overrides = {}) {
  const out = { ...overrides };
  if (out.AdminId === undefined && out.admin_id !== undefined) out.AdminId = out.admin_id;
  if (out.FullName === undefined && out.full_name !== undefined) out.FullName = out.full_name;
  if (out.Email === undefined && out.email !== undefined) out.Email = out.email;
  if (out.isSuperAdmin === undefined && out.is_super_admin !== undefined) {
    out.isSuperAdmin = out.is_super_admin;
  }
  delete out.admin_id;
  delete out.full_name;
  delete out.email;
  delete out.is_super_admin;
  return out;
}

/** Mirrors the live public."Admins" row shape. */
export function adminRow(overrides = {}) {
  return {
    AdminId: 11,
    auth_uid: 'u1',
    FullName: 'Daksh Patel',
    Email: 'admin@x.com',
    isSuperAdmin: false,
    created_at: '2026-01-01T00:00:00.000Z',
    ...normalizeAdminFixture(overrides),
  };
}

export function setAdminRow(row) {
  state.adminRow = row ?? null;
  return state.adminRow;
}

export function authUser(overrides = {}) {
  return {
    id: 'u1',
    email: 'raja@x.com',
    app_metadata: { provider: 'email' },
    user_metadata: { full_name: 'Raja Advani' },
    identities: [{ provider: 'email', identity_id: 'u1' }],
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00.000Z',
    email_confirmed_at: '2026-01-01T00:00:00.000Z',
    last_sign_in_at: '2026-01-01T00:00:00.000Z',
    is_anonymous: false,
    ...overrides,
  };
}

export function makeSession(user) {
  return { user, access_token: 'fake-access-token', refresh_token: 'fake-refresh-token' };
}

export function emit(event, session) {
  state.session = session ?? null;
  return state.emit?.(event, session ?? null);
}

export const client = {
  auth: {
    onAuthStateChange: vi.fn((cb) => {
      state.emit = cb;
      cb('INITIAL_SESSION', state.session);
      return { data: { subscription: { unsubscribe: () => {} } } };
    }),
    getSession: vi.fn(async () => ({ data: { session: state.session } })),
    getUser: vi.fn(async () => ({ data: { user: state.session?.user ?? null } })),

    signUp: vi.fn(async (opts) => {
      state.calls.push({ name: 'signUp', ...opts });
      if (state.signUpError) return { data: null, error: state.signUpError };
      if (state.signUpResult) return state.signUpResult;

      const user = authUser({
        email: opts?.email,
        user_metadata: opts?.options?.data ?? {},
      });
      state.session = makeSession(user);
      return { data: { user, session: state.session }, error: null };
    }),

    verifyOtp: vi.fn(async (opts) => {
      state.calls.push({ name: 'verifyOtp', ...opts });
      if (state.verifyError) return { data: null, error: state.verifyError };
      const user = authUser({ email: opts?.email });
      state.session = makeSession(user);
      return { data: { user, session: state.session }, error: null };
    }),

    resend: vi.fn(async (opts) => {
      state.calls.push({ name: 'resend', ...opts });
      return { data: {}, error: state.resendError };
    }),

    signInWithPassword: vi.fn(async (opts) => {
      state.calls.push({ name: 'signInWithPassword', ...opts });
      if (state.signInError) return { data: null, error: state.signInError };
      const user = state.session?.user ?? authUser({ email: opts?.email });
      state.session = makeSession(user);
      return { data: { session: state.session, user }, error: null };
    }),

    signOut: vi.fn(async (opts) => {
      state.calls.push({ name: 'signOut', ...opts });
      state.session = null;
      return { error: null };
    }),

    resetPasswordForEmail: vi.fn(async (email, options) => {
      state.calls.push({ name: 'resetPasswordForEmail', email, options });
      return { error: null };
    }),

    updateUser: vi.fn(async (attrs) => {
      state.calls.push({ name: 'updateUser', attrs });
      return { data: { user: state.session?.user ?? authUser() }, error: state.updateUserError };
    }),

    exchangeCodeForSession: vi.fn(async (code) => {
      state.calls.push({ name: 'exchangeCodeForSession', code });
      if (state.exchangeDelayMs) await new Promise((r) => setTimeout(r, state.exchangeDelayMs));
      if (state.exchangeError) return { data: null, error: state.exchangeError };
      const user = state.session?.user ?? authUser({
        app_metadata: { provider: 'google' },
        identities: [{ provider: 'google', identity_id: 'g1' }],
      });
      state.session = makeSession(user);
      state.emit?.('SIGNED_IN', state.session);
      return { data: { session: state.session, user }, error: null };
    }),

    signInWithOAuth: vi.fn(async (opts) => {
      state.calls.push({ name: 'signInWithOAuth', ...opts });
      if (state.oauthError) return { data: null, error: state.oauthError };
      return { data: { provider: 'google', url: 'https://accounts.google.com/o/oauth2/auth?fake=1' }, error: null };
    }),
  },

  from: vi.fn((table) => makeBuilder(table)),

  rpc: vi.fn(async (fn, args) => {
    state.calls.push({ name: `rpc:${fn}`, op: 'rpc', fn, args: args ?? null });

    if (fn === 'manage_admin_staff') {
      const mine = ownAdminRow();
      if (!mine || mine.isSuperAdmin !== true) {
        return { data: null, error: { code: '42501', message: 'not_authorized' } };
      }
      return {
        data: {
          ok: true,
          action: args?.p_action || null,
          email: String(args?.p_email || '').toLowerCase(),
        },
        error: null,
      };
    }

    if (fn !== 'admin_role_for_uid' || state.adminLookup === 'missing') {
      return {
        data: null,
        error: {
          code: 'PGRST202',
          message: `Could not find the function public.${fn} within the schema cache`,
        },
      };
    }

    if (state.adminLookup === 'error') {
      return {
        data: null,
        error: state.adminRowError
          || { code: '42501', message: 'permission denied for function admin_role_for_uid' },
      };
    }

    if (state.adminRowError) return { data: null, error: state.adminRowError };

    const row = ownAdminRow();
    return {
      data: row ? {
        AdminId: row.AdminId,
        auth_uid: row.auth_uid,
        FullName: row.FullName,
        Email: row.Email,
        isSuperAdmin: row.isSuperAdmin === true,
      } : null,
      error: null,
    };
  }),
};

function ownAdminRow() {
  const uid = state.session?.user?.id ?? null;
  const row = state.adminRow;
  if (!row || uid === null) return null;
  return String(row.auth_uid) === String(uid) ? row : null;
}

function callName(op, table) {
  // Keep the established test call labels stable while the actual `table`
  // field records the SRS-named database object.
  if (table === 'Students') return `${op}:students`;
  if (table === 'Admins') return `${op}:admins`;
  return `${op}:${table}`;
}

export function makeBuilder(table) {
  const record = () => state.calls.push({
    name: callName(b._op, table),
    op: b._op,
    table,
    cols: b._cols,
    payload: b._payload,
    filters: { ...b._filters },
  });

  const b = {
    _table: table,
    _op: 'select',
    _cols: null,
    _payload: null,
    _filters: {},

    select: vi.fn((cols) => { b._cols = cols; return b; }),
    insert: vi.fn((payload) => { b._op = 'insert'; b._payload = payload; return b; }),
    update: vi.fn((payload) => { b._op = 'update'; b._payload = payload; return b; }),
    eq: vi.fn((k, v) => { b._filters[k] = v; return b; }),

    maybeSingle: vi.fn(async () => {
      record();

      if (b._op !== 'select') return { data: null, error: null };

      if (table === 'Admins') {
        return state.adminsSelfRead
          ? { data: ownAdminRow(), error: state.adminRowError ?? null }
          : { data: null, error: null };
      }

      if (state.profileError) return { data: null, error: state.profileError };
      return { data: state.profile ?? null, error: null };
    }),

    single: vi.fn(async () => {
      const written = { ...b._payload };
      record();

      if (b._op === 'select') {
        if (table === 'Admins') {
          return { data: state.adminsSelfRead ? ownAdminRow() : null, error: null };
        }
        return { data: state.profile ?? null, error: state.profileError ?? null };
      }

      return { data: { ...state.profile, ...written }, error: null };
    }),

    then: vi.fn((resolve, reject) => {
      const written = { ...b._payload };
      try {
        record();

        if (b._op === 'select') {
          resolve(table === 'Admins'
            ? { data: state.adminsSelfRead ? ownAdminRow() : null, error: null }
            : { data: state.profile ?? null, error: state.profileError ?? null });
        } else {
          resolve({
            data: b._op === 'update' ? { ...state.profile, ...written } : null,
            error: null,
          });
        }
      } catch (e) {
        reject(e);
      }
    }),
  };

  return b;
}

export function supabaseModuleMock() {
  return {
    supabase: client,
    default: client,
    supabaseConfigError: null,
    requireSupabase: () => client,
    consumeAuthCallback: () => {
      const value = state.authCallback;
      state.authCallback = null;
      return value;
    },
    peekAuthCallback: () => state.authCallback,
    hasPendingAuthCallback: () => Boolean(state.authCallback && state.authCallback.kind !== 'error'),
  };
}
