/**
 * Reproduction of the production hang, at the layer that caused it.
 *
 * Firestore's contract is that a write whose backend cannot be reached stays
 * PENDING FOREVER (the SDK queues it and retries). `createAndSendOTP` awaited that
 * write, then awaited a `fetch` with no timeout — so any deployment that cannot
 * reach Firestore (e.g. built without the VITE_FIREBASE_* values, where
 * src/firebase.js deliberately falls back to 'invalid-config') left "Create
 * Account" spinning with no error, no OTP and no way out.
 *
 * These tests use the REAL src/utils/otpService.js against a Firestore stub that
 * can be made to stall, and assert the caller is always released: with an error
 * message, without mailing a code, without burning a second request.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const store = vi.hoisted(() => ({
  docs: new Map(),
  hangWrite: false,
  hangRead: false,
  deletes: 0,
  fetchCalls: [],
}));

vi.mock('../src/firebase', () => ({
  auth: { currentUser: null }, storage: {}, db: {}, firebaseConfigError: null,
}));

vi.mock('firebase/firestore', () => ({
  doc: (db, coll, id) => ({ path: `${coll}/${id}` }),
  collection: (db, ...p) => ({ path: p.join('/') }),
  // Not an async function: when stalled it must return a promise that NEVER
  // settles, which is exactly the production behaviour being guarded against.
  setDoc: (ref, data) => (store.hangWrite
    ? new Promise(() => {})
    : Promise.resolve(store.docs.set(ref.path, { ...data }))),
  // A read that stalls is the other half of the same production failure mode.
  getDoc: (ref) => (store.hangRead
    ? new Promise(() => {})
    : Promise.resolve({ exists: () => store.docs.has(ref.path), data: () => store.docs.get(ref.path) })),
  updateDoc: (ref, patch) => {
    const cur = { ...store.docs.get(ref.path) };
    for (const [k, v] of Object.entries(patch || {})) {
      cur[k] = v && typeof v === 'object' && '__inc' in v ? (cur[k] || 0) + v.__inc : v;
    }
    store.docs.set(ref.path, cur);
    return Promise.resolve();
  },
  deleteDoc: (ref) => { store.deletes += 1; store.docs.delete(ref.path); return Promise.resolve(); },
  increment: (n) => ({ __inc: n }),
  getDocs: () => Promise.resolve({ empty: true, docs: [] }),
  query: vi.fn(), where: vi.fn(), runTransaction: vi.fn(),
  onSnapshot: vi.fn(() => () => {}), serverTimestamp: vi.fn(() => 'ts'),
}));

const { createAndSendOTP, verifyOTP } = await import('../src/utils/otpService.js');

const MAIL_OK = () => ({ ok: true, status: 200, json: async () => ({ sent: true }) });

beforeEach(() => {
  store.docs.clear();
  store.hangWrite = false;
  store.deletes = 0;
  store.fetchCalls.length = 0;
  sessionStorage.clear();
  globalThis.fetch = vi.fn(async (url, init) => {
    store.fetchCalls.push({ url: String(url), body: JSON.parse(init.body) });
    return MAIL_OK();
  });
});

afterEach(() => vi.useRealTimers());

describe('the OTP send can never hang the caller', () => {
  it('happy path still resolves promptly and mails only what it needs', async () => {
    const info = await createAndSendOTP('raja@x.com', 'Raja Advani');

    expect(info.resendAfter).toBe(60);
    expect(store.fetchCalls).toHaveLength(1);
    expect(Object.keys(store.fetchCalls[0].body).sort()).toEqual(['email', 'otp', 'userName']);
    expect(JSON.stringify(store.fetchCalls[0].body)).not.toMatch(/password/i);
  });

  it('a Firestore write that never settles ends in an error, not an endless spinner', async () => {
    vi.useFakeTimers();
    store.hangWrite = true;

    const pending = createAndSendOTP('slow@x.com', 'Raja');
    let settled = 'pending';
    pending.then(() => { settled = 'resolved'; }, (e) => { settled = e.message; });

    await vi.advanceTimersByTimeAsync(2000);
    expect(settled).toBe('pending');            // still waiting: bounded, not infinite
    await vi.advanceTimersByTimeAsync(8000);
    expect(settled).toMatch(/could not save the verification code/i);

    // and no code is mailed for a challenge that was never stored
    expect(store.fetchCalls).toHaveLength(0);
  });

  it('a stalled /api/send-otp is aborted and rolls the challenge back', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn((_url, init) => new Promise((_res, rej) => {
      // Behaves like a request the server never answers, honouring abort.
      init.signal.addEventListener('abort', () => rej(new Error('aborted')));
    }));

    const message = createAndSendOTP('stall@x.com', 'Raja').then(
        () => 'resolved', (e) => e.message);

    // runAll (not a fixed advance) so every pending timer AND the microtasks it
    // unblocks are drained before we look: an unsettled attempt here would leak a
    // live promise into the next test and pollute its fetch spy.
    await vi.runAllTimersAsync();

    expect(await message).toMatch(/taking too long|aborted/i);
    expect(store.deletes).toBe(1);                       // rollback ran, so retry is free
    expect(store.docs.size).toBe(0);
  });

  it('two submits for one address mail exactly one code', async () => {
    const [a, b] = await Promise.all([
      createAndSendOTP('dup@x.com', 'R'),
      createAndSendOTP('dup@x.com', 'R'),
    ]);

    expect(store.fetchCalls.map((c) => c.body.email)).toEqual(['dup@x.com']);
    expect(a).toEqual(b);                                // both get the same attempt
    // exactly one live challenge doc, not one per click
    expect(store.docs.size).toBe(1);
  });

  it('a build with no Firebase configuration fails loudly instead of hanging', async () => {
    vi.resetModules();
    vi.doMock('../src/firebase', () => ({
      auth: { currentUser: null }, storage: {}, db: {},
      firebaseConfigError: 'Firebase is not configured for this deployment.',
    }));
    vi.doMock('firebase/firestore', () => ({
      doc: () => ({ path: 'p' }),
      setDoc: () => new Promise(() => {}),                // would hang if reached
      getDoc: () => new Promise(() => {}),
      deleteDoc: () => new Promise(() => {}),
      updateDoc: () => new Promise(() => {}),
      increment: (n) => n, collection: () => ({}),
    }));
    const mod = await import('../src/utils/otpService.js');

    await expect(mod.createAndSendOTP('raja@x.com', 'Raja'))
      .rejects.toThrow(/Verification service is unavailable/i);
    expect(store.fetchCalls).toHaveLength(0);
    vi.doUnmock('../src/firebase');
    vi.doUnmock('firebase/firestore');
  });

  it('verification reads are bounded too, so the OTP screen cannot freeze', async () => {
    // A real send first, so the browser holds a nonce and verification proceeds to
    // the read — then the read stalls, exactly as it does when Firestore is dark.
    await createAndSendOTP('verify@x.com', 'Raja');
    store.hangRead = true;
    vi.useFakeTimers();

    const pending = verifyOTP('verify@x.com', '123456');
    let settled = 'pending';
    pending.then(() => { settled = 'resolved'; }, (e) => { settled = e.message; });

    await vi.advanceTimersByTimeAsync(9000);
    expect(settled).toMatch(/could not reach the verification service/i);
  });
});
