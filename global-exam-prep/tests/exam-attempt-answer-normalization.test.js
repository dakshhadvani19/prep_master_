import { describe, expect, it } from 'vitest';
import {
    buildAttemptReviewRecord,
    buildExpiredExamAttemptPatch,
    getExamAttemptDeadline,
    isExpiredExamAttempt,
    normalizeAnswers,
} from '../api/exam-attempts.js';

describe('normal exam answer normalization', () => {
    it('stores missing MCQ selections as -1 while preserving theory text', () => {
        expect(normalizeAnswers({
            q1: 2,
            q2: null,
            q3: '',
            q4: 'Student written answer',
        }, ['q1', 'q2', 'q3', 'q5'])).toEqual({
            q1: 2,
            q2: -1,
            q3: -1,
            q4: 'Student written answer',
            q5: -1,
        });
    });

    it('rejects invalid option indexes as unattempted rather than converting them into a choice', () => {
        expect(normalizeAnswers({
            q1: 4,
            q2: -2,
            q3: '1',
            q4: 0,
        }, ['q1', 'q2', 'q3', 'q4'])).toEqual({
            q1: -1,
            q2: -1,
            q3: 1,
            q4: 0,
        });
    });
});


describe('expired normal exam finalization', () => {
    const startedAt = '2026-11-06T04:32:40.000Z';
    const deadline = Date.parse(startedAt) + 45 * 60 * 1000;
    const baseAttempt = {
        id: 'expired-attempt',
        status: 'in_progress',
        started_at: startedAt,
        time_minutes: 45,
        answer_revision: 4,
        total_marks: 2,
        questions: [
            { id: 'q1', type: 'mcq', options: ['A', 'B', 'C', 'D'] },
            { id: 'q2', type: 'mcq', options: ['A', 'B', 'C', 'D'] },
        ],
        answers: { q1: 2, q2: -1 },
    };

    it('expires only after the server-side exam deadline', () => {
        expect(getExamAttemptDeadline(baseAttempt)).toBe(deadline);
        expect(isExpiredExamAttempt(baseAttempt, deadline - 1)).toBe(false);
        expect(isExpiredExamAttempt(baseAttempt, deadline)).toBe(true);
        expect(isExpiredExamAttempt({ ...baseAttempt, status: 'submitted' }, deadline + 1)).toBe(false);
        expect(isExpiredExamAttempt({ ...baseAttempt, time_minutes: 0 }, deadline + 1)).toBe(false);
    });

    it('auto-submits the saved answers at the original deadline and calculates the objective score', () => {
        const patch = buildExpiredExamAttemptPatch(baseAttempt, { q1: 2, q2: 0 }, '2026-11-22T00:00:00.000Z');

        expect(patch).toMatchObject({
            answers: { q1: 2, q2: -1 },
            score: 1,
            status: 'auto_submitted',
            submitted_at: new Date(deadline).toISOString(),
            updated_at: '2026-11-22T00:00:00.000Z',
            attempted_count: 1,
            correct_count: 1,
            incorrect_count: 0,
            unattempted_count: 1,
            answer_revision: 5,
        });
    });

    it('preserves written theory answers without inventing an MCQ score', () => {
        const theoryAttempt = {
            ...baseAttempt,
            total_marks: 4,
            questions: [{ id: 't1', type: 'subjective', marks: 4 }],
            answers: { t1: 'My saved response' },
        };
        const patch = buildExpiredExamAttemptPatch(theoryAttempt, {}, '2026-11-22T00:00:00.000Z');

        expect(patch).toMatchObject({
            answers: { t1: 'My saved response' },
            score: null,
            attempted_count: 1,
            status: 'auto_submitted',
        });
        expect(patch).not.toHaveProperty('correct_count');
    });
});

describe('secure exam review record construction', () => {
    it('restores correct MCQ indexes from the private answer key after submission', () => {
        const review = buildAttemptReviewRecord({
            id: 'attempt-123',
            subject_code: '01ce0106',
            subject_name: 'Prompt Engineering',
            exam_type: 'mid-1',
            difficulty: 'medium',
            status: 'submitted',
            score: 1,
            total_marks: 3,
            questions: [
                { id: 'q1', type: 'mcq', text: 'Question 1', options: ['A', 'B', 'C', 'D'] },
                { id: 'q2', type: 'mcq', text: 'Question 2', options: ['A', 'B', 'C', 'D'] },
            ],
            answers: { q1: 1, q2: -1 },
            submitted_at: '2026-10-31T09:00:00.000Z',
        }, { q1: 2, q2: 0 });

        expect(review).toMatchObject({
            attemptId: 'attempt-123',
            subjectId: '01ce0106',
            subjectName: 'Prompt Engineering',
            type: 'objective',
            questions: [
                { id: 'q1', answer: 2 },
                { id: 'q2', answer: 0 },
            ],
            userAnswers: { q1: 1, q2: -1 },
        });
    });

    it('keeps missing answer-key entries unavailable instead of treating null as option A', () => {
        const review = buildAttemptReviewRecord({
            id: 'attempt-missing-key',
            questions: [{ id: 'q1', type: 'mcq', options: ['A', 'B', 'C', 'D'] }],
            answers: { q1: 0 },
        }, { q1: null });

        expect(review.questions[0].answer).toBeNull();
    });

    it('does not manufacture an answer key for theory questions', () => {
        const review = buildAttemptReviewRecord({
            id: 'attempt-theory',
            questions: [{ id: 't1', type: 'theory', text: 'Explain gradient descent.' }],
            answers: { t1: 'It is an optimization method.' },
        }, {});

        expect(review.type).toBe('theory');
        expect(review.questions[0]).not.toHaveProperty('answer');
        expect(review.userAnswers.t1).toBe('It is an optimization method.');
    });
});
