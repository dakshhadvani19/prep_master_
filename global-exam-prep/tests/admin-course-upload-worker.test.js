import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../api/admin-course-upload-worker.js';
import { createClient } from '@supabase/supabase-js';
import { validateCourseUpload } from '../api/_lib/admin-course-upload-validation.js';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
vi.mock('../api/_lib/admin-course-upload-validation.js', () => ({
    UploadValidationError: class UploadValidationError extends Error {},
    validateCourseUpload: vi.fn(),
}));

function response() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(value) { this.body = value; return this; },
    };
}

describe('admin course upload background worker', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.SUPABASE_URL = 'https://project.supabase.co';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-secret';
        process.env.ADMIN_COURSE_UPLOAD_WORKER_SECRET = 'worker-secret-for-tests';
    });

    it('rejects calls without the private worker token', async () => {
        const res = response();
        await handler({ method: 'POST', headers: {}, body: {} }, res);
        expect(res.statusCode).toBe(401);
        expect(createClient).not.toHaveBeenCalled();
    });

    it('claims, validates and acknowledges one queued file', async () => {
        const job = {
            id: 'a5d1f0b6-647b-4652-a97b-3e3d4f8c6b12',
            object_path: 'subjects/411/questions.csv',
            file_name: 'questions.csv',
            file_extension: 'csv',
            mime_type: 'text/csv',
            size_bytes: 15,
            kind: 'question_bank',
            status: 'processing',
            queue_message_id: 77,
            processing_attempts: 1,
        };
        const rpc = vi.fn()
            .mockResolvedValueOnce({ data: job, error: null })
            .mockResolvedValueOnce({ data: { ...job, status: 'validated_waiting_phase3' }, error: null });
        const download = vi.fn().mockResolvedValue({
            data: new Blob(['question,answer'], { type: 'text/csv' }),
            error: null,
        });
        createClient.mockReturnValue({
            rpc,
            storage: { from: vi.fn(() => ({ download, remove: vi.fn() })) },
        });
        validateCourseUpload.mockResolvedValue({
            validation_details: { csv_rows: 1 },
            preview_text: 'Question preview',
            page_count: null,
            word_count: 2,
            row_count: 1,
        });

        const res = response();
        await handler({
            method: 'POST',
            headers: { 'x-course-upload-worker-token': 'worker-secret-for-tests' },
            body: {},
        }, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.processed).toBe(true);
        expect(res.body.status).toBe('validated_waiting_phase3');
        expect(rpc).toHaveBeenNthCalledWith(1, 'pm_admin_course_upload_job_claim');
        expect(rpc).toHaveBeenNthCalledWith(2, 'pm_admin_course_upload_job_finish', expect.objectContaining({
            p_upload_id: job.id,
            p_message_id: 77,
            p_status: 'validated_waiting_phase3',
            p_row_count: 1,
        }));
    });
});
