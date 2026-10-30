import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    createClient: vi.fn(),
    getUser: vi.fn(),
    from: vi.fn(),
    studentSelect: vi.fn(),
    studentEq: vi.fn(),
    studentMaybeSingle: vi.fn(),
    insert: vi.fn(),
    feedbackSelect: vi.fn(),
    feedbackSingle: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
    createClient: mocks.createClient,
}));

const handler = (await import('../api/feedback.js')).default;
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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

function request(body = {}, headers = {}) {
    return { method: 'POST', body, headers };
}

beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('SUPABASE_URL', 'https://feedback-test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
    for (const mock of Object.values(mocks)) mock.mockReset();

    const studentQuery = {
        select: mocks.studentSelect,
        eq: mocks.studentEq,
        maybeSingle: mocks.studentMaybeSingle,
    };
    const feedbackQuery = {
        insert: mocks.insert,
        select: mocks.feedbackSelect,
        single: mocks.feedbackSingle,
    };
    mocks.studentSelect.mockReturnValue(studentQuery);
    mocks.studentEq.mockReturnValue(studentQuery);
    mocks.insert.mockReturnValue(feedbackQuery);
    mocks.feedbackSelect.mockReturnValue(feedbackQuery);

    mocks.studentMaybeSingle.mockResolvedValue({ data: { StudentId: 42 }, error: null });
    mocks.feedbackSingle.mockResolvedValue({ data: { FeedbackId: 101 }, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    mocks.from.mockImplementation((table) => (table === 'Students' ? studentQuery : feedbackQuery));
    mocks.createClient.mockReturnValue({
        auth: { getUser: mocks.getUser },
        from: mocks.from,
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

describe('POST /api/feedback', () => {
    it('requires a verified bearer token', async () => {
        const res = makeRes();
        await handler(request({ type: 'general', rating: 5, description: 'Useful feedback' }), res);
        expect(res.statusCode).toBe(401);
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it('validates category, rating, and description before database access', async () => {
        const cases = [
            { type: 'ai', rating: 5, description: 'Text' },
            { type: 'other', rating: 0, description: 'Text' },
            { type: 'other', rating: 6, description: 'Text' },
            { type: 'other', rating: 2.5, description: 'Text' },
            { type: 'other', rating: 5, description: 'x'.repeat(1001) },
            { type: 'other', rating: 5, description: '   ' },
        ];
        for (const body of cases) {
            const res = makeRes();
            await handler(request(body, { authorization: 'Bearer verified-token' }), res);
            expect(res.statusCode).toBe(400);
            expect(mocks.createClient).not.toHaveBeenCalled();
        }
    });

    it('derives StudentId from the verified Auth UID and inserts only submitted fields', async () => {
        const res = makeRes();
        await handler(request({
            type: 'other',
            rating: 4,
            description: '  A suggestion for the feedback form.  ',
            studentId: 999,
            name: 'untrusted',
        }, { authorization: 'Bearer verified-token' }), res);

        expect(res.statusCode).toBe(201);
        expect(mocks.getUser).toHaveBeenCalledWith('verified-token');
        expect(mocks.from).toHaveBeenNthCalledWith(1, 'Students');
        expect(mocks.studentSelect).toHaveBeenCalledWith('StudentId');
        expect(mocks.studentEq).toHaveBeenNthCalledWith(1, 'auth_uid', USER_ID);
        expect(mocks.studentEq).toHaveBeenNthCalledWith(2, 'role', 'student');
        expect(mocks.from).toHaveBeenNthCalledWith(2, 'Feedbacks');
        expect(mocks.insert).toHaveBeenCalledWith({
            Description: 'A suggestion for the feedback form.',
            Type: 'other',
            Rating: 4,
            StudentId: 42,
        });
        expect(res.payload).toEqual({ success: true, feedbackId: 101 });
        expect(res.headers['Cache-Control']).toContain('no-store');
        expect(res.headers.Vary).toBe('Authorization');
    });

    it('rejects sessions without a student profile', async () => {
        mocks.studentMaybeSingle.mockResolvedValue({ data: null, error: null });
        const res = makeRes();
        await handler(request({ type: 'general', rating: 3, description: 'Test' }, {
            authorization: 'Bearer verified-token',
        }), res);
        expect(res.statusCode).toBe(403);
        expect(mocks.insert).not.toHaveBeenCalled();
    });

    it('does not expose database errors to the browser', async () => {
        const providerError = Object.assign(new Error('PostgREST permission denied'), { code: '42501' });
        mocks.feedbackSingle.mockResolvedValue({ data: null, error: providerError });
        const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
        const res = makeRes();
        await handler(request({ type: 'bug', rating: 2, description: 'Something is broken.' }, {
            authorization: 'Bearer verified-token',
        }), res);
        expect(res.statusCode).toBe(503);
        expect(res.payload.error).toMatch(/could not save your feedback/i);
        expect(JSON.stringify(res.payload)).not.toContain('PostgREST');
        expect(logger).toHaveBeenCalledWith('[feedback] request failed:', providerError);
    });

    it('rejects unsupported methods without initializing Supabase', async () => {
        const res = makeRes();
        await handler({ method: 'GET', headers: {} }, res);
        expect(res.statusCode).toBe(405);
        expect(mocks.createClient).not.toHaveBeenCalled();
    });
});
