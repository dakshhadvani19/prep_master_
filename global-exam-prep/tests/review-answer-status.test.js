import { describe, expect, it } from 'vitest';
import {
    filterReviewQuestionIndices,
    getReviewOptionState,
    getReviewStatus,
    isUnansweredAnswer,
} from '../src/utils/reviewAnswerStatus';

const questions = [
    { id: 'q1', answer: 0 },
    { id: 'q2', answer: 1 },
    { id: 'q3', answer: 2 },
    { id: 'q4', answer: 3 },
    { id: 'q5', answer: 0 },
];
const answers = {
    q1: 0,
    q2: 2,
    q3: -1,
    q4: null,
    q5: '',
};

describe('review answer status', () => {
    it('treats -1, null, undefined, and blank values as unattempted', () => {
        expect([-1, '-1', null, undefined, ''].every(isUnansweredAnswer)).toBe(true);
        expect(isUnansweredAnswer(0)).toBe(false);
    });

    it('does not label an unattempted response as wrong', () => {
        expect(getReviewStatus(questions[2], answers, true)).toBe('unattempted');
        expect(getReviewStatus(questions[3], answers, true)).toBe('unattempted');
        expect(getReviewStatus(questions[4], answers, true)).toBe('unattempted');
    });

    it('distinguishes a selected wrong option from the correct option', () => {
        expect(getReviewStatus(questions[1], answers, true)).toBe('wrong');
        expect(getReviewOptionState(2, 1, 2)).toEqual({
            isCorrect: false,
            isUserChoice: true,
            isWrongChoice: true,
        });
        expect(getReviewOptionState(1, 1, 2)).toEqual({
            isCorrect: true,
            isUserChoice: false,
            isWrongChoice: false,
        });
    });

    it('shows only the correct option for an unattempted MCQ', () => {
        const optionStates = [0, 1, 2, 3].map((index) => getReviewOptionState(index, 2, -1));
        expect(optionStates.map((state) => state.isCorrect)).toEqual([false, false, true, false]);
        expect(optionStates.every((state) => !state.isUserChoice && !state.isWrongChoice)).toBe(true);
    });

    it('filters the question list into the five summary buckets', () => {
        expect(filterReviewQuestionIndices(questions, answers, true, null)).toEqual([0, 1, 2, 3, 4]);
        expect(filterReviewQuestionIndices(questions, answers, true, 'attempted')).toEqual([0, 1]);
        expect(filterReviewQuestionIndices(questions, answers, true, 'correct')).toEqual([0]);
        expect(filterReviewQuestionIndices(questions, answers, true, 'wrong')).toEqual([1]);
        expect(filterReviewQuestionIndices(questions, answers, true, 'unattempted')).toEqual([2, 3, 4]);
    });

    it('treats a non-empty theory response as attempted', () => {
        expect(getReviewStatus({ id: 'theory-q' }, { 'theory-q': 'Written explanation' }, false)).toBe('attempted');
        expect(getReviewStatus({ id: 'theory-q' }, { 'theory-q': '' }, false)).toBe('unattempted');
    });
});
