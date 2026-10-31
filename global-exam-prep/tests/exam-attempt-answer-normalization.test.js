import { describe, expect, it } from 'vitest';
import { buildAttemptReviewRecord, normalizeAnswers } from '../api/exam-attempts.js';

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
