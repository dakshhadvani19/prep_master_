import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminCourseUploads from '../src/components/AdminCourseUploads.jsx';

const { getSession, TusUpload } = vi.hoisted(() => ({
    getSession: vi.fn(),
    TusUpload: vi.fn(),
}));

vi.mock('../src/supabase.js', () => ({
    supabase: { auth: { getSession } },
}));

vi.mock('tus-js-client', () => ({
    Upload: TusUpload,
}));

function response(body, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    };
}

const subject = { subjectId: 411, courseId: 90, semester: 2 };
const examTypes = ['mid-1', 'mid-2', 'ese'];

function uploadRecord(overrides = {}) {
    return {
        id: 'a5d1f0b6-647b-4652-a97b-3e3d4f8c6b12',
        subject_id: 411,
        course_id: 90,
        semester: 2,
        kind: 'question_bank',
        exam_type: 'mid-1',
        file_name: 'questions.csv',
        file_extension: 'csv',
        mime_type: 'text/csv',
        size_bytes: 512,
        object_path: 'subjects/411/questions.csv',
        status: 'validated_waiting_phase3',
        is_active: false,
        row_count: 2,
        word_count: 40,
        page_count: null,
        preview_text: 'MCQ · Example question',
        created_at: '2026-11-01T10:00:00Z',
        ...overrides,
    };
}

describe('AdminCourseUploads', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getSession.mockResolvedValue({
            data: { session: { access_token: 'admin-token' } },
            error: null,
        });
        TusUpload.mockImplementation(function MockTusUpload(file, options) {
            this.findPreviousUploads = vi.fn().mockResolvedValue([]);
            this.start = vi.fn(() => {
                options.onProgress(file.size, file.size);
                options.onSuccess();
            });
            this.resumeFromPreviousUpload = vi.fn();
        });
        vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
        vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
        globalThis.fetch = vi.fn().mockResolvedValue(response({ uploads: [] }));
    });

    it('loads and displays saved file history for the selected subject', async () => {
        const active = uploadRecord({
            kind: 'syllabus',
            exam_type: null,
            file_name: 'unit-syllabus.pdf',
            status: 'active',
            is_active: true,
            row_count: null,
            page_count: 6,
        });
        globalThis.fetch.mockResolvedValueOnce(response({ uploads: [active] }));

        render(<AdminCourseUploads subject={subject} examTypes={examTypes} />);

        expect(await screen.findAllByText('unit-syllabus.pdf')).toHaveLength(2);
        expect(screen.getByText('Active syllabus')).toBeTruthy();
        expect(globalThis.fetch).toHaveBeenCalledWith(
            '/api/admin-course-uploads?subjectId=411',
            expect.objectContaining({ method: 'GET' }),
        );
    });

    it('uploads a CSV question bank, validates it and leaves it pending Phase 3', async () => {
        const user = userEvent.setup();
        const record = uploadRecord({ status: 'uploading', preview_text: null, row_count: null, word_count: null });
        const validated = uploadRecord();
        globalThis.fetch
            .mockResolvedValueOnce(response({ uploads: [] }))
            .mockResolvedValueOnce(response({ upload: record }, 201))
            .mockResolvedValueOnce(response({ upload: validated }))
            .mockResolvedValueOnce(response({ uploads: [validated] }));
        const file = new File([
            'question_type,question,option_a,option_b,option_c,option_d,correct_option,model_answer,marks,difficulty,rubric\n'
            + 'mcq,"Sample question","A","B","C","D",A,,1,easy,',
        ], 'questions.csv', { type: 'text/csv' });

        render(<AdminCourseUploads subject={subject} examTypes={examTypes} />);
        await user.click(await screen.findByRole('tab', { name: /question bank/i }));
        await user.upload(screen.getByLabelText('Choose upload file'), file);
        await user.click(screen.getByRole('button', { name: /upload and validate/i }));

        expect(await screen.findByText(/Question-bank file validated and saved/i)).toBeTruthy();
        expect(screen.getByText('Validated · Phase 3 pending')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /publish/i })).toBeNull();
        const startCall = globalThis.fetch.mock.calls.find(call => call[1]?.body?.includes('"action":"start"'));
        expect(JSON.parse(startCall[1].body)).toMatchObject({
            action: 'start',
            subjectId: 411,
            courseId: 90,
            semester: 2,
            kind: 'question_bank',
            examType: 'mid-1',
        });
        expect(TusUpload).toHaveBeenCalledTimes(1);
        expect(TusUpload.mock.calls[0][1].metadata).toMatchObject({
            bucketName: 'admin-course-files',
            contentType: 'text/csv',
        });
    });

    it('requires a separate confirmation before the new syllabus replaces the active one', async () => {
        const user = userEvent.setup();
        const oldActive = uploadRecord({
            id: 'old-syllabus-id',
            kind: 'syllabus',
            exam_type: null,
            file_name: 'old-syllabus.pdf',
            status: 'active',
            is_active: true,
            row_count: null,
            page_count: 5,
        });
        const pending = uploadRecord({
            id: 'pending-syllabus-id',
            kind: 'syllabus',
            exam_type: null,
            file_name: 'new-syllabus.pdf',
            status: 'needs_confirmation',
            is_active: false,
            row_count: null,
            page_count: 7,
            preview_text: 'Extracted syllabus text.',
        });
        const afterConfirm = [
            { ...pending, status: 'active', is_active: true },
            { ...oldActive, status: 'superseded', is_active: false },
        ];
        globalThis.fetch
            .mockResolvedValueOnce(response({ uploads: [oldActive, pending] }))
            .mockResolvedValueOnce(response({ upload: afterConfirm[0] }))
            .mockResolvedValueOnce(response({ uploads: afterConfirm }));

        render(<AdminCourseUploads subject={subject} examTypes={examTypes} />);
        expect(await screen.findAllByText('old-syllabus.pdf')).toHaveLength(2);
        await user.click(screen.getByRole('button', { name: /review and confirm syllabus replacement/i }));
        expect(screen.getByText(/previous version stays in history/i)).toBeTruthy();
        await user.click(screen.getByRole('button', { name: /confirm replace active syllabus/i }));

        expect(await screen.findAllByText('new-syllabus.pdf')).toHaveLength(2);
        expect(screen.getByText('Previous version')).toBeTruthy();
        expect(screen.getByText('Active syllabus')).toBeTruthy();
        const confirmationCall = globalThis.fetch.mock.calls.find(call => call[1]?.body?.includes('"action":"confirm_syllabus"'));
        expect(JSON.parse(confirmationCall[1].body)).toEqual({
            action: 'confirm_syllabus',
            uploadId: 'pending-syllabus-id',
        });
    });

    it('keeps interrupted uploads visible and offers resume with the original file', async () => {
        const interrupted = uploadRecord({
            status: 'uploading',
            preview_text: null,
            row_count: null,
            word_count: null,
        });
        globalThis.fetch.mockResolvedValueOnce(response({ uploads: [interrupted] }));

        render(<AdminCourseUploads subject={subject} examTypes={examTypes} />);
        const historyItem = await screen.findByText('questions.csv');
        const card = historyItem.closest('article');
        expect(within(card).getByText('Upload incomplete')).toBeTruthy();
        expect(within(card).getByRole('button', { name: /check completed upload/i })).toBeTruthy();
        expect(within(card).getByText(/resume with the same file/i)).toBeTruthy();
    });
});

