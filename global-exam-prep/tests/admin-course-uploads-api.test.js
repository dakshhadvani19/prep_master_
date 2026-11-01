import { beforeEach, describe, expect, it, vi } from 'vitest';
import process from 'node:process';
import handler from '../api/admin-course-uploads.js';
import { createClient } from '@supabase/supabase-js';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

function createResponse() {
    return {
        statusCode: 200,
        body: null,
        headers: {},
        status(code) { this.statusCode = code; return this; },
        json(value) { this.body = value; return this; },
        end() { return this; },
        setHeader(name, value) { this.headers[name] = value; },
    };
}

function clientMock({ adminRow = { AdminId: 1, isSuperAdmin: true }, subjectRow = {
    SubjectId: 411,
    SubjectName: 'Data Structures',
    CourseId: 90,
    Semester: 2,
    isDepartmentalSubject: false,
} } = {}) {
    const rpc = vi.fn().mockImplementation(async (_name, args) => ({
        data: {
            id: 'a5d1f0b6-647b-4652-a97b-3e3d4f8c6b12',
            object_path: args.p_object_path,
            file_name: args.p_file_name,
            file_extension: args.p_file_extension,
            mime_type: args.p_mime_type,
            size_bytes: args.p_size_bytes,
            status: 'uploading',
        },
        error: null,
    }));
    const client = {
        auth: {
            getUser: vi.fn().mockResolvedValue({
                data: { user: { id: 'admin-auth-uid' } },
                error: null,
            }),
        },
        from: vi.fn(table => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
                data: table === 'Admins' ? adminRow : subjectRow,
                error: null,
            }),
        })),
        rpc,
    };
    return { client, rpc };
}

describe('admin course upload API security and metadata', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.SUPABASE_URL = 'https://project.supabase.co';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-secret';
    });

    it('rejects requests without a verified Supabase session', async () => {
        const { client } = clientMock();
        client.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid') });
        createClient.mockReturnValue(client);

        const res = createResponse();
        await handler({
            method: 'POST',
            url: '/api/admin-course-uploads',
            headers: { authorization: 'Bearer invalid-token' },
            body: { action: 'start' },
        }, res);

        expect(res.statusCode).toBe(401);
        expect(res.body.error).toMatch(/session is invalid or expired/i);
        expect(client.from).not.toHaveBeenCalled();
    });

    it('rejects authenticated users who do not have a public Admins row', async () => {
        const { client, rpc } = clientMock({ adminRow: null });
        createClient.mockReturnValue(client);

        const res = createResponse();
        await handler({
            method: 'POST',
            url: '/api/admin-course-uploads',
            headers: { authorization: 'Bearer student-token' },
            body: { action: 'start' },
        }, res);

        expect(res.statusCode).toBe(403);
        expect(res.body.error).toMatch(/Only verified administrators/i);
        expect(rpc).not.toHaveBeenCalled();
    });

    it('creates a unique staged upload path only after verifying the catalog subject', async () => {
        const { client, rpc } = clientMock();
        createClient.mockReturnValue(client);

        const res = createResponse();
        await handler({
            method: 'POST',
            url: '/api/admin-course-uploads',
            headers: { authorization: 'Bearer verified-admin-token' },
            body: {
                action: 'start',
                subjectId: 411,
                courseId: 90,
                semester: 2,
                kind: 'syllabus',
                fileName: 'semester-two-syllabus.pdf',
                mimeType: 'application/pdf',
                sizeBytes: 4096,
            },
        }, res);

        expect(res.statusCode).toBe(201);
        expect(rpc).toHaveBeenCalledWith('pm_admin_course_upload_create', expect.objectContaining({
            p_admin_auth_uid: 'admin-auth-uid',
            p_subject_id: 411,
            p_course_id: 90,
            p_semester: 2,
            p_kind: 'syllabus',
            p_exam_type: null,
            p_file_extension: 'pdf',
            p_mime_type: 'application/pdf',
            p_size_bytes: 4096,
        }));
        const path = rpc.mock.calls[0][1].p_object_path;
        expect(path).toMatch(/^subjects\/411\/[0-9a-f-]+\.pdf$/i);
        expect(res.body.upload.object_path).toBe(path);
    });

    it('rejects catalog mismatches and unsupported question exam types before writing', async () => {
        const { client, rpc } = clientMock({
            subjectRow: {
                SubjectId: 411,
                SubjectName: 'Data Structures',
                CourseId: 91,
                Semester: 2,
                isDepartmentalSubject: true,
            },
        });
        createClient.mockReturnValue(client);

        const res = createResponse();
        await handler({
            method: 'POST',
            url: '/api/admin-course-uploads',
            headers: { authorization: 'Bearer verified-admin-token' },
            body: {
                action: 'start',
                subjectId: 411,
                courseId: 90,
                semester: 2,
                kind: 'question_bank',
                examType: 'ese',
                fileName: 'questions.csv',
                mimeType: 'text/csv',
                sizeBytes: 200,
            },
        }, res);

        expect(res.statusCode).toBe(400);
        expect(rpc).not.toHaveBeenCalled();
    });

    it('rejects unsupported request methods', async () => {
        const res = createResponse();
        await handler({ method: 'PUT', headers: {}, url: '/api/admin-course-uploads' }, res);
        expect(res.statusCode).toBe(405);
    });
});

