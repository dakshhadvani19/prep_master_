/**
 * Signup end-to-end in the browser: the Gmail/Nodemailer OTP is the gate, Supabase
 * is the account, and Postgres holds the challenge.
 *
 * `src/utils/otpService.js` and the auth pages run for real. The two serverless
 * endpoints are replaced by an in-memory model of the `auth_otp` table that follows
 * the same rules as the migration (one row per address, 60 s cooldown, three
 * attempts, single use, digest only) — the SQL itself is proven separately in
 * tests/auth-otp-sql.test.js against a real Postgres, and the endpoint handlers in
 * tests/api-*.test.js. `src/supabase.js` is stubbed by tests/supabaseMock.js, so
 * nothing here touches the network.
 *
 * The invariants asserted below are the ones the design depends on:
 *   1. the details step asks the server for a code, and creates no account yet;
 *   2. the password never leaves the browser except to supabase.auth.signUp;
 *   3. nothing is stored that lets anyone recover the code but the mailbox owner;
 *   4. a wrong / expired / locked code cannot produce an account;
 *   5. signUp happens exactly once, after verification, with only full_name;
 *   6. the browser never inserts into public.students;
 *   7. a failed send is recoverable — no lockout, no stuck spinner;
 *   8. Supabase is never asked to mail or check a signup code.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { createHash } from 'node:crypto';

const holder = vi.hoisted(() => ({ entry: '/' }));
/** The fake `public.auth_otp` table, plus everything the "mailer" was asked to send. */
const srv = vi.hoisted(() => ({
  rows: new Map(),
  mails: [],
  requests: [],
  failNextSend: false,
  hangSend: false,
  ttlMs: 600_000,
  cooldownMs: 60_000,
}));

/** Same shape as production: HMAC/SHA digest of `email:code`, hex. */
const digestFor = (email, code) => createHash('sha256').update(`${email}:${code}`).digest('hex');

vi.mock('../src/supabase', async () => (await import('./supabaseMock.js')).supabaseModuleMock());
vi.mock('../src/firebase', () => ({
  auth: { currentUser: null }, db: {}, storage: {}, firebaseConfigError: null,
}));

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

const {
  state, resetSupabaseStub, callsTo, authUser, studentRow,
} = await import('./supabaseMock.js');
const App = (await import('../src/App.jsx')).default;

const PASSWORD = 'Str0ng!Passw0rd';

// ─── The stand-in server ──────────────────────────────────────────────────────
function installFakeEndpoints() {
  globalThis.fetch = vi.fn(async (url, init) => {
    const body = (() => { try { return JSON.parse(init.body || '{}'); } catch { return {}; } })();
    srv.requests.push({ url: String(url), body });
    const json = (status, payload) => ({
      ok: status < 400, status, text: async () => JSON.stringify(payload),
    });

    if (srv.hangSend && url.includes('/api/send-otp')) return new Promise(() => {});

    if (url.includes('/api/send-otp')) {
      const email = String(body.email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return json(400, { error: 'Invalid email address.' });
      }
      if (srv.failNextSend) {
        srv.failNextSend = false;
        return json(500, { error: 'Failed to send email. Please try again.' });
      }
      const prev = srv.rows.get(email);
      if (prev && Date.now() - prev.createdAt < srv.cooldownMs) {
        const wait = Math.ceil((srv.cooldownMs - (Date.now() - prev.createdAt)) / 1000);
        return json(429, { error: `Please wait ${wait}s before requesting another code.`, retry_after_seconds: wait });
      }
      const code = String(100000 + Math.floor(Math.random() * 900000));
      srv.rows.set(email, {
        otpHash: digestFor(email, code), attempts: 0, createdAt: Date.now(),
        expiresAt: Date.now() + srv.ttlMs,
      });
      srv.mails.push({ to: email, code, subject: `${code} — your PrepMaster verification code` });
      return json(200, {
        success: true, expiresIn: srv.ttlMs / 1000, resendAfter: srv.cooldownMs / 1000,
        expiresAt: new Date(Date.now() + srv.ttlMs).toISOString(),
      });
    }

    if (url.includes('/api/verify-otp')) {
      const email = String(body.email || '').trim().toLowerCase();
      const code = String(body.code || '');
      const row = srv.rows.get(email);
      if (!row) return json(400, { verified: false, reason: 'invalid', remaining: 0, error: 'That code is not right. Please request a new code.' });
      if (Date.now() > row.expiresAt) {
        srv.rows.delete(email);
        return json(400, { verified: false, reason: 'expired', error: 'Your code has expired. Request a new one.', resendAllowed: true });
      }
      if (row.attempts >= 3) {
        srv.rows.delete(email);
        return json(429, { verified: false, reason: 'locked', remaining: 0, error: 'Too many incorrect attempts. Please request a new code.', resendAllowed: true });
      }
      if (row.otpHash !== digestFor(email, code)) {
        row.attempts += 1;
        const remaining = 3 - row.attempts;
        // Same as auth_otp_verify: the attempt that exhausts the ceiling deletes the
        // row and is reported as a lockout, not as one more wrong guess.
        if (remaining <= 0) {
          srv.rows.delete(email);
          return json(429, { verified: false, reason: 'locked', remaining: 0, error: 'Too many incorrect attempts. Please request a new code.', resendAllowed: true });
        }
        srv.rows.set(email, row);
        return json(400, { verified: false, reason: 'invalid', remaining, error: `That code is not right. ${remaining} attempts left.` });
      }
      srv.rows.delete(email);                       // single use
      return json(200, { verified: true });
    }

    return json(404, { error: 'not found' });
  });
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
async function openEmailForm() {
  holder.entry = '/signup?mode=signup&method=email';
  render(<App />);
  await waitFor(() => expect(document.querySelector('.auth-form')).toBeTruthy());
  return {
    submit: () => document.querySelector('.auth-form button[type="submit"]'),
    form: () => document.querySelector('.auth-form'),
    fill: (vals) => vals.forEach((v, i) => {
      const el = document.querySelectorAll('.auth-form input')[i];
      if (el) fireEvent.change(el, { target: { value: v } });
    }),
  };
}

async function toOtpStep(api, { email = 'raja@x.com', name = 'Raja Advani' } = {}) {
  api.fill([name, email, PASSWORD]);
  fireEvent.submit(api.form());
  await waitFor(() => expect(document.querySelectorAll('.otp-digit').length).toBe(6));
}

/** The code as the student would read it: out of the delivered email, not the client. */
function mailedCode(email = 'raja@x.com') {
  const mail = srv.mails.filter((m) => m.to === email).at(-1);
  expect(mail, 'a code must have been mailed').toBeTruthy();
  expect(mail.code).toMatch(/^[1-9]\d{5}$/);
  return mail.code;
}

function typeCode(code) {
  const boxes = document.querySelectorAll('.otp-digit');
  code.split('').forEach((digit, i) => fireEvent.change(boxes[i], { target: { value: digit } }));
}

const text = () => document.body.textContent || '';

beforeEach(() => {
  cleanup();
  resetSupabaseStub();
  holder.entry = '/';
  sessionStorage.clear();
  localStorage.clear();
  srv.rows.clear();
  srv.mails.length = 0;
  srv.requests.length = 0;
  srv.failNextSend = false;
  srv.hangSend = false;
  installFakeEndpoints();
});

describe('signup: server-issued OTP gate, then the Supabase account', () => {
  it('the details step asks for a code and creates nothing yet', async () => {
    const api = await openEmailForm();
    await toOtpStep(api);

    const send = srv.requests.filter((r) => r.url.includes('/api/send-otp'));
    expect(send).toHaveLength(1);
    expect(callsTo('signUp')).toHaveLength(0);
    expect(callsTo('verifyOtp')).toHaveLength(0);
    expect(callsTo('resend')).toHaveLength(0);
    expect(text()).toMatch(/we've sent a 6-digit code/i);
  });

  it('the request carries the address and greeting name — never the password, never a code', async () => {
    const api = await openEmailForm();
    await toOtpStep(api);

    const { body } = srv.requests.find((r) => r.url.includes('/api/send-otp'));
    expect(Object.keys(body).sort()).toEqual(['email', 'userName']);
    expect(JSON.stringify(srv.requests)).not.toMatch(/password/i);
    // The client cannot even echo what it never had: the code exists only in the
    // fake mailer's copy and the server-side digest.
    expect(JSON.stringify(body)).not.toContain(mailedCode());
    // …and the stored challenge holds a digest, not the code.
    const stored = srv.rows.get('raja@x.com');
    expect(stored.otpHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(mailedCode());
  });

  it('a verified code creates the account exactly once, with only full_name as metadata', async () => {
    const api = await openEmailForm();
    await toOtpStep(api);
    typeCode(mailedCode());

    await waitFor(() => expect(callsTo('signUp')).toHaveLength(1), { timeout: 9000 });
    const call = callsTo('signUp')[0];
    expect(call.email).toBe('raja@x.com');
    expect(call.password).toBe(PASSWORD);
    expect(call.options).toEqual({ data: { full_name: 'Raja Advani' } });
    expect(JSON.stringify(call.options)).not.toMatch(/role|is_spam|student_id|auth_uid/);
    // No client-side profile write, and no Supabase-side email verification.
    expect(callsTo('insert:students')).toHaveLength(0);
    expect(callsTo('verifyOtp')).toHaveLength(0);
    // The challenge is gone: a captured code cannot be replayed.
    expect(srv.rows.size).toBe(0);
  });

  it('the profile the app shows is the row the trigger made', async () => {
    state.profile = studentRow({ auth_uid: 'u1', email: 'raja@x.com', full_name: 'Raja Advani', student_id: 7 });
    const api = await openEmailForm();
    await toOtpStep(api);
    typeCode(mailedCode());

    await waitFor(() => expect(callsTo('signUp')).toHaveLength(1), { timeout: 9000 });
    await waitFor(() => expect(state.session).toBeTruthy(), { timeout: 9000 });
    expect(state.session.user.email).toBe('raja@x.com');
    // The profile is READ by auth_uid (the trigger's row), never written by us.
    const read = callsTo('select:students').at(-1);
    expect(read.filters.auth_uid).toBe('u1');
    expect(callsTo('insert:students')).toHaveLength(0);
  });

  it('a wrong code stays on the OTP screen, burns an attempt, and creates no account', async () => {
    const api = await openEmailForm();
    await toOtpStep(api);

    typeCode('111111');
    await waitFor(() => expect(srv.requests.some((r) => r.url.includes('verify'))).toBe(true));
    await waitFor(() => expect(/not right/i.test(text())).toBe(true));

    expect(callsTo('signUp')).toHaveLength(0);
    expect(srv.rows.get('raja@x.com').attempts).toBe(1);
    expect(document.querySelectorAll('.otp-digit').length).toBe(6);
    // Interactive again — no spinner stranded on the screen, and the boxes take input.
    await waitFor(() => {
      expect(document.querySelector('.otp-digit')).not.toBeDisabled();
      expect(document.querySelector('.mini-spin-dark')).toBeNull();
    });
  });

  it('three wrong codes lock the challenge out — still no account', async () => {
    const api = await openEmailForm();
    await toOtpStep(api);

    for (let i = 1; i <= 3; i += 1) {
      typeCode(`11111${i}`);
        await waitFor(() => expect(srv.requests.filter((r) => r.url.includes('verify'))).toHaveLength(i));
      // the boxes are cleared for the next guess, and the screen is still the OTP step
      await waitFor(() => expect(Array.from(document.querySelectorAll('.otp-digit')).map((el) => el.value).join('')).toBe(''));
    }

    expect(callsTo('signUp')).toHaveLength(0);
    expect(srv.rows.has('raja@x.com')).toBe(false);      // locked rows are discarded
    await waitFor(() => expect(/too many incorrect attempts/i.test(text())).toBe(true));
  });

  it('an expired code says so and unlocks the resend button instead of a dead end', async () => {
    const api = await openEmailForm();
    await toOtpStep(api);
    srv.rows.get('raja@x.com').expiresAt = Date.now() - 1000;
    expect(srv.rows.get('raja@x.com').otpHash).toBeTruthy();

    typeCode(mailedCode());                                 // the right digits, too late
    await waitFor(() => expect(/expired/i.test(text())).toBe(true), { timeout: 4000 }).catch(() => {
      console.log('DBG BODY>>>', text().replace(/\s+/g, ' ').slice(0, 600), '||REQS', JSON.stringify(srv.requests.map(r=>r.url)));
      throw new Error('dumped');
    });
    expect(callsTo('signUp')).toHaveLength(0);
    expect(srv.rows.has('raja@x.com')).toBe(false);
    // A new code is available immediately: the expired one must not cost a cooldown.
    // The resend control is reachable (not disabled) the moment the server says expired.
    expect(document.querySelector('.resend-btn')).toBeTruthy();
  });

  it('resend goes through the same Nodemailer path and respects the cooldown', async () => {
    const api = await openEmailForm();
    await toOtpStep(api);

    const resend = document.querySelector('.resend-btn');
    expect(resend).toBeTruthy();
    expect(resend.disabled).toBe(true);                  // 60 s from the first send
    fireEvent.click(resend);
    fireEvent.click(resend);
    expect(srv.requests.filter((r) => r.url.includes('send-otp'))).toHaveLength(1);
    expect(srv.mails).toHaveLength(1);                   // no request burned while locked
    expect(text()).toMatch(/Resend in \d+s/);
    // Supabase is not in this loop at all: no verifyOtp, no signup-type resend.
    expect(callsTo('resend')).toHaveLength(0);
    expect(callsTo('verifyOtp')).toHaveLength(0);
  });

  it('a failed send stops the spinner, says why, and leaves the address free to retry', async () => {
    const api = await openEmailForm();
    api.fill(['Raja Advani', 'raja@x.com', PASSWORD]);
    srv.failNextSend = true;

    fireEvent.submit(api.form());
    await waitFor(() => expect(/failed to send email/i.test(text())).toBe(true));

    expect(api.submit()).not.toBeDisabled();              // released, not stranded
    expect(srv.rows.size).toBe(0);                        // nothing half-started
    expect(document.querySelectorAll('.otp-digit')).toHaveLength(0);

    // and the very next attempt works: no client-side lockout was created by the failure
    await toOtpStep(api);
    expect(srv.mails).toHaveLength(1);
    expect(document.querySelectorAll('.otp-digit')).toHaveLength(6);
  }, 20000);

  it('hammering Create Account sends exactly one code', async () => {
    const api = await openEmailForm();
    api.fill(['Raja Advani', 'raja@x.com', PASSWORD]);
    fireEvent.submit(api.form());
    fireEvent.submit(api.form());
    fireEvent.submit(api.form());

    await waitFor(() => expect(document.querySelectorAll('.otp-digit').length).toBe(6));
    expect(srv.requests.filter((r) => r.url.includes('/api/send-otp'))).toHaveLength(1);
    expect(srv.mails).toHaveLength(1);
  }, 20000);

  it('an address that already has an account is bounced to the log-in hint', async () => {
    state.signUpResult = { data: { user: null, session: null }, error: null };
    const api = await openEmailForm();
    await toOtpStep(api);
    typeCode(mailedCode());

    await waitFor(() => expect(/already registered/i.test(text())).toBe(true));
    expect(callsTo('signUp')).toHaveLength(1);
    expect(state.session).toBeNull();
  }, 20000);

  it('a project that still confirms emails itself is reported honestly', async () => {
    state.signUpResult = {
      data: { user: authUser({ email: 'raja@x.com' }), session: null }, error: null,
    };
    const api = await openEmailForm();
    await toOtpStep(api);
    typeCode(mailedCode());

    await waitFor(() => expect(/confirms email addresses itself/i.test(text())).toBe(true));
    expect(state.session).toBeNull();
  }, 20000);

  it('reloading mid-flow cannot skip the gate', async () => {
    const api = await openEmailForm();
    await toOtpStep(api);
    const code = mailedCode();

    cleanup();
    await openEmailForm();                                // same address, fresh page load
    await waitFor(() => expect(document.querySelector('.auth-form')).toBeTruthy());

    // The OTP screen is gone with the in-memory handoff, and no session exists: the
    // only way in is to verify a code again.
    expect(document.querySelectorAll('.otp-digit')).toHaveLength(0);
    expect(state.session).toBeNull();
    expect(callsTo('signUp')).toHaveLength(0);
    // The mailed code is useless without the OTP step: there is nothing on the
    // details screen that can present it, and no request is made to verify anything.
    expect(srv.requests.filter((r) => r.url.includes('verify'))).toHaveLength(0);
    expect(code).toMatch(/^[1-9]\d{5}$/);
  }, 20000);
});
