import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    createClient: vi.fn(),
    getUser: vi.fn(),
    rpc: vi.fn(),
    from: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
    createClient: mocks.createClient,
}));

const handler = (await import('../api/dashboard-performance.js')).default;
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

function request(headers = {}) {
    return { method: 'GET', headers };
}

function validPerformance() {
    return {
        hasResults: true,
        dataBasis: 'verified_completed_attempts',
        summary: {
            totalAttempts: 2,
            totalScore: 42,
            totalMaxMarks: 60,
            overallPercentage: 70,
            subjectsAttempted: 1,
        },
        subjectPerformance: [{
            subjectId: 1001,
            subjectName: 'Data Structures',
            semester: 3,
            attempts: 2,
            totalScore: 42,
            totalMaxMarks: 60,
            percentage: 70,
        }],
        recentResults: [],
    };
}

beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('SUPABASE_URL', 'https://dashboard-test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');

    for (const mock of Object.values(mocks)) mock.mockReset();

    const query = { select: mocks.select, eq: mocks.eq, maybeSingle: mocks.maybeSingle };
    mocks.from.mockReturnValue(query);
    mocks.select.mockReturnValue(query);
    mocks.eq.mockReturnValue(query);
    mocks.maybeSingle.mockResolvedValue({ data: { StudentId: 14 }, error: null });

    mocks.getUser.mockResolvedValue({
        data: { user: { id: USER_A, email: 'student@example.com' } },
        error: null,
    });
    mocks.rpc.mockResolvedValue({ data: validPerformance(), error: null });
    mocks.createClient.mockReturnValue({
        auth: { getUser: mocks.getUser },
        from: mocks.from,
        rpc: mocks.rpc,
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

describe('GET /api/dashboard-performance', () => {
    it('requires a verified bearer session', async () => {
        const res = makeRes();
        await handler(request(), res);
        expect(res.statusCode).toBe(401);
        expect(res.payload.error).toMatch(/sign in again/i);
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('uses the authenticated user ID and returns only their aggregate summary', async () => {
        const res = makeRes();
        await handler(request({ authorization: 'Bearer verified-token' }), res);

        expect(res.statusCode).toBe(200);
        expect(mocks.getUser).toHaveBeenCalledWith('verified-token');
        expect(mocks.from).toHaveBeenCalledWith('Students');
        expect(mocks.eq).toHaveBeenNthCalledWith(1, 'auth_uid', USER_A);
        expect(mocks.eq).toHaveBeenNthCalledWith(2, 'role', 'student');
        expect(mocks.rpc).toHaveBeenCalledWith('pm_dashboard_performance_summary', {
            p_user_id: USER_A,
        });
        expect(res.payload.performance.summary.totalAttempts).toBe(2);
        expect(JSON.stringify(res.payload)).not.toContain(USER_A);
        expect(JSON.stringify(res.payload)).not.toContain(USER_B);
        expect(res.headers['Cache-Control']).toContain('no-store');
        expect(res.headers.Vary).toBe('Authorization');
    });

    it('does not allow a non-student or missing student profile', async () => {
        mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
        const res = makeRes();
        await handler(request({ authorization: 'Bearer valid-token' }), res);
        expect(res.statusCode).toBe(403);
        expect(res.payload.error).toMatch(/student profile is required/i);
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('hides provider errors while logging the original error server-side', async () => {
        const providerError = Object.assign(new Error('Postgres permission denied for private.leaderboard_attempt_results'), {
            code: '42501',
            details: 'Sensitive database details',
        });
        mocks.rpc.mockResolvedValue({ data: null, error: providerError });
        const logger = vi.spyOn(console, 'error').mockImplementation(() => {});

        const res = makeRes();
        await handler(request({ authorization: 'Bearer valid-token' }), res);
        expect(res.statusCode).toBe(503);
        expect(res.payload.error).toBe('We could not load your performance summary right now. Please try again.');
        expect(JSON.stringify(res.payload)).not.toContain('Postgres');
        expect(JSON.stringify(res.payload)).not.toContain('42501');
        expect(logger).toHaveBeenCalledWith('[dashboard-performance] request failed:', providerError);
    });

    it('rejects unsupported methods without initializing Supabase', async () => {
        const res = makeRes();
        await handler({ method: 'POST', headers: {} }, res);
        expect(res.statusCode).toBe(405);
        expect(mocks.createClient).not.toHaveBeenCalled();
    });
});
