/**
 * supabaseMock.js — one shared stub of `src/supabase.js` for the auth tests.
 *
 * It records every call the app makes, in the shape the real client has
 * (chainable `from().select().eq().maybeSingle()`), so a test can assert both the
 * happy path and the security rules we care about:
 *   - signup sends only `full_name` as metadata (never role/is_spam/ids)
 *   - nothing ever inserts into public.students from the client
 *   - the profile is read back by `auth_uid`
 * Import it, then `vi.mock('../src/supabase', ...)` with `supabaseModuleMock()`.
 */
import { vi } from 'vitest';

export const state = {
  session: null,
  profile: null,          // the row public.students returns for the signed-in user
  profileError: null,
  signUpResult: null,
  signUpError: null,
  verifyError: null,
  signInError: null,
  oauthError: null,
  updateUserError: null,
  resendError: null,
  emit: null,             // the app's onAuthStateChange callback
  calls: [],

  // What the page load arrived with, in the shape src/supabase.js produces. Tests set
  // this instead of rewriting window.location, because in the real app the code is
  // read once at module load and then owned by AuthContext — no URL mutation after
  // that is even observable.
  authCallback: null,
  exchangeError: null,    // a { message, code } from GoTrue's /token?grant_type=pkce
  exchangeDelayMs: 0,     // to exercise the bounded wait without a real timeout
};

export function resetSupabaseStub() {
  state.session = null;
  state.profile = null;
  state.profileError = null;
  state.signUpResult = null;
  state.signUpError = null;
  state.verifyError = null;
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

/** Make the next page load arrive on an OAuth/recovery callback. */
export function setAuthCallback(callback) {
  state.authCallback = callback;
  return callback;
}

export const callsTo = (name) => state.calls.filter((c) => c.name === name);
export const lastCall = (name) => callsTo(name).at(-1);

/** Public Postgres rows are snake_case; this is what RLS hands back. */
export function studentRow(overrides = {}) {
  return {
    student_id: 1,
    auth_uid: 'u1',
    full_name: 'Raja Advani',
    email: 'raja@x.com',
    is_spam: false,
    role: 'student',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
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

/** Fire an auth event the way GoTrue's listener would. */
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
      // "Confirm email" OFF, which is what the custom-OTP architecture needs: the
      // Gmail code we verified first is the only gate, so GoTrue hands back a usable
      // session and never sends a second verification mail. Set state.signUpResult
      // to exercise the ON shape ({ user, session: null }).
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
      // GoTrue fires SIGNED_IN from inside the exchange; the app must not have to
      // poll for it.
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
};

/**
 * Chainable builder. `insert`/`update` are recorded so a test can fail the run if
 * application code ever tries to write protected student fields from the browser.
 */
export function makeBuilder(table) {
  const record = () => state.calls.push({
    name: `${b._op}:${table}`, op: b._op, table,
    cols: b._cols, payload: b._payload, filters: { ...b._filters },
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
      if (state.profileError) return { data: null, error: state.profileError };
      return { data: state.profile ?? null, error: null };
    }),
    single: vi.fn(async () => {
      const written = { ...b._payload };
      record();
      if (b._op === 'select') return { data: state.profile ?? null, error: state.profileError ?? null };
      return { data: { ...state.profile, ...written }, error: null };
    }),
    // PostgrestBuilder is awaitable: `await from().update().eq()` resolves to
    // { data, error }. Modelled so writes are recorded exactly like reads.
    then: vi.fn((resolve, reject) => {
      const written = { ...b._payload };
      try {
        record();
        if (b._op === 'select') resolve({ data: state.profile ?? null, error: state.profileError ?? null });
        else resolve({ data: b._op === 'update' ? { ...state.profile, ...written } : null, error: null });
      } catch (e) { reject(e); }
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
    // The capture API. `consume` is one-shot, exactly like the real module, so a
    // test can assert the code is exchanged once and never re-read on a remount.
    consumeAuthCallback: () => {
      const value = state.authCallback;
      state.authCallback = null;
      return value;
    },
    peekAuthCallback: () => state.authCallback,
    hasPendingAuthCallback: () => Boolean(state.authCallback && state.authCallback.kind !== 'error'),
  };
}
