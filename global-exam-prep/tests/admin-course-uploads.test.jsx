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
        expect(screen.getByText('Validated · Ready to parse')).toBeTruthy();
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


    it('reviews parsed questions and publishes only after generated rubrics are approved', async () => {
        const user = userEvent.setup();
        const upload = uploadRecord({
            status: 'needs_review',
            kind: 'question_bank',
            file_name: 'review-me.csv',
        });
        const review = {
            bank: {
                id: 'bank-review-id',
                source_upload_id: upload.id,
                source_file_name: 'review-me.csv',
                subject_id: 411,
                course_id: 90,
                semester: 2,
                exam_type: 'mid-1',
                status: 'review',
                total_questions: 2,
                valid_questions: 1,
                rejected_questions: 0,
                warning_questions: 1,
                mcq_questions: 1,
                theory_questions: 1,
            },
            questions: [
                {
                    id: 'question-mcq', sort_order: 1, question_type: 'mcq',
                    question_text: 'Which structure follows FIFO?',
                    options: ['Stack', 'Queue', 'Tree', 'Graph'], correct_option_index: 1,
                    model_answer: '', marks: 1, difficulty: 'easy', rubric: '',
                    rubric_generated: false, rubric_reviewed: false, source_location: { row: 2 },
                    validation_status: 'valid', validation_errors: [], include_in_publish: true,
                },
                {
                    id: 'question-theory', sort_order: 2, question_type: 'theory',
                    question_text: 'Explain FIFO and LIFO.', options: [], correct_option_index: null,
                    model_answer: 'FIFO is first in first out.', marks: 4, difficulty: 'medium',
                    rubric: 'Generated draft rubric.', rubric_generated: true, rubric_reviewed: false,
                    source_location: { row: 3 }, validation_status: 'warning', validation_errors: [],
                    include_in_publish: true,
                },
            ],
        };
        const savedReview = {
            ...review,
            bank: { ...review.bank, valid_questions: 2, warning_questions: 0 },
            questions: review.questions.map(q => q.id === 'question-theory'
                ? { ...q, rubric_reviewed: true, validation_status: 'valid' } : q),
        };
        globalThis.fetch
            .mockResolvedValueOnce(response({ uploads: [upload] }))
            .mockResolvedValueOnce(response({ review }))
            .mockResolvedValueOnce(response({ uploads: [upload] }))
            .mockResolvedValueOnce(response({ review: savedReview }))
            .mockResolvedValueOnce(response({ published: {
                bank_id: review.bank.id, published_questions: 2,
                sets: [{ set_number: 1, question_count: 1, is_complete: false }],
            } }))
            .mockResolvedValueOnce(response({ uploads: [{ ...upload, status: 'published' }] }));

        render(<AdminCourseUploads subject={subject} examTypes={examTypes} />);
        await user.click(await screen.findByRole('button', { name: /continue question review/i }));
        expect(await screen.findByText(/Subject 411 · Course 90 · Semester 2/i)).toBeTruthy();
        const publishButton = screen.getByRole('button', { name: /publish 2 approved questions/i });
        expect(publishButton.disabled).toBe(true);
        await user.click(screen.getByRole('checkbox', { name: /i reviewed and approve this generated rubric/i }));
        expect(publishButton.disabled).toBe(false);
        await user.click(publishButton);

        expect(await screen.findByText(/Published 2 questions/i)).toBeTruthy();
        expect(screen.getByText(/1 incomplete MCQ short set/i)).toBeTruthy();
        const saveCall = globalThis.fetch.mock.calls.find(call => call[1]?.body?.includes('"action":"save_review"'));
        const publishCall = globalThis.fetch.mock.calls.find(call => call[1]?.body?.includes('"action":"publish_question_bank"'));
        expect(saveCall).toBeTruthy();
        expect(publishCall).toBeTruthy();
        expect(screen.getByText('Published question bank')).toBeTruthy();
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

