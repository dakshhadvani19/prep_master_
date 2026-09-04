/**
 * Email sign-up is gated on the OTP that is *emailed* to the student.
 * Two guarantees matter in production:
 *   1. no Auth account exists until the code is verified (a failed email
 *      send must not leave an orphan account behind), and
 *   2. the code is mailed through /api/send-otp, whose Gmail credentials live
 *      only in Vercel — so a missing secret has to fail loudly on the form,
 *      not silently half-create an account.
 * Real Signup.jsx + real otpService; only the HTTP call and Firebase are stubbed.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

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
    signOut: vi.fn().mockResolvedValue(undefined),
    onAuthStateChanged: (a, cb) => { cb(holder.user); return () => {}; },
    updateProfile: vi.fn(), deleteUser: vi.fn(), signInWithPopup: vi.fn(),
    signInWithRedirect: vi.fn().mockResolvedValue(undefined),
    getRedirectResult: vi.fn().mockResolvedValue(null), getAdditionalUserInfo: vi.fn(),
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined), sendEmailVerification: vi.fn(),
    updatePassword: vi.fn(), reauthenticateWithCredential: vi.fn(),
  };
});
const authMock = await import('firebase/auth');

// Captures the challenge document otpService writes, so the flow's Firestore
// contract is asserted too (digest stored, plaintext never persisted).
const captured = vi.hoisted(() => ({ otpDocs: [] }));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((db, ...p) => ({ path: p.filter(x => typeof x === 'string').join('/') })),
  collection: vi.fn((db, ...p) => ({ path: p.join('/') })),
  setDoc: vi.fn(async (r, data) => { if (r.path.startsWith('otp_tokens')) captured.otpDocs.push({ path: r.path, data }); }),
  updateDoc: vi.fn(), deleteDoc: vi.fn(async () => {}), getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  query: vi.fn(), where: vi.fn(), increment: vi.fn(n => ({ __increment: n })), runTransaction: vi.fn(),
  onSnapshot: vi.fn(() => () => {}), serverTimestamp: vi.fn(() => 'ts'),
  getDoc: vi.fn(async () => (holder.profile
    ? { exists: () => true, data: () => holder.profile }
    : { exists: () => false, data: () => undefined })),
}));
const fsMock = await import('firebase/firestore');

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

async function openEmailForm() {
  holder.entry = '/signup?mode=signup&method=email';
  render(<App />);
  await waitFor(() => expect(document.querySelector('.auth-form')).toBeTruthy());
  return {
    form: () => document.querySelector('.auth-form'),
    submit: () => document.querySelector('.auth-form button[type="submit"]'),
    fill: (vals) => vals.forEach((v, i) => {
      const el = document.querySelectorAll('.auth-form input')[i];
      if (el) fireEvent.change(el, { target: { value: v } });
    }),
  };
}

beforeEach(() => {
  cleanup();
  holder.user = null; holder.profile = null; captured.otpDocs.length = 0;
  sessionStorage.clear(); localStorage.clear();
  Object.values(authMock).forEach(f => f?.mockClear?.());
  Object.values(fsMock).forEach(f => f?.mockClear?.());
});

describe('emailed OTP gate', () => {
  it('requests a code through /api/send-otp before any account exists', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });
    const { fill } = await openEmailForm();

    fill(['Raja Advani', 'raja@x.com', 'Str0ng!Passw0rd']);
    fireEvent.submit(document.querySelector('.auth-form'));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(globalThis.fetch.mock.calls[0][0]).toBe('/api/send-otp');
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.email).toBe('raja@x.com');
    expect(String(body.otp)).toMatch(/^\d{6}$/);            // the code that gets mailed
    expect(body.userName).toBe('Raja Advani');   // the field send-otp.js reads

    await waitFor(() => expect(/check your email/i.test(document.body.textContent)).toBe(true));
    expect(authMock.createUserWithEmailAndPassword).not.toHaveBeenCalled();   // gated
  }, 20000);

  it('persists only a SHA-256 digest of the code, keyed by email + nonce', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });
    const { fill } = await openEmailForm();
    fill(['Raja Advani', 'raja@x.com', 'Str0ng!Passw0rd']);
    fireEvent.submit(document.querySelector('.auth-form'));

    await waitFor(() => expect(captured.otpDocs.length).toBe(1));
    const { path, data } = captured.otpDocs[0];
    expect(path.startsWith('otp_tokens/')).toBe(true);
    expect(data.otpHash).toMatch(/^[0-9a-f]{64}$/);
    expect(data.email).toBe('raja@x.com');
    expect(data.attempts).toBe(0);
    const { createHash } = await import('node:crypto');
    const sent = JSON.parse(globalThis.fetch.mock.calls[0][1].body).otp;
    expect(data.otpHash).toBe(createHash('sha256').update(String(sent)).digest('hex'));
    expect(JSON.stringify(data)).not.toContain(String(sent));   // plaintext never stored
    expect(new Date(data.expiresAt).getTime() > Date.now()).toBe(true);
  }, 20000);

  it('a Gmail misconfiguration on Vercel blocks sign-up instead of half-creating an account', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 500,
      json: async () => ({ error: 'Email service not configured (GMAIL_USER or GMAIL_APP_PASSWORD missing).' }),
    });
    const { submit, fill } = await openEmailForm();
    fill(['Raja Advani', 'blocked@x.com', 'Str0ng!Passw0rd']);
    fireEvent.submit(document.querySelector('.auth-form'));

    await waitFor(() => expect(/email service not configured/i.test(document.body.textContent)).toBe(true));
    expect(authMock.createUserWithEmailAndPassword).not.toHaveBeenCalled();
    expect(submit()).toBeTruthy();                 // still on the form, retryable
    expect(submit().disabled).toBe(false);
  }, 20000);
});
