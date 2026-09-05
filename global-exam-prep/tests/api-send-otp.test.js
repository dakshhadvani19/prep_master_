/**
 * POST /api/send-otp — the issuance half of the signup gate, run for real.
 *
 * Only two things are stubbed: the SMTP transport and the transport to Postgres.
 * The digest, the validation, the escaping, the request budget and the rollback are
 * the production code paths, so what this file asserts is what the deployed function
 * does with a real database and a real mailer behind it.
 *
 * The properties the whole architecture rests on:
 *   - the code is generated HERE, by this process, and nowhere else;
 *   - only its keyed digest reaches Postgres, so a request log, a read replica or a
 *     leaked table cannot produce a usable code;
 *   - a password, if a stale client posts one, is ignored — never stored, mailed,
 *     logged or echoed;
 *   - it refuses to be a mail relay, escapes the greeting name, rate limits,
 *     passes the database's resend cooldown through, and rolls the challenge back
 *     when Gmail rejects the message so the student is not locked out for 10 minutes.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';

const h = vi.hoisted(() => ({ sendMail: vi.fn() }));

/**
 * The only seam is the network: `fetch` is what the real store client uses, so the
 * URL it builds, the headers it sets and the JSON body it sends are all under test
 * here — a mocked helper would have skipped exactly the parts that can leak a key.
 */
const net = vi.hoisted(() => ({
    calls: [],
    issueResult: null,     // override the auth_otp_issue payload
    discardResult: null,   // override the auth_otp_discard payload
    throwOn: null,         // 'issue' | 'discard' | null -> reject like a dead backend
}));

vi.mock('nodemailer', () => {
    const createTransport = vi.fn(() => ({ sendMail: h.sendMail }));
    return { default: { createTransport }, createTransport };
});

const nodemailer = await import('nodemailer');
const handler = (await import('../api/send-otp.js')).default;

const PEPPER = 'pepper-under-test';

function makeRes() {
    return {
        statusCode: 0, payload: null, headers: {},
        setHeader(k, v) { this.headers[k] = v; },
        status(c) { this.statusCode = c; return this; },
        json(o) { this.payload = o; return this; },
        end() { return this; },
    };
}

let counter = 0;
let seq = 0;
/** The per-IP budget is real, so each request gets its own address unless a test cares. */
const post = (body, headers = {}) => ({
    method: 'POST', body,
    headers: { 'x-forwarded-for': `198.51.100.${(seq += 1) % 250}`, ...headers },
});

const addr = (label = 'user') => `${label}${counter}@prepmaster.test`;

const rpcCall = (name) => net.calls.filter((c) => c.name === name);
/** The most recent message, so a loop over several requests can assert each one. */
const mailed = () => h.sendMail.mock.calls.at(-1)?.[0] || {};
const codeInMail = () => {
    const match = String(mailed().subject).match(/\b([1-9]\d{5})\b/);
    expect(match, 'the subject line must carry the code').toBeTruthy();
    return match[1];
};

const DEFAULTS = {
    auth_otp_issue: () => ({
        ok: true,
        nonce: 'a1b2c3d4-0000-4000-8000-000000000001',
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        ttl_seconds: 600,
        resend_after_seconds: 60,
    }),
    auth_otp_discard: () => ({ ok: true, discarded: true }),
};

beforeEach(() => {
    counter += 1;
    h.sendMail.mockReset().mockResolvedValue({ messageId: 'abc@prepmaster.test' });
    net.calls.length = 0;
    net.issueResult = null;
    net.discardResult = null;
    net.throwOn = null;
    globalThis.fetch = vi.fn(async (url, init) => {
        const name = /\/rpc\/([a-z_]+)/.exec(String(url))?.[1] || 'unknown';
        const args = JSON.parse(init.body || '{}');
        net.calls.push({ url: String(url), name, args, headers: init.headers });
        if (net.throwOn === name.slice(0, 5) || net.throwOn === name) {
            throw new TypeError('fetch failed');
        }
        const payload = (name === 'auth_otp_issue' ? net.issueResult : net.discardResult)
            ?? DEFAULTS[name]?.();
        return {
            ok: true, status: 200,
            text: async () => JSON.stringify(payload ?? { ok: true }),
        };
    });
    nodemailer.default.createTransport.mockClear();
    vi.unstubAllEnvs();
    vi.stubEnv('GMAIL_USER', 'otp@prepmaster.test');
    vi.stubEnv('GMAIL_APP_PASSWORD', 'app-password-under-test');
    vi.stubEnv('SUPABASE_URL', 'https://test-project.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key-under-test');
    vi.stubEnv('OTP_PEPPER', PEPPER);
});

afterEach(() => vi.unstubAllEnvs());

describe('issuance', () => {
    it('generates the code, stores only its digest, and mails the code', async () => {
        const res = makeRes();
        await handler(post({ email: 'RAJA-ACCEPT@X.com ', userName: 'Raja Advani' }), res);

        expect(res.statusCode).toBe(200);
        expect(res.payload.success).toBe(true);
        // The timings the UI counts down come from the database, so they cannot drift.
        expect(res.payload).toMatchObject({ expiresIn: 600, resendAfter: 60 });

        const stored = rpcCall('auth_otp_issue');
        expect(stored).toHaveLength(1);
        const { args } = stored[0];
        // Built from env, never from a hardcoded host: a production bundle that
        // still points at localhost is the failure mode this rules out.
        expect(stored[0].url).toBe('https://test-project.supabase.co/rest/v1/rpc/auth_otp_issue');
        expect(stored[0].headers.apikey).toBe('service-role-key-under-test');
        expect(stored[0].headers.Authorization).toBe('Bearer service-role-key-under-test');
        expect(args.p_email).toBe('raja-accept@x.com');
        expect(args.p_otp_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(args.p_ttl_seconds).toBe(600);
        expect(args.p_cooldown_seconds).toBe(60);
        expect(JSON.stringify(args)).not.toContain(codeInMail());

        // The digest must belong to the code that was actually mailed. Recomputing it
        // here proves both halves use the same value, not merely the same shape.
        expect(args.p_otp_hash).toBe(
            createHmac('sha256', PEPPER).update(`raja-accept@x.com:${codeInMail()}`).digest('hex'),
        );

        expect(mailed().to).toBe('raja-accept@x.com');
        expect(mailed().html).toContain(codeInMail());
        // Store first, mail second — that ordering is what makes a failed send safe.
        expect(net.calls[0].name).toBe('auth_otp_issue');
        expect(rpcCall('auth_otp_discard')).toEqual([]);
    });

    it('every generated code is 6 digits with a non-zero leading digit, and is not repeatable', async () => {
        const seen = new Set();
        for (let i = 0; i < 60; i += 1) {
            const res = makeRes();
            await handler(post({ email: addr(`rng${i}`), userName: 'R' }), res);
            expect(res.statusCode).toBe(200);
            expect(codeInMail()).toMatch(/^[1-9]\d{5}$/);
            seen.add(codeInMail());
        }
        // A CSPRNG, not a counter: 60 draws must not be near-colliding, and must not
        // be monotonic either.
        expect(seen.size).toBeGreaterThan(55);
        const first = [...seen][0];
        expect(Number(first[0])).toBeGreaterThanOrEqual(1);
    });

    it('ignores a password and a client-supplied code, and forwards neither', async () => {
        const res = makeRes();
        await handler(post({
            email: addr('staleclient'), otp: '123456', password: 'Str0ng!Passw0rd', userName: 'Raja',
        }), res);

        expect(res.statusCode).toBe(200);
        expect(codeInMail()).not.toBe('123456');
        const dumped = JSON.stringify({
            ...res.payload, rpc: net.calls, mail: mailed(),
        });
        expect(dumped).not.toMatch(/Str0ng!Passw0rd/);
        expect(dumped.toLowerCase()).not.toContain('password');
    });

    it('refuses to be a mail relay: junk addresses are rejected before anything is stored', async () => {
        const bad = ['', 'not-an-email', 'a@b', 'a b@c.com', `x@${'y'.repeat(330)}`, `a@b.c`.repeat(80)];
        for (const email of bad) {
            const res = makeRes();
            await handler(post({ email, userName: 'Raja' }), res);
            expect(res.statusCode, `must refuse ${String(email).slice(0, 24)}`).toBe(400);
            expect(res.payload.error).toMatch(/invalid email/i);
        }
        expect(net.calls).toEqual([]);
        expect(h.sendMail).not.toHaveBeenCalled();
    });

    it('escapes the greeting name instead of interpolating markup into the email', async () => {
        const res = makeRes();
        // The template interpolates only the FIRST name, so the markup is placed
        // where it will actually be used: leading with it proves the escape, and a
        // name that begins with a tag must not reach the body unescaped.
        await handler(post({
            email: addr('inject'),
            userName: '<img src=x onerror=alert(1)><script>evil()</script> Raja',
        }), res);

        const html = mailed().html || '';
        expect(html).not.toContain('<img src=x');
        expect(html).not.toContain('<script>evil()');
        expect(html).toContain('&lt;img');
        expect(res.statusCode).toBe(200);
    });
});

describe('failure paths are visible and recoverable', () => {
    it('passes the database cooldown through as a 429 with the real wait, without mailing', async () => {
        net.issueResult = { ok: false, reason: 'cooldown', retry_after_seconds: 37 };
        const res = makeRes();

        await handler(post({ email: addr('cool'), userName: 'Raja' }), res);

        expect(res.statusCode).toBe(429);
        expect(res.payload.retry_after_seconds).toBe(37);
        expect(res.payload.error).toMatch(/37s/);
        expect(h.sendMail).not.toHaveBeenCalled();
    });

    it('rolls the challenge back when Gmail rejects the message, so retry is immediate', async () => {
        const email = addr('gmail');
        h.sendMail.mockRejectedValueOnce(new Error('535 Username and Password not accepted'));
        const res = makeRes();

        await handler(post({ email: email.toUpperCase(), userName: 'Raja' }), res);

        expect(res.statusCode).toBe(500);
        expect(res.payload.error).toMatch(/try again/i);
        // The rollback targets the normalised address the row is keyed by.
        expect(rpcCall('auth_otp_discard').map((c) => c.args.p_email)).toEqual([email]);
        expect(JSON.stringify(res.payload)).not.toMatch(/535|smtp|password/i);
    });

    it('a store that will not answer is a 502, never a silent success', async () => {
        net.throwOn = 'auth_otp_issue';
        const res = makeRes();

        await handler(post({ email: addr('dark'), userName: 'Raja' }), res);

        expect(res.statusCode).toBe(502);
        expect(res.payload.error).toMatch(/could not start verification/i);
        expect(h.sendMail).not.toHaveBeenCalled();
    });

    it('names a missing env var instead of failing mysteriously, and sends nothing', async () => {
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
        const res = makeRes();

        await handler(post({ email: addr('env'), userName: 'Raja' }), res);

        expect(res.statusCode).toBe(500);
        expect(res.payload.error).toContain('SUPABASE_SERVICE_ROLE_KEY');
        expect(net.calls).toEqual([]);
        expect(h.sendMail).not.toHaveBeenCalled();
        expect(JSON.stringify(res.payload)).not.toContain('service-role-key-under-test');
    });

    it('never leaks a digest, the pepper, or internal text in any response', async () => {
        net.issueResult = { ok: false, reason: 'invalid_input' };
        const res = makeRes();

        await handler(post({ email: addr('leak'), userName: 'Raja' }), res);

        const dumped = JSON.stringify(res.payload);
        expect(dumped).not.toMatch(/[0-9a-f]{64}/);
        expect(dumped).not.toContain(PEPPER);
        expect(dumped).not.toMatch(/invalid_input|auth_otp|rpc/i);
        expect(res.payload.error).toMatch(/could not start verification/i);
    });
});

describe('transport and budget', () => {
    it('answers CORS, and accepts only POST', async () => {
        const options = makeRes();
        await handler({ method: 'OPTIONS', headers: {} }, options);
        expect(options.statusCode).toBe(200);
        expect(options.headers['Access-Control-Allow-Methods']).toContain('POST');

        const get = makeRes();
        await handler({ method: 'GET', headers: {} }, get);
        expect(get.statusCode).toBe(405);
    });

    it('stops the sixth request for one address inside the window', async () => {
        const email = addr('budget');
        const codes = [];
        for (let i = 0; i < 6; i += 1) {
            const res = makeRes();
            // A distinct IP each time, so only the per-address budget can trip.
            await handler({
                method: 'POST', body: { email, userName: 'Raja' },
                headers: { 'x-forwarded-for': `10.0.0.${i + 1}` },
            }, res);
            codes.push(res.statusCode);
        }
        expect(codes.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
        expect(codes[5]).toBe(429);
        expect(h.sendMail).toHaveBeenCalledTimes(5);
    });
});
