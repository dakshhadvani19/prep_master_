import { describe, expect, it } from 'vitest';
import {
    cleanQuestions,
    normalizeAnswers,
    normalizeCode,
    safeQuestions,
    scoreAnswers,
} from '../api/test-room-session.js';

function makeQuestions(count = 30) {
    return Array.from({ length: count }, (_, index) => ({
        id: 'q' + index,
        text: 'Question ' + index,
        options: ['A', 'B', 'C', 'D'].map((text, originalOptionIndex) => ({
            text: text + index,
            originalOptionIndex,
        })),
        answer: index % 4,
        reviewMetadata: { internal: true },
    }));
}

describe('Test Room API input and scoring helpers', () => {
    it('normalizes formatted codes and rejects ambiguous or invalid characters', () => {
        expect(normalizeCode(' abcd2-efgh3 ')).toBe('ABCD2EFGH3');
        expect(normalizeCode('ABCDEFGHI0')).toBeNull();
        expect(normalizeCode('ABCDEFGHI1')).toBeNull();
        expect(normalizeCode('ABCDOEFGH3')).toBeNull();
        expect(normalizeCode('too-short')).toBeNull();
        expect(normalizeCode(null)).toBeNull();
    });

    it('accepts a complete 30-question, four-option MCQ paper', () => {
        const result = cleanQuestions(makeQuestions());
        expect(result).toHaveLength(30);
        expect(result[0]).toMatchObject({
            id: 'q0',
            canonicalIndex: 0,
            answer: 0,
            options: [
                { text: 'A0', originalOptionIndex: 0 },
                { text: 'B0', originalOptionIndex: 1 },
                { text: 'C0', originalOptionIndex: 2 },
                { text: 'D0', originalOptionIndex: 3 },
            ],
        });
    });

    it('rejects invalid, missing, or coerced answer keys and malformed question options', () => {
        expect(() => cleanQuestions(makeQuestions(29))).toThrow(/exactly 30/);

        const missingAnswer = makeQuestions();
        missingAnswer[0].answer = null;
        expect(() => cleanQuestions(missingAnswer)).toThrow(/Question 1/);

        const stringAnswer = makeQuestions();
        stringAnswer[0].answer = '0';
        expect(() => cleanQuestions(stringAnswer)).toThrow(/Question 1/);

        const outOfRangeAnswer = makeQuestions();
        outOfRangeAnswer[0].answer = 4;
        expect(() => cleanQuestions(outOfRangeAnswer)).toThrow(/Question 1/);

        const duplicateOptionIndex = makeQuestions();
        duplicateOptionIndex[0].options[3].originalOptionIndex = 2;
        expect(() => cleanQuestions(duplicateOptionIndex)).toThrow(/unique/);
    });

    it('never includes correct answers or review metadata in the participant question payload', () => {
        const canonical = cleanQuestions(makeQuestions());
        const safe = safeQuestions(canonical);
        expect(safe).toHaveLength(30);
        expect(safe[0]).not.toHaveProperty('answer');
        expect(safe[0]).not.toHaveProperty('reviewMetadata');
        expect(safe[0].options[0]).toEqual({ text: 'A0', originalOptionIndex: 0 });
        expect(JSON.stringify(safe)).not.toMatch(/reviewMetadata|"answer":/);
    });

    it('normalizes malformed answer values to unanswered instead of granting a choice', () => {
        expect(normalizeAnswers([0, 3, -1, 4, '2', null, true], 7))
            .toEqual([0, 3, null, null, null, null, null]);
        expect(normalizeAnswers([1], 4)).toEqual([1, null, null, null]);
        expect(normalizeAnswers({ 0: 1 }, 2)).toEqual([null, null]);
    });

    it('scores the canonical option indexes and counts unanswered questions', () => {
        const key = [0, 1, 2, 3];
        expect(scoreAnswers(key, [0, 2, null, 3])).toEqual({
            correct: 2,
            incorrect: 1,
            attempted: 3,
            unattempted: 1,
            points: 2,
            totalQuestions: 4,
        });
    });
});
