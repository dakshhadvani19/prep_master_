import { beforeEach, describe, expect, it, vi } from 'vitest';
import process from 'node:process';
import handler from '../api/exam-attempts.js';
import { createClient } from '@supabase/supabase-js';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

function response() {
    return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; },
        json(value) { this.body = value; return this; }, end() { return this; }, setHeader() {} };
}

function clientMock() {
    const subject = { SubjectId: 411, SubjectName: 'Data Structures', CourseId: 90, Semester: 2, isDepartmentalSubject: false };
    const setId = 'set-30';
    const bank = {
        id: 'bank-1', source_file_name: 'approved.csv',
        sets: [{ id: setId, set_number: 1, question_count: 30, is_complete: true }],
        questions: Array.from({ length: 30 }, (_, index) => ({
            id: 'q-' + index, set_id: setId, sort_order: index + 1, question_type: 'mcq',
            question_text: 'Question ' + index, options: ['A', 'B', 'C', 'D'],
            correct_option_index: index % 4, marks: 1, difficulty: 'medium', validation_status: 'valid',
        })),
    };
    const rpc = vi.fn(async (name, args) => {
        if (name === 'pm_student_question_bank_candidates') return { data: { banks: [bank] }, error: null };
        if (name === 'pm_private_exam_data') return { data: { id: 'attempt-uuid', saved: args.p_payload }, error: null };
        if (name === 'pm_private_exam_tag_subject') return { data: { ok: true }, error: null };
        return { data: null, error: new Error('Unexpected RPC ' + name) };
    });
    const client = {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'student-uid' } }, error: null }) },
        from: vi.fn(() => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: subject, error: null }) })),
        rpc,
    };
    return { client, rpc };
}

describe('student published question-bank API', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.SUPABASE_URL = 'https://project.supabase.co';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-secret';
    });

    it('saves answer keys privately and never returns them in the browser payload', async () => {
        const { client, rpc } = clientMock();
        createClient.mockReturnValue(client);
        const res = response();
        await handler({ method: 'POST', url: '/api/exam-attempts', headers: { authorization: 'Bearer student-token' },
            body: { action: 'create_from_question_bank', catalogSubjectId: 411, examType: 'mid-2', difficulty: 'medium' } }, res);
        expect(res.statusCode).toBe(201);
        expect(res.body.questions).toHaveLength(30);
        expect(res.body.questions.every(question => !('answer' in question))).toBe(true);
        const createCall = rpc.mock.calls.find(([name]) => name === 'pm_private_exam_data');
        expect(Object.keys(createCall[1].p_payload.answer_key)).toHaveLength(30);
        expect(rpc).toHaveBeenCalledWith('pm_private_exam_tag_subject', { p_attempt_id: 'attempt-uuid', p_user_id: 'student-uid', p_subject_id: 411 });
    });

    it('returns not-found and does not create an attempt when no complete set exists', async () => {
        const { client, rpc } = clientMock();
        rpc.mockImplementation(async name => name === 'pm_student_question_bank_candidates'
            ? { data: { banks: [] }, error: null } : { data: null, error: null });
        createClient.mockReturnValue(client);
        const res = response();
        await handler({ method: 'POST', url: '/api/exam-attempts', headers: { authorization: 'Bearer student-token' },
            body: { action: 'create_from_question_bank', catalogSubjectId: 411, examType: 'mid-2', difficulty: 'medium' } }, res);
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ found: false });
        expect(rpc).not.toHaveBeenCalledWith('pm_private_exam_data', expect.anything());
    });
});
