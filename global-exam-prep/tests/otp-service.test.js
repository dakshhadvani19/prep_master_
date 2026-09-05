/**
 * The browser's half of signup verification, against a fake network.
 *
 * What this pins down, in order of how it broke production:
 *   1. every request SETTLES. A pending promise here once meant a spinner that never
 *      stopped, because Signup.jsx only clears `loading` in a `finally`.
 *   2. the request carries `{ email, userName }` for sending and `{ email, code }`
 *      for verifying. Never a password; never a client-chosen code.
 *   3. two clicks are one request (a second send mails a second code; a second
 *      verify burns a second attempt out of a budget of three).
 *   4. a server message is shown as written, and an unreadable one is replaced by a
 *      sentence a student can act on.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const net = vi.hoisted(() => ({
  calls: [],
  /** Resolved by the current test: a Response-like object, a never-settling promise, or a throw. */
  respond: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ success: true }) }),
}));

vi.mock('../src/firebase', () => ({
  auth: { currentUser: null }, db: {}, storage: {}, firebaseConfigError: null,
}));

const otp = await import('../src/utils/otpService.js');
const { createAndSendOTP, verifyOTP, resendCooldownRemaining } = otp;

function json(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

beforeEach(() => {
  net.calls.length = 0;
  net.respond = async () => json({ success: true, expiresIn: 600, resendAfter: 60, expiresAt: null });
  globalThis.fetch = vi.fn(async (url, init) => {
    const call = { url: String(url), body: JSON.parse(init.body || '{}'), signal: init?.signal };
    net.calls.push(call);
    return net.respond(call);
  });
});

afterEach(() => vi.useRealTimers());

const sendCall = () => net.calls.find((c) => c.url.includes('/api/send-otp'));
const verifyCall = () => net.calls.find((c) => c.url.includes('/api/verify-otp'));

describe('request contract', () => {
  it('asks for a code with the address and the greeting name, and nothing else', async () => {
    await createAndSendOTP('Raja@X.com ', 'Raja Advani');

    expect(net.calls).toHaveLength(1);
    expect(sendCall().url).toBe('/api/send-otp');
    // Sorted keys, exactly: `password` and `otp` are the two fields that must never
    // appear here, and naming them in the assertion is the point of the test.
    expect(Object.keys(sendCall().body).sort()).toEqual(['email', 'userName']);
    expect(sendCall().body.email).toBe('raja@x.com');
    expect(JSON.stringify(sendCall().body)).not.toMatch(/password|"otp"/i);
    // No credentials, no cache: the response is single-use by construction.
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/send-otp',
      expect.objectContaining({ credentials: 'omit', cache: 'no-store', method: 'POST' }),
    );
  });

  it('reports when the code expires and when a resend is allowed, from the server', async () => {
    net.respond = async () => json({
      success: true, expiresIn: 300, resendAfter: 90,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    });
    const info = await createAndSendOTP('raja@x.com', 'Raja');

    expect(info.resendAfter).toBe(90);
    expect(info.expiresInMs).toBe(300_000);
    expect(info.expiresAt).toBeGreaterThan(info.sentAt);
    // …and the countdown helper agrees with what the page will show.
    expect(resendCooldownRemaining(90)).toBe(60);      // clamped to the server's cooldown
  });

  it('sends the typed code for verification, without the password it is holding', async () => {
    net.respond = async (call) => (call.url.includes('verify')
      ? json({ verified: true })
      : json({ success: true }));

    await expect(verifyOTP('Raja@X.com', ' 4 2 7 1 9 3 ')).resolves.toBe('raja@x.com');
    expect(Object.keys(verifyCall().body).sort()).toEqual(['code', 'email']);
    expect(verifyCall().body).toEqual({ email: 'raja@x.com', code: '427193' });
  });
});

describe('no path can hang the caller', () => {
  it('a request that never answers is abandoned, and actually cancelled', async () => {
    vi.useFakeTimers();
    let aborted = false;
    net.respond = (call) => {
      call.signal.addEventListener('abort', () => { aborted = true; });
      return new Promise(() => {});                 // the production failure mode
    };

    let outcome = 'pending';
    createAndSendOTP('raja@x.com', 'Raja').then(
      () => { outcome = 'resolved'; }, (e) => { outcome = e.message; },
    );

    await vi.advanceTimersByTimeAsync(24_000);
    expect(outcome).toBe('pending');                // bounded, not endless
    await vi.advanceTimersByTimeAsync(2_000);
    expect(outcome).toMatch(/too long/i);
    expect(aborted).toBe(true);                     // the socket is given up, not leaked
  });

  it('an offline browser gets a sentence, not a TypeError', async () => {
    net.respond = async () => { throw new TypeError('Failed to fetch'); };
    await expect(createAndSendOTP('raja@x.com', 'Raja'))
      .rejects.toThrow(/connection/i);
  });

  it('a 500 with an HTML body does not become "Unexpected token < in JSON"', async () => {
    net.respond = async () => ({ ok: false, status: 502, text: async () => '<html>502 Bad Gateway</html>' });
    await expect(createAndSendOTP('raja@x.com', 'Raja'))
      .rejects.toThrow(/could not start verification|could not send the code/i);
  });

  it('a verification request that hangs cannot freeze the OTP screen', async () => {
    vi.useFakeTimers();
    net.respond = (call) => (call.url.includes('verify')
      ? new Promise(() => {})
      : json({ success: true }));

    let outcome = 'pending';
    verifyOTP('raja@x.com', '427193').then(
      () => { outcome = 'resolved'; }, (e) => { outcome = e.message; },
    );
    await vi.advanceTimersByTimeAsync(16_000);
    expect(outcome).toMatch(/too long/i);
  });
});

describe('duplicate submits', () => {
  it('three clicks for one address are one request, and all three get the same result', async () => {
    const all = await Promise.all([
      createAndSendOTP('raja@x.com', 'Raja'),
      createAndSendOTP('raja@x.com', 'Raja'),
      createAndSendOTP('raja@x.com', 'Raja'),
    ]);

    expect(net.calls).toHaveLength(1);
    expect(all[0]).toEqual(all[1]);
    expect(all[1]).toEqual(all[2]);
  });

  it('a repeated verify is one request, because two would spend the attempt budget twice', async () => {
    net.respond = async () => json({ verified: false, reason: 'invalid', remaining: 2, error: 'Nope.' });

    const both = await Promise.allSettled([
      verifyOTP('raja@x.com', '427193'),
      verifyOTP('raja@x.com', '427193'),
    ]);

    expect(net.calls.filter((c) => c.url.includes('verify'))).toHaveLength(1);
    expect(both.map((r) => r.status)).toEqual(['rejected', 'rejected']);
  });

  it('the next click after a settled attempt is allowed (no sticky lock)', async () => {
    await createAndSendOTP('raja@x.com', 'Raja');
    await createAndSendOTP('raja@x.com', 'Raja');
    expect(net.calls.filter((c) => c.url.includes('send'))).toHaveLength(2);
  });
});

describe('server verdicts reach the student', () => {
  it('a cooldown 429 is shown as written, with the wait', async () => {
    net.respond = async () => json(
      { error: 'Please wait 37s before requesting another code.', retry_after_seconds: 37 }, 429,
    );
    await expect(createAndSendOTP('raja@x.com', 'Raja'))
      .rejects.toThrow('Please wait 37s before requesting another code.');
  });

  it('an expired code unlocks the resend button', async () => {
    net.respond = async () => json({
      verified: false, reason: 'expired', error: 'Your code has expired. Request a new one.', resendAllowed: true,
    }, 400);

    await expect(verifyOTP('raja@x.com', '427193')).rejects.toMatchObject({
      reason: 'expired',
      resendAllowed: true,
      message: 'Your code has expired. Request a new one.',
    });
  });

  it('a lockout says so, and still lets the student start over', async () => {
    net.respond = async () => json({
      verified: false, reason: 'locked', error: 'Too many incorrect attempts. Please request a new code.', resendAllowed: true,
    }, 429);

    await expect(verifyOTP('raja@x.com', '427193')).rejects.toMatchObject({
      reason: 'locked', resendAllowed: true, remaining: 0,
    });
  });

  it('a store that will not answer is never reported as a wrong code', async () => {
    net.respond = async () => json({
      verified: false, reason: 'store_unavailable', error: 'We could not check your code just now. Please try again.',
    }, 502);

    await expect(verifyOTP('raja@x.com', '427193')).rejects.toMatchObject({
      reason: 'store_unavailable',
      resendAllowed: false,
      message: 'We could not check your code just now. Please try again.',
    });
  });

  it('internal text from the server is never rendered to a student', async () => {
    net.respond = async () => json({
      error: 'relation "auth_otp" does not exist (42P01)',
    }, 500);
    await expect(createAndSendOTP('raja@x.com', 'Raja'))
      .rejects.toThrow(/could not send the code right now/i);
  });

  it('a malformed code never reaches the network', async () => {
    await expect(verifyOTP('raja@x.com', '42719')).rejects.toThrow(/6-digit/i);
    await expect(verifyOTP('raja@x.com', 'abcdef')).rejects.toThrow(/6-digit/i);
    expect(net.calls).toHaveLength(0);
  });

  it('an obviously bad address is refused before it can be mailed to', async () => {
    await expect(createAndSendOTP('not-an-email', 'Raja')).rejects.toThrow(/valid email/i);
    expect(net.calls).toHaveLength(0);
  });
});
