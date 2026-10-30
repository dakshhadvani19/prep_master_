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

beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('SUPABASE_URL', 'https://feedback-test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key-under-test');
    for (const mock of Object.values(mocks)) mock.mockReset();

    mocks.from.mockImplementation((table) => {
        if (table === 'Students') return studentQuery;
        if (table === 'Feedbacks') return feedbackQuery;
        throw new Error('Unexpected table: ' + table);
    });
    mocks.studentSelect.mockReturnValue(studentQuery);
    mocks.studentEq.mockReturnValue(studentQuery);
    mocks.studentMaybeSingle.mockResolvedValue({ data: { StudentId: 42 }, error: null });
    mocks.insert.mockReturnValue(feedbackQuery);
    mocks.feedbackSelect.mockReturnValue(feedbackQuery);
    mocks.feedbackSingle.mockResolvedValue({ data: { FeedbackId: 101 }, error: null });
    mocks.getUser.mockResolvedValue({
        data: { user: { id: USER_ID } },
        error: null,
    });
    mocks.createClient.mockReturnValue({
        auth: { getUser: mocks.getUser },
        from: mocks.from,
    });
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe('POST /api/feedback', () => {
    it('rejects unsupported methods without initializing Supabase', async () => {
        const res = makeRes();
        await handler({ method: 'GET', headers: {} }, res);
        expect(res.statusCode).toBe(405);
        expect(mocks.createClient).not.toHaveBeenCalled();
    });

    it('requires a verified bearer session', async () => {
        const res = makeRes();
        await handler(request({ type: 'general', description: 'A useful comment.' }), res);
        expect(res.statusCode).toBe(401);
        expect(res.payload.error).toMatch(/session could not be verified/i);
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it('validates category and the 1,000-character description limit before creating the client', async () => {
        const headers = { authorization: 'Bearer verified-token' };
        for (const body of [
            { type: 'unknown', description: 'Text' },
            { type: 'other', description: 'x'.repeat(1001) },
            { type: 'other', description: '   ' },
            { type: 'ai quality', description: 'Text' },
        ]) {
            const res = makeRes();
            await handler(request(body, headers), res);
            expect(res.statusCode).toBe(400);
        }
        expect(mocks.createClient).not.toHaveBeenCalled();
    });

    it('maps older AI category submissions to Other', async () => {
        const res = makeRes();
        await handler(request(
            { type: 'ai', message: 'The AI answer was not relevant.' },
            { authorization: 'Bearer verified-token' },
        ), res);
        expect(res.statusCode).toBe(201);
        expect(mocks.insert).toHaveBeenCalledWith({
            Description: 'The AI answer was not relevant.',
            Type: 'other',
            StudentId: 42,
        });
    });

    it('derives StudentId from the verified Auth UID and inserts only Description, Type and StudentId', async () => {
        const res = makeRes();
        await handler(request({
            type: 'other',
            description: '  A suggestion for the feedback form.  ',
            StudentId: 999,
            FeedbackId: 123,
            rating: 4,
            subject: 'not stored',
            email: 'not stored',
            name: 'not stored',
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
            StudentId: 42,
        });
        expect(mocks.insert.mock.calls[0][0]).not.toHaveProperty('Rating');
        expect(mocks.insert.mock.calls[0][0]).not.toHaveProperty('FeedbackId');
        expect(res.payload).toEqual({ success: true, feedbackId: 101 });
        expect(res.headers['Cache-Control']).toContain('no-store');
        expect(res.headers.Vary).toBe('Authorization');
    });

    it('requires a student profile', async () => {
        mocks.studentMaybeSingle.mockResolvedValue({ data: null, error: null });
        const res = makeRes();
        await handler(request({ type: 'general', description: 'Test' }, {
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
        await handler(request({ type: 'bug', description: 'Something is broken.' }, {
            authorization: 'Bearer verified-token',
        }), res);
        expect(res.statusCode).toBe(503);
        expect(res.payload.error).toMatch(/could not save your feedback/i);
        expect(JSON.stringify(res.payload)).not.toContain('PostgREST');
        expect(logger).toHaveBeenCalledWith('[feedback] request failed:', providerError);
    });
});
