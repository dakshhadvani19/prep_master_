import { describe, expect, it } from 'vitest';
import {
    cleanQuestions,
    normalizeAnswers,
    normalizeCode,
    safeQuestions,
    scoreAnswers,
} from '../api/test-room-session.js';

const questions = Array.from({ length: 30 }, (_, index) => ({
    id: 'q' + index,
    text: 'Question ' + index,
    options: ['A', 'B', 'C', 'D'].map((text, originalOptionIndex) => ({ text, originalOptionIndex })),
    answer: index % 4,
}));

describe('Test Room server-side validation and scoring', () => {
    it('normalizes valid room codes and rejects ambiguous or malformed codes', () => {
        expect(normalizeCode(' abcde-fghjk ')).toBe('ABCDEFGHJK');
        expect(normalizeCode('ABCDEFGHIO')).toBeNull();
        expect(normalizeCode('ABC123')).toBeNull();
        expect(normalizeCode('')).toBeNull();
    });

    it('requires exactly 30 four-option MCQs with a valid canonical answer', () => {
        expect(cleanQuestions(questions)).toHaveLength(30);
        expect(() => cleanQuestions(questions.slice(0, 29))).toThrow(/exactly 30 MCQs/i);
        expect(() => cleanQuestions(questions.map((q, index) => index === 3 ? { ...q, answer: 4 } : q))).toThrow(/valid four-option MCQ/i);
        expect(() => cleanQuestions(questions.map((q, index) => index === 0 ? { ...q, options: ['only one'] } : q))).toThrow(/valid four-option MCQ/i);
    });

    it('never includes correct answers in the participant-safe question payload', () => {
        const safe = safeQuestions(cleanQuestions(questions));
        expect(safe).toHaveLength(30);
        safe.forEach((question) => {
            expect(question).not.toHaveProperty('answer');
            expect(question.options).toHaveLength(4);
            question.options.forEach((option) => {
                expect(option).not.toHaveProperty('answer');
                expect(option).toHaveProperty('originalOptionIndex');
            });
        });
    });

    it('normalizes malformed answers to unanswered rather than accepting invalid indexes', () => {
        expect(normalizeAnswers([0, 4, -1, '2', null], 5)).toEqual([0, null, null, null, null]);
        expect(normalizeAnswers([3], 3)).toEqual([3, null, null]);
    });

    it('scores only on the server-side canonical answer indexes', () => {
        expect(scoreAnswers([2, 1, 0], [2, null, 3])).toEqual({
            correct: 1,
            incorrect: 1,
            attempted: 2,
            unattempted: 1,
            points: 1,
            totalQuestions: 3,
        });
    });
});
