/**
 * POST /api/verify-otp — the gate itself, run for real against a stubbed Postgres
 * transport (only `fetch` is faked, so the URL, headers and body the store client
 * builds are covered too).
 *
 * Everything the signup security story depends on is here: the digest is recomputed
 * in this process and bound to the address, a code is never accepted from the
 * caller, the attempt budget and single-use burn are the database's answers
 * (not ours), a dead database is reported as "try again" rather than as a wrong
 * code, and nothing readable is ever echoed back.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';

const net = vi.hoisted(() => ({
    calls: [],
    result: null,
    throwOn: false,
}));

const handler = (await import('../api/verify-otp.js')).default;
const store = await import('../api/_otpStore.js');

const PEPPER = 'pepper-under-test';
const CODE = '427193';

function makeRes() {
    return {
        statusCode: 0, payload: null, headers: {},
        setHeader(k, v) { this.headers[k] = v; },
        status(c) { this.statusCode = c; return this; },
        json(o) { this.payload = o; return this; },
        end() { return this; },
    };
}

let seq = 0;
let counter = 0;
const post = (body, headers = {}) => ({
    method: 'POST', body,
    headers: { 'x-forwarded-for': `192.0.2.${(seq += 1) % 250}`, ...headers },
});
const addr = (label = 'user') => `${label}${counter}@prepmaster.test`;
const digest = (email, code = CODE) =>
    createHmac('sha256', PEPPER).update(`${email}:${code}`).digest('hex');

beforeEach(() => {
    counter += 1;
    net.calls.length = 0;
    net.result = { ok: true, verified_at: new Date().toISOString() };
    net.throwOn = false;
    globalThis.fetch = vi.fn(async (url, init) => {
        const name = /\/rpc\/([a-z_]+)/.exec(String(url))?.[1] || 'unknown';
        const args = JSON.parse(init.body || '{}');
        net.calls.push({ url: String(url), name, args, headers: init.headers });
        if (net.throwOn) throw new TypeError('fetch failed');
        return { ok: true, status: 200, text: async () => JSON.stringify(net.result) };
    });
    vi.unstubAllEnvs();
    vi.stubEnv('SUPABASE_URL', 'https://test-project.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key-under-test');
    vi.stubEnv('OTP_PEPPER', PEPPER);
});

afterEach(() => vi.unstubAllEnvs());

const verifyCall = () => net.calls.find((c) => c.name === 'auth_otp_verify');

describe('a correct code', () => {
    it('is hashed with the pepper, bound to the address, and handed to the database', async () => {
        const email = addr('good');
        const res = makeRes();

        await handler(post({ email: email.toUpperCase(), code: CODE }), res);

        expect(res.statusCode).toBe(200);
        expect(res.payload).toEqual({ verified: true });

        const call = verifyCall();
        expect(call.args.p_email).toBe(email);
        expect(call.args.p_max_attempts).toBe(3);
        // The server recomputes the digest; the client never sends one.
        expect(call.args.p_otp_hash).toBe(digest(email));
        expect(JSON.stringify(call.args)).not.toContain(CODE);
        expect(call.url).toBe('https://test-project.supabase.co/rest/v1/rpc/auth_otp_verify');
        expect(call.headers.Authorization).toBe('Bearer service-role-key-under-test');
    });

    it('binds the digest to the address, so one code cannot verify another account', async () => {
        const a = addr('alpha');
        const b = addr('bravo');

        await handler(post({ email: a, code: CODE }), makeRes());
        await handler(post({ email: b, code: CODE }), makeRes());

        const [first, second] = net.calls.map((c) => c.args.p_otp_hash);
        expect(first).not.toBe(second);
        expect(first).toMatch(/^[0-9a-f]{64}$/);
    });

    it('accepts the code as typed into six boxes, spaces and dashes included', async () => {
        const email = addr('spaced');
        await handler(post({ email, code: ` ${CODE.slice(0, 3)} ${CODE.slice(3)} ` }), makeRes());

        expect(verifyCall().args.p_otp_hash).toBe(digest(email));
    });
});

describe('a wrong or unusable code', () => {
    it('reports the attempts the database says are left', async () => {
        net.result = { ok: false, reason: 'invalid', remaining: 2 };
        const res = makeRes();

        await handler(post({ email: addr('wrong'), code: '111111' }), res);

        expect(res.statusCode).toBe(400);
        expect(res.payload).toMatchObject({ verified: false, reason: 'invalid', remaining: 2 });
        expect(res.payload.error).toMatch(/2 attempts left/i);
    });

    it('says "try again" rather than "wrong code" when the last attempt is spent', async () => {
        net.result = { ok: false, reason: 'locked', remaining: 0 };
        const res = makeRes();

        await handler(post({ email: addr('locked'), code: '111111' }), res);

        expect(res.statusCode).toBe(429);
        expect(res.payload).toMatchObject({ verified: false, reason: 'locked', resendAllowed: true });
        expect(res.payload.error).toMatch(/request a new code/i);
    });

    it('tells an expired code to be replaced, and unlocks the resend button', async () => {
        net.result = { ok: false, reason: 'expired' };
        const res = makeRes();

        await handler(post({ email: addr('old'), code: CODE }), res);

        expect(res.statusCode).toBe(400);
        expect(res.payload).toMatchObject({ reason: 'expired', resendAllowed: true });
        expect(res.payload.error).toMatch(/expired/i);
    });

    it('never calls a dead database a wrong answer', async () => {
        net.throwOn = true;
        const res = makeRes();

        await handler(post({ email: addr('dark'), code: CODE }), res);

        expect(res.statusCode).toBe(502);
        expect(res.payload).toMatchObject({ verified: false, reason: 'store_unavailable' });
        expect(res.payload.error).toMatch(/try again/i);
        expect(JSON.stringify(res.payload)).not.toMatch(/fetch failed|supabase|postgrest/i);
    });

    it('refuses malformed codes without touching the database at all', async () => {
        for (const code of ['', '12345', '1234567', 'abcdef', '000000', '42719x', undefined]) {
            const res = makeRes();
            await handler(post({ email: addr('shape'), code }), res);
            expect(res.statusCode, `must refuse ${String(code)}`).toBe(400);
        }
        expect(net.calls).toEqual([]);
    });

    it('refuses malformed addresses too', async () => {
        const res = makeRes();
        await handler(post({ email: 'nope', code: CODE }), res);
        expect(res.statusCode).toBe(400);
        expect(net.calls).toEqual([]);
    });

    it('does not treat an absent challenge as a special case', async () => {
        // `auth_otp_verify` answers the same way for "no row" and "wrong digits";
        // this asserts the handler keeps that shape rather than inventing one.
        net.result = { ok: false, reason: 'invalid', remaining: 0 };
        const res = makeRes();
        await handler(post({ email: addr('ghost'), code: CODE }), res);

        expect(res.statusCode).toBe(400);
        expect(res.payload.error).toMatch(/not right/i);
        expect(res.payload.error).not.toMatch(/no pending|not found|does not exist/i);
    });
});

describe('limits and transport', () => {
    it('answers CORS, and accepts only POST', async () => {
        const options = makeRes();
        await handler({ method: 'OPTIONS', headers: {} }, options);
        expect(options.statusCode).toBe(200);

        const get = makeRes();
        await handler({ method: 'GET', headers: {} }, get);
        expect(get.statusCode).toBe(405);
        expect(net.calls).toEqual([]);
    });

    it('stops the eleventh guess for one address inside the window', async () => {
        const email = addr('spray');
        const codes = [];
        for (let i = 0; i < 11; i += 1) {
            const res = makeRes();
            await handler({
                method: 'POST', body: { email, code: `11111${i % 10}` },
                headers: { 'x-forwarded-for': `10.1.1.${i}` },
            }, res);
            codes.push(res.statusCode);
        }
        // Ten guesses reach the database (each one is a legitimate attempt, which is
        // why the per-challenge ceiling of 3 in Postgres is the real protection);
        // the eleventh is refused before it can reach anything.
        expect(codes.slice(0, 10)).toEqual([200, 200, 200, 200, 200, 200, 200, 200, 200, 200]);
        expect(codes.at(-1)).toBe(429);
        expect(net.calls).toHaveLength(10);
    });

    it('refuses to answer at all until the pepper is configured', async () => {
        vi.stubEnv('OTP_PEPPER', '');
        const res = makeRes();

        await handler(post({ email: addr('pepper'), code: CODE }), res);

        expect(res.statusCode).toBe(500);
        expect(res.payload.error).toContain('OTP_PEPPER');
        expect(net.calls).toEqual([]);
    });

    it('is the mirror image of the sender: same digest, same rules', async () => {
        const email = addr('parity');
        // _otpStore is the module both endpoints use; verifying that the helper and
        // this handler agree is what stops a silently different pepper on one side.
        await handler(post({ email, code: CODE }), makeRes());
        expect(verifyCall().args.p_otp_hash).toBe(store.otpDigest(email, CODE));
    });
});
