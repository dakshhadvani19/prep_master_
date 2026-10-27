import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const handler = (await import('../api/leaderboard-filters.js')).default;

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function makeRes() {
    return {
        statusCode: 0,
        payload: null,
        headers: {},
        setHeader(key, value) { this.headers[key] = value; },
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.payload = payload; return this; },
        end() { return this; },
    };
}

function req(body = {}, headers = {}) {
    return { method: 'POST', body, headers };
}

function jsonResponse(value, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
        headers: {
            get(name) { return String(name).toLowerCase() === 'content-type' ? 'application/json' : null; },
        },
        text: async () => JSON.stringify(value),
    };
}

beforeEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.stubEnv('SUPABASE_URL', 'https://leaderboard-test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe('POST /api/leaderboard-filters', () => {
    it('requires a verified signed-in user', async () => {
        const res = makeRes();
        await handler(req({ action: 'load' }), res);
        expect(res.statusCode).toBe(401);
        expect(res.payload.error).toMatch(/sign in/i);
    });

    it('uses the verified token user id, ignores a caller-supplied user id, and returns only the RPC result', async () => {
        const calls = [];
        globalThis.fetch = vi.fn(async (url, init = {}) => {
            const path = new URL(String(url)).pathname;
            calls.push({ path, init });
            if (path === '/auth/v1/user') {
                return jsonResponse({ id: USER_A, email: 'student@example.com', user_metadata: {} });
            }
            if (path === '/rest/v1/rpc/pm_leaderboard_completed_subjects') {
                return jsonResponse([{
                    subject_id: 1001,
                    course_id: 1,
                    semester: 2,
                    subject_code: 'fixture-subject',
                    subject_name: 'Fixture Subject',
                    exam_type: 'Mid-Term 2',
                    completed_at: '2026-10-27T10:00:00.000Z',
                }]);
            }
            throw new Error('Unexpected request: ' + path);
        });

        const res = makeRes();
        await handler(req(
            { action: 'load', userId: USER_B },
            { authorization: 'Bearer student-access-token' },
        ), res);

        expect(res.statusCode).toBe(200);
        expect(res.payload.completedSubjects).toHaveLength(1);
        expect(res.payload.completedSubjects[0].subject_id).toBe(1001);

        const rpc = calls.find((call) => call.path === '/rest/v1/rpc/pm_leaderboard_completed_subjects');
        expect(rpc).toBeTruthy();
        expect(JSON.parse(rpc.init.body)).toEqual({ p_user_id: USER_A });
        expect(rpc.init.headers.Authorization).toBe('Bearer test-service-role-key');
        expect(JSON.stringify(res.payload)).not.toContain(USER_B);
    });

    it('rejects unsupported methods without making a database request', async () => {
        const fetch = vi.fn();
        globalThis.fetch = fetch;
        const res = makeRes();
        await handler({ method: 'GET', headers: {} }, res);
        expect(res.statusCode).toBe(405);
        expect(fetch).not.toHaveBeenCalled();
    });
});
