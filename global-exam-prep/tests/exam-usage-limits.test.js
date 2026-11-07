import { describe, expect, it } from 'vitest';
import { buildTestsDataPaper } from '../api/exam-attempts.js';

describe('Public TestsData paper reconstruction', () => {
    it('reconstructs a 30-question MCQ paper from TestsData and its private answer key', () => {
        const questions = Array.from({ length: 30 }, (_, index) => ({
            id: 'q' + index, type: 'mcq', text: 'Question ' + index, options: ['A', 'B', 'C', 'D'],
        }));
        const answerKey = Object.fromEntries(questions.map((question, index) => [question.id, index % 4]));
        const paper = buildTestsDataPaper({
            sourceTestId: 9001, questions, options: [], answers: [], answerKey,
            privateQuestions: questions, totalMarks: 30, timeMinutes: 45,
        }, 'mcq');
        expect(paper.questions).toHaveLength(30);
        expect(paper.questions[7]).toMatchObject({
            id: 'q7', type: 'mcq', answer: 3, options: ['A', 'B', 'C', 'D'],
        });
        expect(paper.answerKey.q7).toBe(3);
        expect(paper.sourceTestId).toBe(9001);
    });

    it('rejects a saved MCQ paper with a missing private answer key', () => {
        expect(() => buildTestsDataPaper({
            sourceTestId: 9002,
            questions: [{ id: 'q1', text: 'Question?', options: ['A', 'B', 'C', 'D'] }],
            answerKey: {},
        }, 'mcq')).toThrow(/answer-key validation/i);
    });

    it('restores theory model answers and rubrics from the private attempt snapshot', () => {
        const privateQuestions = [{
            id: 't1', text: 'Explain gradient descent.', type: 'subjective',
            answer: 'An optimization method that updates parameters using the negative gradient.',
            rubric: [{ point: 'Explains gradient direction', marks: 2 }], marks: 4,
        }];
        const paper = buildTestsDataPaper({
            sourceTestId: 9003,
            questions: [{ id: 't1', text: 'Explain gradient descent.', type: 'subjective' }],
            privateQuestions, answers: [], answerKey: {}, totalMarks: 4, timeMinutes: 60,
        }, 'theory');
        expect(paper.questions[0].answer).toMatch(/negative gradient/);
        expect(paper.questions[0].rubric).toHaveLength(1);
    });
});
