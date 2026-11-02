import { beforeEach, describe, expect, it, vi } from 'vitest';
import process from 'node:process';
import handler from '../api/admin-subjects.js';
import { createClient } from '@supabase/supabase-js';
import { extractSyllabusText, validateUploadMetadata } from '../api/_lib/admin-course-upload-validation.js';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
vi.mock('../api/_lib/admin-course-upload-validation.js', () => ({
    UploadValidationError: class UploadValidationError extends Error {},
    extractSyllabusText: vi.fn(),
    validateUploadMetadata: vi.fn(({ fileName, mimeType, sizeBytes }) => ({
        fileName,
        extension: String(fileName).split('.').pop().toLowerCase(),
        mimeType,
        sizeBytes: Number(sizeBytes),
    })),
}));

function response() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(value) { this.body = value; return this; },
    };
}

function query(data) {
    const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
        then(resolve, reject) {
            return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
    };
    return builder;
}

function adminClient({ rpcData = null } = {}) {
    const fileBuffer = Buffer.from('valid syllabus text bytes');
    const rpc = vi.fn().mockResolvedValue({
        data: rpcData || {
            subject: {
                SubjectId: 44000935310201,
                SubjectName: 'Applied Computing',
                CourseId: 44,
                Semester: 1,
                isDepartmentalSubject: true,
            },
        },
        error: null,
    });
    const from = vi.fn(table => {
        if (table === 'Admins') return query({ AdminId: 7 });
        if (table === 'Courses') return query({ CourseId: 44, Sems: [1, 2, 3] });
        if (table === 'Subjects') return query({ SubjectId: 44000000000001 });
        throw new Error('Unexpected table: ' + table);
    });
    const download = vi.fn().mockResolvedValue({
        data: new Blob([fileBuffer], { type: 'application/pdf' }),
        error: null,
    });
    const remove = vi.fn().mockResolvedValue({ data: [], error: null });
    const client = {
        auth: {
            getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-auth-uid' } }, error: null }),
        },
        from,
        rpc,
        storage: { from: vi.fn(() => ({ download, remove })) },
    };
    return { client, rpc, from, download, remove, fileBuffer };
}

describe('admin subject management API', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.SUPABASE_URL = 'https://project.supabase.co';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-secret';
        extractSyllabusText.mockResolvedValue({
            text: 'Chapter 1. Fundamentals of computing. Data representation and algorithms. ' + 'Syllabus content. '.repeat(20),
            page_count: 4,
            word_count: 64,
        });
    });

    it('rejects unauthenticated subject mutations', async () => {
        const { client, rpc } = adminClient();
        client.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid') });
        createClient.mockReturnValue(client);
        const res = response();

        await handler({ method: 'POST', headers: {}, body: { action: 'add' } }, res);

        expect(res.statusCode).toBe(401);
        expect(rpc).not.toHaveBeenCalled();
    });

    it('extracts the syllabus and inserts a canonical subject id with private metadata', async () => {
        const { client, rpc, download, fileBuffer } = adminClient();
        createClient.mockReturnValue(client);
        validateUploadMetadata.mockReturnValue({
            fileName: 'applied-computing.pdf',
            extension: 'pdf',
            mimeType: 'application/pdf',
            sizeBytes: fileBuffer.length,
        });
        const objectPath = 'subjects/new/admin-auth-uid/123e4567-e89b-12d3-a456-426614174000.pdf';
        const res = response();

        await handler({
            method: 'POST',
            headers: { authorization: 'Bearer verified-admin-token' },
            body: {
                action: 'add',
                courseId: 44,
                semester: 1,
                subjectName: 'Applied Computing',
                subjectCode: '09CE3102',
                isDepartmentalSubject: true,
                subjectType: 'theory',
                fileName: 'applied-computing.pdf',
                mimeType: 'application/pdf',
                sizeBytes: fileBuffer.length,
                objectPath,
            },
        }, res);

        expect(res.statusCode).toBe(201);
        expect(res.body).toMatchObject({
            ok: true,
            subjectId: '44000935310201',
            subjectName: 'Applied Computing',
            courseId: 44,
            semester: 1,
            extractedWords: 64,
            pageCount: 4,
        });
        expect(download).toHaveBeenCalledWith(objectPath);
        expect(extractSyllabusText).toHaveBeenCalledWith({
            file_extension: 'pdf',
            mime_type: 'application/pdf',
        }, expect.any(Buffer));
        expect(rpc).toHaveBeenCalledWith('pm_admin_subject_create', expect.objectContaining({
            p_admin_auth_uid: 'admin-auth-uid',
            p_subject_id: '44000935310201',
            p_subject_name: 'Applied Computing',
            p_subject_code: '09CE3102',
            p_course_id: 44,
            p_semester: 1,
            p_is_departmental: true,
            p_subject_type: 'theory',
            p_syllabus_text: expect.stringContaining('Fundamentals of computing'),
            p_file_name: 'applied-computing.pdf',
            p_object_path: objectPath,
        }));
    });

    it('rejects a course-semester mismatch before downloading or writing', async () => {
        const { client, rpc, download } = adminClient();
        client.from.mockImplementation(table => (
            table === 'Admins' ? query({ AdminId: 7 }) : query(table === 'Courses' ? { CourseId: 44, Sems: [2, 3] } : [])
        ));
        createClient.mockReturnValue(client);
        const res = response();

        await handler({
            method: 'POST',
            headers: { authorization: 'Bearer verified-admin-token' },
            body: {
                action: 'add',
                courseId: 44,
                semester: 1,
                subjectName: 'Applied Computing',
                subjectCode: '09CE3102',
                subjectType: 'theory',
                fileName: 'applied-computing.pdf',
                mimeType: 'application/pdf',
                sizeBytes: 300,
                objectPath: 'subjects/new/admin-auth-uid/123e4567-e89b-12d3-a456-426614174000.pdf',
            },
        }, res);

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/semester does not belong/i);
        expect(download).not.toHaveBeenCalled();
        expect(rpc).not.toHaveBeenCalled();
    });

    it('removes an eligible subject and its stored file objects', async () => {
        const { client, rpc, remove } = adminClient();
        rpc.mockResolvedValue({
            data: {
                subject_id: 44000935310201,
                object_paths: ['subjects/44000935310201/syllabus.pdf'],
            },
            error: null,
        });
        createClient.mockReturnValue(client);
        const res = response();

        await handler({
            method: 'POST',
            headers: { authorization: 'Bearer verified-admin-token' },
            body: {
                action: 'remove',
                subjectId: 44000935310201,
                courseId: 44,
                semester: 1,
            },
        }, res);

        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({ ok: true, subjectId: '44000935310201', storageCleanupWarning: false });
        expect(rpc).toHaveBeenCalledWith('pm_admin_subject_remove', {
            p_admin_auth_uid: 'admin-auth-uid',
            p_subject_id: 44000935310201,
            p_course_id: 44,
            p_semester: 1,
        });
        expect(remove).toHaveBeenCalledWith(['subjects/44000935310201/syllabus.pdf']);
    });
});
