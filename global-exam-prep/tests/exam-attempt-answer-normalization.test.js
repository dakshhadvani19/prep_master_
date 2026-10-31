import { describe, expect, it } from 'vitest';
import { normalizeAnswers } from '../api/exam-attempts.js';

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
