/**
 * /api/send-otp is the delivery half of the signup gate, so the client-side flow
 * tests only mean something if this function actually sends. Runs the REAL handler
 * with a stubbed Nodemailer transport: no SMTP, no network, no real credentials.
 *
 * The signup flow depends on these properties, so they are asserted here rather
 * than assumed: the endpoint takes only what a code needs (never a password), it
 * refuses to be a generic mail relay, it rate limits, and a Gmail failure is
 * reported as a failure so otpService can roll the challenge back.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ sendMail: vi.fn() }));

vi.mock('nodemailer', () => {
  const createTransport = vi.fn(() => ({ sendMail: h.sendMail }));
  return { default: { createTransport }, createTransport };
});
const nodemailer = await import('nodemailer');

const handler = (await import('../api/send-otp.js')).default;

function makeRes() {
  return {
    statusCode: 0, payload: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.payload = o; return this; },
    end() { return this; },
  };
}
const post = (body, headers = {}) => ({
  method: 'POST', body, headers: { 'x-forwarded-for': '203.0.113.7', ...headers },
});

const ENV = { GMAIL_USER: 'otp@prepmaster.test', GMAIL_APP_PASSWORD: 'app-password-under-test' };

// Stubbed through vitest, not `process.env` directly: the test files are linted
// without Node globals, and stubEnv is restored per test either way.
beforeEach(() => {
  h.sendMail.mockReset().mockResolvedValue({ messageId: 'abc@prepmaster.test' });
  nodemailer.default.createTransport.mockClear();
  vi.unstubAllEnvs();
  vi.stubEnv('GMAIL_USER', ENV.GMAIL_USER);
  vi.stubEnv('GMAIL_APP_PASSWORD', ENV.GMAIL_APP_PASSWORD);
});

afterEach(() => vi.unstubAllEnvs());

describe('POST /api/send-otp', () => {
  it('accepts a valid request and mails exactly the code it was given', async () => {
    const res = makeRes();
    await handler(post({ email: 'RAJA-ACCEPT@X.com ', otp: '491207', userName: 'Raja Advani' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ success: true });

    const mail = h.sendMail.mock.calls[0][0];
    expect(mail.to).toBe('raja-accept@x.com');
    expect(mail.subject).toContain('491207');
    expect(mail.html).toContain('491207');
    // The transport is built from the two Gmail env vars, and nothing else is
    // required from the caller.
    expect(nodemailer.default.createTransport).toHaveBeenCalledWith({
      service: 'gmail', auth: { user: ENV.GMAIL_USER, pass: ENV.GMAIL_APP_PASSWORD },
    });
  });

  it('takes only what a code needs — a password in the body is ignored, never mailed', async () => {
    const res = makeRes();
    await handler(post({
      email: 'raja-pwd@x.com', otp: '123456', userName: 'Raja', password: 'Str0ng!Passw0rd',
    }), res);

    const mail = h.sendMail.mock.calls[0][0];
    expect(JSON.stringify(mail)).not.toMatch(/Str0ng/);
    expect(Object.keys(mail).sort()).toEqual(['from', 'html', 'subject', 'to']);
  });

  it('accepts the real-world addresses the old pattern rejected', async () => {
    for (const email of ['a.b@cse.vgu.edu', 'student+1@university.ac.in', 'x-y@z.co.uk']) {
      const res = makeRes();
      await handler(post({ email, otp: '123456', userName: 'Raja' }), res);
      expect(res.statusCode, email).toBe(200);
    }
    for (const email of ['x@y', 'a@b.', 'a b@c.com', 'a@@b.com', '@b.com']) {
      const res = makeRes();
      await handler(post({ email, otp: '123456', userName: 'Raja' }), res);
      expect(res.statusCode, email).toBe(400);
    }
  });

  it('refuses anything that is not a 6-digit code for one address (not a mail relay)', async () => {
    const cases = [
      [{}, 400],
      [{ email: 'raja@x.com' }, 400],
      [{ otp: '123456' }, 400],
      [{ email: 'not-an-email', otp: '123456' }, 400],
      [{ email: 'raja-bad@x.com', otp: '12345' }, 400],
      [{ email: 'raja-bad@x.com', otp: '<b>123456</b>' }, 400],
      [{ email: 'raja-bad@x.com', otp: '1234567' }, 400],
    ];
    for (const [body, code] of cases) {
      const res = makeRes();
      await handler(post(body), res);
      expect(res.statusCode, JSON.stringify(body)).toBe(code);
    }
    expect(h.sendMail).not.toHaveBeenCalled();
  });

  it('rejects anything but POST, and escapes the greeting name into the template', async () => {
    const get = makeRes();
    await handler({ method: 'GET', body: {}, headers: {} }, get);
    expect(get.statusCode).toBe(405);

    const res = makeRes();
    await handler(post({ email: 'raja-esc@x.com', otp: '123456', userName: '<script>alert(1)</script>raj' }), res);
    const { html } = h.sendMail.mock.calls[0][0];
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;');
  });

  it('rate limits per address inside the window', async () => {
    let last;
    for (let i = 0; i < 6; i += 1) {
      last = makeRes();
      await handler(post({ email: 'spray@x.com', otp: '123456', userName: 'S' },
        { 'x-forwarded-for': '198.51.100.' + i }), last);
    }
    expect(last.statusCode).toBe(429);
    expect(last.payload.error).toMatch(/Too many codes requested\. Try again in \d+s/);
    expect(h.sendMail).toHaveBeenCalledTimes(5);      // MAX_PER_EMAIL
  });

  it('fails as 500 when the Gmail credentials are not configured, so the client rolls back', async () => {
    vi.stubEnv('GMAIL_APP_PASSWORD', '');
    const res = makeRes();
    await handler(post({ email: 'raja-nocreds@x.com', otp: '123456', userName: 'Raja' }), res);

    expect(res.statusCode).toBe(500);
    expect(res.payload.error).toMatch(/GMAIL_USER or GMAIL_APP_PASSWORD missing/);
    expect(h.sendMail).not.toHaveBeenCalled();
  });

  it('reports a Gmail rejection as a friendly failure instead of a false success', async () => {
    h.sendMail.mockRejectedValueOnce(new Error('Login - 535 Username and Password not accepted'));
    const res = makeRes();
    await handler(post({ email: 'raja-gmailerr@x.com', otp: '123456', userName: 'Raja' }), res);

    expect(res.statusCode).toBe(500);
    expect(res.payload.error).toBe('Failed to send email. Please try again.');
  });
});
