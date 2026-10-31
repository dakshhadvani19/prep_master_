import { describe, expect, it } from 'vitest';
import {
    buildCanonicalRoomQuestions,
    makeSafeRoomQuestions,
    scoreRoomAnswers,
    shuffleRoomQuestions,
    toCanonicalAnswerArray,
} from '../src/utils/testRoomShuffle';

const fixture = [
    { id: 'q1', text: 'First question?', options: ['A0', 'A1', 'A2', 'A3'], answer: 0 },
    { id: 'q2', text: 'Second question?', options: ['B0', 'B1', 'B2', 'B3'], answer: 2 },
    { id: 'q3', text: 'Third question?', options: ['C0', 'C1', 'C2', 'C3'], answer: 3 },
];

describe('Test Room question/option shuffling', () => {
    it('preserves each option identity when question and option order change', () => {
        const canonical = buildCanonicalRoomQuestions(fixture);
        const shuffled = shuffleRoomQuestions(canonical, () => 0);

        expect(shuffled).toHaveLength(fixture.length);
        expect(new Set(shuffled.map((question) => question.canonicalIndex)).size).toBe(fixture.length);

        shuffled.forEach((question) => {
            const source = canonical[question.canonicalIndex];
            expect(question.options).toHaveLength(4);
            expect(new Set(question.options.map((option) => option.originalOptionIndex)).size).toBe(4);
            question.options.forEach((option) => {
                expect(option.text).toBe(source.options[option.originalOptionIndex].text);
            });
        });
    });

    it('does not expose answer keys in the participant-safe payload', () => {
        const safe = makeSafeRoomQuestions(fixture);
        expect(safe).toHaveLength(3);
        safe.forEach((question) => {
            expect(question).not.toHaveProperty('answer');
            expect(question).not.toHaveProperty('review');
            expect(question.options.every((option) => Number.isInteger(option.originalOptionIndex))).toBe(true);
        });
    });

    it('maps a correct option from its shuffled display label back to the original index', () => {
        const shuffled = shuffleRoomQuestions(fixture, () => 0);
        const displayedAnswers = {};

        shuffled.forEach((question) => {
            const source = fixture[question.canonicalIndex];
            const displayIndex = question.options.findIndex(
                (option) => option.originalOptionIndex === source.answer,
            );
            expect(displayIndex).toBeGreaterThanOrEqual(0);
            // The label position can differ, but the stored answer must be source index.
            displayedAnswers[question.canonicalIndex] = question.options[displayIndex].originalOptionIndex;
        });

        const canonicalAnswers = toCanonicalAnswerArray(displayedAnswers, fixture.length);
        expect(canonicalAnswers).toEqual([0, 2, 3]);
        expect(scoreRoomAnswers(fixture, canonicalAnswers)).toEqual({
            correct: 3,
            incorrect: 0,
            attempted: 3,
            unattempted: 0,
            points: 3,
            totalQuestions: 3,
        });
    });

    it('serializes missing participant choices as the -1 unanswered sentinel', () => {
        expect(toCanonicalAnswerArray({ 0: 2 }, fixture.length)).toEqual([2, -1, -1]);
        expect(scoreRoomAnswers(fixture, [2, -1, -1])).toEqual({
            correct: 1,
            incorrect: 0,
            attempted: 1,
            unattempted: 2,
            points: 1,
            totalQuestions: 3,
        });
    });

    it('scores unanswered questions without changing question count', () => {
        expect(scoreRoomAnswers(fixture, [0, -1, 1])).toEqual({
            correct: 1,
            incorrect: 1,
            attempted: 2,
            unattempted: 1,
            points: 1,
            totalQuestions: 3,
        });
    });
});
