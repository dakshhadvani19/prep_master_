import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    createClient: vi.fn(),
    getUser: vi.fn(),
    rpc: vi.fn(),
    from: vi.fn(),
    adminSelect: vi.fn(),
    adminEq: vi.fn(),
    adminMaybeSingle: vi.fn(),
    subjectSelect: vi.fn(),
    subjectEq: vi.fn(),
    subjectMaybeSingle: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
    createClient: mocks.createClient,
}));

const handler = (await import('../api/leaderboard-rankings.js')).default;

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SUBJECT_ID = 18000494000201;

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

function validLeaderboard() {
    return {
        source: 'published',
        subject: { subjectId: SUBJECT_ID, subjectName: 'Fixture Subject', courseId: 18, semester: 2 },
        participantCount: 2,
        availableEntries: 2,
        entries: [{
            rank: 1, position: 1, studentId: 14, displayName: 'Student A',
            points: 25, maxPoints: 30, percentage: 83.33, totalTests: 1,
            topPercent: 50, isTop100: true,
        }],
        viewer: null,
        filters: { examType: null, difficulty: null, attemptType: null },
        pagination: { limit: 50, offset: 0, returned: 1, hasMore: false },
    };
}

function allowSubjectAccess() {
    mocks.rpc.mockImplementation(async (name) => {
        if (name === 'pm_leaderboard_completed_subjects') {
            return { data: [{ subject_id: SUBJECT_ID }], error: null };
        }
        if (name === 'pm_leaderboard_rankings') {
            return { data: validLeaderboard(), error: null };
        }
        throw new Error('Unexpected RPC: ' + name);
    });
}

beforeEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.stubEnv('SUPABASE_URL', 'https://leaderboard-test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');

    for (const mock of Object.values(mocks)) mock.mockReset();

    const adminQuery = {
        select: mocks.adminSelect,
        eq: mocks.adminEq,
        maybeSingle: mocks.adminMaybeSingle,
    };
    const subjectQuery = {
        select: mocks.subjectSelect,
        eq: mocks.subjectEq,
        maybeSingle: mocks.subjectMaybeSingle,
    };
    mocks.adminSelect.mockReturnValue(adminQuery);
    mocks.adminEq.mockReturnValue(adminQuery);
    mocks.subjectSelect.mockReturnValue(subjectQuery);
    mocks.subjectEq.mockReturnValue(subjectQuery);
    mocks.from.mockImplementation((table) => table === 'Admins' ? adminQuery : subjectQuery);

    mocks.adminMaybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.subjectMaybeSingle.mockResolvedValue({ data: { SubjectId: SUBJECT_ID }, error: null });

    mocks.createClient.mockReturnValue({
        auth: { getUser: mocks.getUser },
        rpc: mocks.rpc,
        from: mocks.from,
    });
    mocks.getUser.mockResolvedValue({
        data: { user: { id: USER_A, email: 'student@example.com' } },
        error: null,
    });
    allowSubjectAccess();
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe('POST /api/leaderboard-rankings', () => {
    it('requires a verified Supabase session', async () => {
        const res = makeRes();
        await handler(req({ subjectId: SUBJECT_ID }), res);

        expect(res.statusCode).toBe(401);
        expect(res.payload.error).toMatch(/sign in again/i);
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('uses the verified token user ID and checks exact subject access server-side', async () => {
        const res = makeRes();
        await handler(req({
            subjectId: String(SUBJECT_ID),
            userId: USER_B,
            studentAuthUid: USER_B,
            role: 'admin',
            examType: 'Mid-Term 2',
            difficulty: 'MEDIUM',
            attemptType: 'TEST_ROOM',
            limit: 25,
            offset: 0,
        }, {
            authorization: 'Bearer verified-student-token',
        }), res);

        expect(res.statusCode).toBe(200);
        expect(res.payload.leaderboard.source).toBe('published');
        expect(mocks.getUser).toHaveBeenCalledWith('verified-student-token');
        expect(mocks.from).toHaveBeenNthCalledWith(1, 'Subjects');
        expect(mocks.from).toHaveBeenNthCalledWith(2, 'Admins');
        expect(mocks.subjectSelect).toHaveBeenCalledWith('SubjectId');
        expect(mocks.subjectEq).toHaveBeenCalledWith('SubjectId', SUBJECT_ID);
        expect(mocks.adminSelect).toHaveBeenCalledWith('AdminId');
        expect(mocks.adminEq).toHaveBeenCalledWith('auth_uid', USER_A);
        expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'pm_leaderboard_completed_subjects', {
            p_user_id: USER_A,
        });
        expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'pm_leaderboard_rankings', {
            p_subject_id: SUBJECT_ID,
            p_user_id: USER_A,
            p_exam_type: 'Mid-Term 2',
            p_difficulty: 'medium',
            p_attempt_type: 'test_room',
            p_limit: 25,
            p_offset: 0,
        });
        expect(JSON.stringify(res.payload)).not.toContain(USER_A);
        expect(JSON.stringify(res.payload)).not.toContain(USER_B);
        expect(res.headers['Cache-Control']).toMatch(/no-store/);
        expect(res.headers.Vary).toBe('Authorization');
    });

    it('normalizes All filters and applies safe pagination defaults', async () => {
        const res = makeRes();
        await handler(req({
            subjectId: SUBJECT_ID,
            examType: 'all',
            difficulty: 'ALL',
            attemptType: '',
        }, { authorization: 'Bearer token' }), res);

        expect(res.statusCode).toBe(200);
        expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'pm_leaderboard_rankings', {
            p_subject_id: SUBJECT_ID,
            p_user_id: USER_A,
            p_exam_type: null,
            p_difficulty: null,
            p_attempt_type: null,
            p_limit: 50,
            p_offset: 0,
        });
    });

    it('rejects unsupported filters before making database calls', async () => {
        const res = makeRes();
        await handler(req({
            subjectId: SUBJECT_ID,
            difficulty: 'impossible',
        }, { authorization: 'Bearer token' }), res);

        expect(res.statusCode).toBe(400);
        expect(res.payload.error).toMatch(/difficulty/i);
        expect(mocks.createClient).not.toHaveBeenCalled();
    });

    it('rejects pagination outside the configured bounds', async () => {
        const res = makeRes();
        await handler(req({
            subjectId: SUBJECT_ID,
            limit: 101,
        }, { authorization: 'Bearer token' }), res);

        expect(res.statusCode).toBe(400);
        expect(res.payload.error).toMatch(/page size/i);
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('returns a friendly not-found message for a subject outside the catalog', async () => {
        mocks.subjectMaybeSingle.mockResolvedValue({ data: null, error: null });
        const res = makeRes();
        await handler(req({ subjectId: SUBJECT_ID }, { authorization: 'Bearer token' }), res);

        expect(res.statusCode).toBe(404);
        expect(res.payload.error).toMatch(/subject is no longer available/i);
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('blocks a student who has not completed the requested subject, regardless of UI state or caller claims', async () => {
        mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
        const res = makeRes();
        await handler(req({
            subjectId: SUBJECT_ID,
            userId: USER_A,
            role: 'admin',
        }, { authorization: 'Bearer verified-student-token' }), res);

        expect(res.statusCode).toBe(403);
        expect(res.payload.error).toMatch(/complete an exam in this subject/i);
        expect(mocks.rpc).toHaveBeenCalledTimes(1);
        expect(mocks.rpc).toHaveBeenCalledWith('pm_leaderboard_completed_subjects', {
            p_user_id: USER_A,
        });
    });

    it('allows administrator preview only when public.Admins confirms the caller', async () => {
        mocks.adminMaybeSingle.mockResolvedValue({ data: { AdminId: 7 }, error: null });
        const res = makeRes();
        await handler(req({ subjectId: SUBJECT_ID }, { authorization: 'Bearer verified-admin-token' }), res);

        expect(res.statusCode).toBe(200);
        expect(mocks.rpc).toHaveBeenCalledTimes(1);
        expect(mocks.rpc).toHaveBeenCalledWith('pm_leaderboard_rankings', {
            p_subject_id: SUBJECT_ID,
            p_user_id: USER_A,
            p_exam_type: null,
            p_difficulty: null,
            p_attempt_type: null,
            p_limit: 50,
            p_offset: 0,
        });
    });

    it('hides provider/database errors from the user but logs the actual error server-side', async () => {
        const providerError = Object.assign(new Error('PostgREST private schema permission denied'), {
            code: '42501',
            details: 'private.leaderboard_attempt_results',
        });
        mocks.rpc.mockImplementation(async (name) => (
            name === 'pm_leaderboard_completed_subjects'
                ? { data: [{ subject_id: SUBJECT_ID }], error: null }
                : { data: null, error: providerError }
        ));
        const logger = vi.spyOn(console, 'error').mockImplementation(() => {});

        const res = makeRes();
        await handler(req({ subjectId: SUBJECT_ID }, { authorization: 'Bearer token' }), res);

        expect(res.statusCode).toBe(503);
        expect(res.payload.error).toBe('We could not load this leaderboard right now. Please try again.');
        expect(JSON.stringify(res.payload)).not.toContain('PostgREST');
        expect(JSON.stringify(res.payload)).not.toContain('42501');
        expect(logger).toHaveBeenCalledWith('[leaderboard-rankings] request failed:', providerError);
    });

    it('rejects unsupported methods without initializing Supabase', async () => {
        const res = makeRes();
        await handler({ method: 'GET', headers: {} }, res);
        expect(res.statusCode).toBe(405);
        expect(mocks.createClient).not.toHaveBeenCalled();
    });
});
