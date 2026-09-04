/**
 * The four sign-in methods, and what each one persists.
 *
 *   sign up  → Google (redirect round-trip)
 *   sign up  → email + password, gated on the emailed OTP
 *   log in   → Google
 *   log in   → email + password
 *
 * Real AuthContext + real hashUtil (PBKDF2 + the meta/counters transaction).
 * Only the Firebase SDK surface is stubbed, and it is stubbed with a *capturing*
 * Firestore so every write to `students` can be asserted field by field.
 * SRS/ER_Diagram_last_updated_25_8.jpg gives Students {StudentId, FullName,
 * Email, Password, IsSpam}; those five plus the auth fields are checked here.
 */
import React, { useEffect } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import { webcrypto } from 'node:crypto';

// jsdom ships no SubtleCrypto; PBKDF2 and the OTP digest both need it.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

const writes = vi.hoisted(() => ({
  setDoc: [], updateDoc: [], deleteDoc: [],
  tx: { set: [], update: [] },
  counters: null,          // null => meta/counters does not exist yet
}));
const state = vi.hoisted(() => ({ profile: null }));
const latest = vi.hoisted(() => ({ ctx: null, emit: null }));

vi.mock('../src/firebase', () => ({
  auth: { currentUser: null }, db: {}, storage: {}, firebaseConfigError: null,
}));

vi.mock('firebase/auth', () => {
  class GoogleAuthProvider { setCustomParameters() { return this; } }
  return {
    GoogleAuthProvider,
    EmailAuthProvider: { credential: vi.fn(() => ({ providerId: 'password' })) },
    createUserWithEmailAndPassword: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
    onAuthStateChanged: (a, cb) => { latest.emit = cb; cb(null); return () => {}; },
    updateProfile: vi.fn().mockResolvedValue(undefined),
    deleteUser: vi.fn().mockResolvedValue(undefined),
    signInWithPopup: vi.fn(),
    signInWithRedirect: vi.fn().mockResolvedValue(undefined),
    getRedirectResult: vi.fn().mockResolvedValue(null),
    getAdditionalUserInfo: vi.fn(() => ({ isNewUser: true })),
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
    sendEmailVerification: vi.fn().mockResolvedValue(undefined),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    reauthenticateWithCredential: vi.fn().mockResolvedValue(undefined),
  };
});
const authMock = await import('firebase/auth');

vi.mock('firebase/firestore', () => {
  const ref = (parts) => ({ path: parts.filter(p => typeof p === 'string').join('/') });
  return {
    doc: vi.fn((db, ...p) => ref(p)),
    collection: vi.fn((db, ...p) => ref(p)),
    query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(),
    getDocs: vi.fn(async () => ({ empty: true, docs: [], forEach() {} })),
    getDoc: vi.fn(async (r) => ({
      id: r.path.split('/').pop(),
      exists: () => !!state.profile,
      data: () => state.profile,
    })),
    setDoc: vi.fn(async (r, data) => { writes.setDoc.push({ path: r.path, data }); }),
    updateDoc: vi.fn(async (r, data) => { writes.updateDoc.push({ path: r.path, data }); }),
    deleteDoc: vi.fn(async (r) => { writes.deleteDoc.push(r.path); }),
    increment: vi.fn(n => ({ __increment: n })),
    serverTimestamp: vi.fn(() => 'server-ts'),
    Timestamp: { now: () => ({ toDate: () => new Date() }) },
    onSnapshot: vi.fn(() => () => {}),
    runTransaction: vi.fn(async (dbOrTx, fn) => fn({
      get: async (r) => ({
        exists: () => !!writes.counters,
        data: () => writes.counters,
        ref: r,
      }),
      set: async (r, data) => { writes.tx.set.push({ path: r.path, data }); },
      update: async (r, data) => { writes.tx.update.push({ path: r.path, data }); },
    })),
  };
});

const { AuthProvider, useAuth } = await import('../src/context/AuthContext.jsx');
const { MemoryRouter } = await import('react-router-dom');

function Harness() {
  const ctx = useAuth();
  latest.ctx = ctx;
  useEffect(() => {
    document.documentElement.setAttribute('data-sd', JSON.stringify(ctx.studentData || {}));
  }, [ctx.studentData]);
  return <div data-testid="role">{ctx.studentData?.role ?? 'none'}</div>;
}

// AuthProvider renders nothing until its onAuthStateChanged observer resolves,
// so the context only appears after a tick. The generous timeout matters: the
// PBKDF2 tests run 210k real rounds each and can starve the default 1s budget.
async function mount() {
  render(<MemoryRouter><AuthProvider><Harness /></AuthProvider></MemoryRouter>);
  await waitFor(() => expect(latest.ctx).toBeTruthy(), { timeout: 5000 });
  return latest.ctx;
}

const emailUser = {
  uid: 'u1', email: 'RAJA@x.com', displayName: 'Raja Advani', photoURL: null,
  providerData: [{ providerId: 'password' }],
};
const googleUser = {
  uid: 'u2', email: 'raja@gmail.com', displayName: 'Raja A',
  photoURL: 'https://lh3.googleusercontent.com/a/x',
  providerData: [{ providerId: 'google.com' }],
};

/** Simulate Firebase resolving the session for `user`, then let effects run. */
async function session(user) {
  await act(async () => { await latest.emit(user); });
}

beforeEach(() => {
  cleanup();
  writes.setDoc.length = 0; writes.updateDoc.length = 0; writes.deleteDoc.length = 0;
  writes.tx.set.length = 0; writes.tx.update.length = 0;
  writes.counters = null; state.profile = null; latest.ctx = null; latest.emit = null;
  sessionStorage.clear(); localStorage.clear();
  document.documentElement.removeAttribute('data-sd');
  Object.values(authMock).forEach(f => f?.mockClear?.());
});

describe('sign up — email + password', () => {
  it('persists a complete ER-shaped students doc and allocates studentId from meta/counters', async () => {
    authMock.createUserWithEmailAndPassword.mockResolvedValue({ user: emailUser });
    await mount();

    await act(async () => {
      await latest.ctx.signupWithEmail('  RAJA@X.com ', 'Str0ng!Passw0rd', 'Raja Advani');
    });

    expect(authMock.createUserWithEmailAndPassword).toHaveBeenCalledWith(
      expect.anything(), 'raja@x.com', 'Str0ng!Passw0rd',
    );

    const write = writes.setDoc.find(w => w.path === 'students/u1');
    expect(write).toBeTruthy();
    const d = write.data;

    // the five ER attributes for Students, plus the auth metadata
    expect(d).toMatchObject({
      studentId: 1,                 // first allocation, counters doc did not exist
      uid: 'u1',
      fullName: 'Raja Advani',
      email: 'raja@x.com',          // lowercased: it is the identity anchor in the rules
      isSpam: false,
      role: 'student',
      provider: 'email',
      providers: ['email'],
      photoURL: null,
    });
    expect(typeof d.createdAt).toBe('string');
    expect(() => new Date(d.createdAt).toISOString()).not.toThrow();

    // the auto-increment counter is created with both fields so neither is ever null
    expect(writes.tx.set).toEqual([
      { path: 'meta/counters', data: { studentCount: 1, adminCount: 0 } },
    ]);
  });

  it('stores a salted PBKDF2 envelope — never the password, never an email-derived digest', async () => {
    authMock.createUserWithEmailAndPassword.mockResolvedValue({ user: emailUser });
    await mount();

    const pw = 'Str0ng!Passw0rd';
    await act(async () => { await latest.ctx.signupWithEmail('raja@x.com', pw, 'Raja'); });

    const d = writes.setDoc.find(w => w.path === 'students/u1').data;
    expect(d.passwordHash).toMatch(/^pbkdf2\$210000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(JSON.stringify(d)).not.toContain(pw);

    // v1 was sha256(password + ":" + email) — predictable salt, offline-brute-forceable
    const { createHash } = await import('node:crypto');
    const legacy = createHash('sha256').update(`${pw}:raja@x.com`).digest('hex');
    expect(d.passwordHash).not.toContain(legacy);
  });

  it('surfaces the rules-not-deployed case as an actionable message, not a raw error', async () => {
    authMock.createUserWithEmailAndPassword.mockResolvedValue({ user: emailUser });
    const { setDoc } = await import('firebase/firestore');
    setDoc.mockRejectedValueOnce(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    await mount();

    // Assert *inside* act(): rejecting through act() leaves its queue unresolved
    // and starves the next test's effects (this showed up as a phantom failure
    // in the following test, not here).
    let thrown;
    await act(async () => {
      try { await latest.ctx.signupWithEmail('raja@x.com', 'Str0ng!Passw0rd', 'Raja'); }
      catch (e) { thrown = e; }
    });
    expect(thrown?.message).toMatch(/rules are blocking it[\s\S]*Deploy firestore\.rules/);
  });
});

describe('sign up — Google', () => {
  it('persists the profile with provider google and no password digest', async () => {
    await mount();

    await act(async () => {
      await latest.ctx.completeGoogleProfile(googleUser, googleUser.displayName);
    });

    const d = writes.setDoc.find(w => w.path === 'students/u2').data;
    expect(d).toMatchObject({
      uid: 'u2', email: 'raja@gmail.com', fullName: 'Raja A',
      provider: 'google', providers: ['google'], role: 'student',
      isSpam: false, studentId: 1,
      photoURL: 'https://lh3.googleusercontent.com/a/x',
    });
    expect(d.passwordHash).toBeNull();      // no password exists for a Google account
    expect(writes.tx.set.length).toBe(1);    // studentId still allocated
  });

  it('is idempotent: an existing profile is reused, with no second studentId', async () => {
    state.profile = { uid: 'u2', email: 'raja@gmail.com', role: 'student', fullName: 'Raja A', studentId: 42 };
    await mount();

    await act(async () => { await latest.ctx.completeGoogleProfile(googleUser, 'Raja A'); });

    expect(writes.setDoc).toHaveLength(0);
    expect(writes.tx.set).toHaveLength(0);
    expect(writes.tx.update).toHaveLength(0);
    await waitFor(() => expect(screen.getByTestId('role').textContent).toBe('student'));
  });
});

describe('log in', () => {
  it('email + password authenticates, loads the profile and writes nothing', async () => {
    authMock.signInWithEmailAndPassword.mockResolvedValue({ user: emailUser });
    state.profile = { uid: 'u1', email: 'raja@x.com', role: 'student', fullName: 'Raja Advani', studentId: 1 };
    await mount();

    const res = await act(async () => await latest.ctx.login(' RAJA@X.com ', 'Str0ng!Passw0rd'));
    expect(res.user.uid).toBe('u1');

    await session(emailUser);
    await waitFor(() => expect(screen.getByTestId('role').textContent).toBe('student'));

    expect(authMock.signInWithEmailAndPassword)
      .toHaveBeenCalledWith(expect.anything(), 'raja@x.com', 'Str0ng!Passw0rd');
    expect(writes.setDoc).toHaveLength(0);          // login never rewrites the profile
    expect(writes.tx.set).toHaveLength(0);          // and never burns another studentId
    expect(writes.tx.update).toHaveLength(0);
  });

  it('Google uses the redirect round-trip, not a popup (what the Log in tab button starts)', async () => {
    await mount();
    await act(async () => { await latest.ctx.startGoogleRedirect?.(); });
    expect(authMock.signInWithRedirect).toHaveBeenCalled();
    expect(authMock.signInWithPopup).not.toHaveBeenCalled();
  });

  it('rebuilds a missing profile on the next session instead of locking the student out', async () => {
    state.profile = null;                             // students/{uid} absent
    authMock.signInWithEmailAndPassword.mockResolvedValue({ user: googleUser });
    await mount();

    await act(async () => { await latest.ctx.login('raja@gmail.com', 'pw'); });
    await session(googleUser);

    await waitFor(() => expect(writes.setDoc.length).toBe(1));
    const d = writes.setDoc[0].data;
    expect(d.uid).toBe('u2');
    expect(d.provider).toBe('google');                 // derived from providerData
    expect(d.passwordHash).toBeNull();
    expect(d.role).toBe('student');
  });
});

describe('logout', () => {
  it('ends the Firebase session and clears the in-memory profile', async () => {
    authMock.signInWithEmailAndPassword.mockResolvedValue({ user: emailUser });
    state.profile = { uid: 'u1', email: 'raja@x.com', role: 'student', fullName: 'Raja' };
    await mount();
    await act(async () => { await latest.ctx.login('raja@x.com', 'pw'); });
    await session(emailUser);
    await waitFor(() => expect(screen.getByTestId('role').textContent).toBe('student'));

    await act(async () => { await latest.ctx.logout(); });
    expect(authMock.signOut).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('role').textContent).toBe('none'));
  });
});
