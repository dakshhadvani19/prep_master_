import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    createClient: vi.fn(),
    getUser: vi.fn(),
    rpc: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
    createClient: mocks.createClient,
}));

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

beforeEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.stubEnv('SUPABASE_URL', 'https://leaderboard-test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
    mocks.createClient.mockClear();
    mocks.createClient.mockImplementation(() => ({
        auth: { getUser: mocks.getUser },
        rpc: mocks.rpc,
    }));
    mocks.getUser.mockReset();
    mocks.rpc.mockReset();
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
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('uses the verified token user id, ignores a caller-supplied user id, and returns only the RPC result', async () => {
        mocks.getUser.mockResolvedValue({
            data: { user: { id: USER_A, email: 'student@example.com' } },
            error: null,
        });
        mocks.rpc.mockResolvedValue({
            data: [{
                subject_id: 1001,
                course_id: 1,
                semester: 2,
                subject_code: 'fixture-subject',
                subject_name: 'Fixture Subject',
                exam_type: 'Mid-Term 2',
                completed_at: '2026-10-27T10:00:00.000Z',
            }],
            error: null,
        });

        const res = makeRes();
        await handler(req(
            { action: 'load', userId: USER_B },
            { authorization: 'Bearer student-access-token' },
        ), res);

        expect(res.statusCode).toBe(200);
        expect(res.payload.completedSubjects).toHaveLength(1);
        expect(res.payload.completedSubjects[0].subject_id).toBe(1001);
        expect(mocks.getUser).toHaveBeenCalledWith('student-access-token');
        expect(mocks.rpc).toHaveBeenCalledWith('pm_leaderboard_completed_subjects', {
            p_user_id: USER_A,
        });
        expect(JSON.stringify(res.payload)).not.toContain(USER_B);
    });

    it('rejects unsupported methods without making a database request', async () => {
        const res = makeRes();
        await handler({ method: 'GET', headers: {} }, res);
        expect(res.statusCode).toBe(405);
        expect(mocks.createClient).not.toHaveBeenCalled();
    });
});
