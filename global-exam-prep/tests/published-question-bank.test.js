import { describe, expect, it } from 'vitest';
import {
    buildPublishedExamQuestions,
    normalizePublishedTheoryRubric,
    toStudentBankQuestions,
} from '../api/_lib/published-question-bank.js';
import { EXAM_BLUEPRINTS } from '../src/data/examBlueprints.js';

describe('published question-bank student exam builder', () => {
    it('builds a complete MCQ set and keeps its answer key out of the student payload', () => {
        const rows = Array.from({ length: 30 }, (_, index) => ({
            id: 'question-' + index, question_type: 'mcq', question_text: 'Question ' + index,
            options: ['A', 'B', 'C', 'D'], correct_option_index: index % 4,
        }));
        const result = buildPublishedExamQuestions({ rows, examInfo: { type: 'objective', totalMarks: 30, timeMinutes: 45 }, difficulty: 'medium' });
        expect(result.questions).toHaveLength(30);
        expect(Object.keys(result.answerKey)).toHaveLength(30);
        expect(toStudentBankQuestions(result.questions).every(question => !('answer' in question))).toBe(true);
    });

    it('rejects incomplete MCQ sets', () => {
        const rows = Array.from({ length: 29 }, (_, index) => ({
            id: String(index), question_type: 'mcq', question_text: 'Q' + index,
            options: ['A', 'B', 'C', 'D'], correct_option_index: 0,
        }));
        expect(buildPublishedExamQuestions({ rows, examInfo: { type: 'objective', totalMarks: 30, timeMinutes: 45 }, difficulty: 'easy' })).toBeNull();
    });

    it('selects theory questions in exact blueprint mark order with complete rubrics', () => {
        const markSequence = EXAM_BLUEPRINTS.mid1.markSequence;
        const rows = markSequence.map((marks, index) => ({
            id: 'theory-' + index, question_type: 'theory', question_text: 'Explain topic ' + index,
            model_answer: 'A correct model answer for topic ' + index, marks, rubric: 'Accuracy and correctness',
        }));
        const result = buildPublishedExamQuestions({ rows, examInfo: { type: 'subjective', totalMarks: 30, timeMinutes: 60 }, markSequence, difficulty: 'hard' });
        expect(result.questions.map(question => question.marks)).toEqual(markSequence);
        expect(result.questions.reduce((sum, question) => sum + question.marks, 0)).toBe(30);
        expect(toStudentBankQuestions(result.questions).every(question => !('answer' in question) && !('rubric' in question))).toBe(true);
    });

    it('uses positive half-mark-safe rubric allocations that sum to the question total', () => {
        const rubric = normalizePublishedTheoryRubric('Point one\nPoint two\nPoint three', 4, 'Answer.');
        expect(rubric.reduce((sum, item) => sum + item.marks, 0)).toBe(4);
        expect(rubric.every(item => item.marks > 0 && Number.isInteger(item.marks * 2))).toBe(true);
    });
});
