/**
 * Tests for examValidation.js — validation of AI-generated exams.
 */
import { describe, it, expect } from 'vitest';

function withTheoryPayload(questions) {
    return questions.map((question) => {
        if (question?.type !== 'subjective') return question;
        const marks = question.marks;
        const isComparison = marks >= 2 && /compare|differentiat|difference/i.test(question.text || '');
        const itemCount = isComparison ? marks : (marks === 1 ? 1 : marks === 2 ? 2 : marks === 4 ? 4 : 8);
        const rubric = Array.from({ length: itemCount }, (_, index) => ({
            criterion: isComparison ? `Comparison row ${index + 1}` : `Expected point ${index + 1}`,
            marks: 1,
            keyPoints: isComparison ? ['Correct point for side A', 'Corresponding point for side B'] : [`Required concept ${index + 1}`],
            acceptedAlternatives: [],
        }));
        const answer = isComparison
            ? [
                '| Basis | Side A | Side B |',
                '|---|---|---|',
                ...rubric.map((_, index) => `| Basis ${index + 1} | A point ${index + 1} | B point ${index + 1} |`),
            ].join('\n')
            : rubric.map((_, index) => `${index + 1}. Expected answer point ${index + 1}.`).join('\n');
        return { ...question, answer, answerFormat: isComparison ? 'comparison' : 'points', rubric };
    });
}

import {
    validateExam,
    validateTheoryAnswerPayload,
    stripReviewMetadata,
    validateBatch,
} from '../src/utils/examValidation';
import { EXAM_CONFIG } from '../src/utils/contextFitter';

describe('examValidation', () => {
    describe('validateExam — Mid-2 MCQ', () => {
        it('accepts valid 30-question MCQ exam', () => {
            const questions = [
                'What is the time complexity of binary search on a sorted array?',
                'Which ACID property ensures that a transaction is atomic?',
                'What does the IP protocol operate at in the OSI model?',
                'Which cryptographic algorithm uses a public and private key pair?',
                'What is the purpose of a process control block in an OS?',
                'Which phase of compilation checks for type errors?',
                'What is supervised learning in machine learning?',
                'Which software testing level tests individual modules?',
                'What does the ALU do in a CPU?',
                'What is a graph in discrete mathematics?',
                'How does quicksort select its pivot element?',
                'What is the role of a foreign key in a relational database?',
                'Which layer handles end-to-end communication in TCP/IP?',
                'What is a digital signature used for?',
                'What is a deadlock in operating systems?',
                'What is intermediate code generation in compilers?',
                'What is a neural network in AI?',
                'What is integration testing in software engineering?',
                'What is pipelining in computer architecture?',
                'What is a relation in discrete mathematics?',
                'What is the worst case of merge sort?',
                'What is database normalization used for?',
                'What is a MAC address in networking?',
                'What is symmetric encryption?',
                'What is a semaphore in operating systems?',
                'What is syntax analysis in compilers?',
                'What is a decision tree in AI?',
                'What is system testing in software engineering?',
                'What is cache memory in computer architecture?',
                'What is a tree in discrete mathematics?',
            ].map((text, i) => ({
                id: `q${i}`,
                text,
                type: 'mcq',
                difficulty: 'medium',
                options: ['Option A', 'Option B', 'Option C', 'Option D'],
                answer: i % 4,
                review: {
                    correctReason: 'This is the correct answer because it matches the condition.',
                    distractorReasons: [
                        'Distractor A is tempting but fails condition X.',
                        'Distractor B is plausible but incorrect under condition Y.',
                        'Distractor C is close but does not satisfy the stem.',
                    ],
                    singleBestAnswerCheck: 'Only one option satisfies every stated condition.',
                    difficultyEvidence: 'Requires applying the case condition and eliminating alternatives.',
                },
            }));

            const result = validateExam(questions, EXAM_CONFIG.mid2, null);
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
            expect(result.stats.questionCount).toBe(30);
            expect(result.stats.mcqCount).toBe(30);
        });

        it('rejects wrong question count for Mid-2', () => {
            const questions = Array.from({ length: 25 }, (_, i) => ({
                id: `q${i}`,
                text: `Question ${i}?`,
                type: 'mcq',
                difficulty: 'medium',
                options: ['A', 'B', 'C', 'D'],
                answer: 0,
                review: {
                    correctReason: 'Correct because.',
                    distractorReasons: ['Wrong A.', 'Wrong B.', 'Wrong C.'],
                    singleBestAnswerCheck: 'Only one option satisfies every stated condition.',
                    difficultyEvidence: 'Needs reasoning.',
                },
            }));

            const result = validateExam(questions, EXAM_CONFIG.mid2, null);
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes('expected_30_questions_got_25'))).toBe(true);
        });

        it('rejects MCQ with wrong option count', () => {
            const questions = Array.from({ length: 30 }, (_, i) => ({
                id: `q${i}`,
                text: `Question ${i}?`,
                type: 'mcq',
                difficulty: 'medium',
                options: ['A', 'B', 'C'], // only 3 options
                answer: 0,
                review: {
                    correctReason: 'Correct because.',
                    distractorReasons: ['Wrong A.', 'Wrong B.', 'Wrong C.'],
                    singleBestAnswerCheck: 'Only one option satisfies every stated condition.',
                    difficultyEvidence: 'Needs reasoning.',
                },
            }));

            const result = validateExam(questions, EXAM_CONFIG.mid2, null);
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes('expected_4_options'))).toBe(true);
        });

        it('rejects MCQ with invalid answer index', () => {
            const questions = Array.from({ length: 30 }, (_, i) => ({
                id: `q${i}`,
                text: `Question ${i}?`,
                type: 'mcq',
                difficulty: 'medium',
                options: ['A', 'B', 'C', 'D'],
                answer: 5, // invalid
                review: {
                    correctReason: 'Correct because.',
                    distractorReasons: ['Wrong A.', 'Wrong B.', 'Wrong C.'],
                    singleBestAnswerCheck: 'Only one option satisfies every stated condition.',
                    difficultyEvidence: 'Needs reasoning.',
                },
            }));

            const result = validateExam(questions, EXAM_CONFIG.mid2, null);
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes('invalid_answer_index'))).toBe(true);
        });

        it('does not reject repeated stems through a semantic quality gate', () => {
            const questions = Array.from({ length: 30 }, (_, i) => ({
                id: `q${i}`,
                text: i === 0 || i === 1 ? 'Duplicate question text?' : `Unique question ${i}?`,
                type: 'mcq',
                difficulty: 'medium',
                options: ['A', 'B', 'C', 'D'],
                answer: 0,
            }));

            const result = validateExam(questions, EXAM_CONFIG.mid2, null);
            expect(result.valid).toBe(true);
            expect(result.errors.some((e) => e.includes('duplicate_question'))).toBe(false);
        });
    });

    describe('validateExam — Mid-1 Theory', () => {
        it('accepts valid Mid-1 theory exam with two 1-mark questions', () => {
            const questions = [
                { id: 'q0', text: 'State the primary purpose of concept X.', type: 'subjective', difficulty: 'easy', marks: 1 },
                { id: 'q1', text: 'Name one property of concept Y.', type: 'subjective', difficulty: 'easy', marks: 1 },
                { id: 'q2', text: 'Explain how method Z works in a basic case.', type: 'subjective', difficulty: 'medium', marks: 4 },
                { id: 'q3', text: 'Analyze the multi-step process used by approach A.', type: 'subjective', difficulty: 'hard', marks: 8 },
                { id: 'q4', text: 'Compare the two specified properties of method B.', type: 'subjective', difficulty: 'medium', marks: 4 },
                { id: 'q5', text: 'Evaluate approach C under the given constraints.', type: 'subjective', difficulty: 'hard', marks: 8 },
                { id: 'q6', text: 'Describe one practical application of concept D.', type: 'subjective', difficulty: 'medium', marks: 4 },
            ];

            const result = validateExam(withTheoryPayload(questions), EXAM_CONFIG.mid1, null);
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
            expect(result.stats.totalMarks).toBe(30);
            expect(result.stats.oneMarkCount).toBe(2);
        });

        it('rejects a Mid-1 paper when a 1-mark question is not in the first two positions', () => {
            const questions = [1, 4, 1, 8, 4, 8, 4].map((marks, index) => ({
                id: `q${index}`,
                text: `Question ${index + 1}?`,
                type: 'subjective',
                difficulty: 'medium',
                marks,
            }));

            const result = validateExam(withTheoryPayload(questions), EXAM_CONFIG.mid1, null);
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('question_2:expected_1_marks_got_4');
        });

        it('rejects Mid-1 without exactly two 1-mark questions', () => {
            const questions = [
                { id: 'q0', text: 'Define X?', type: 'subjective', difficulty: 'easy', marks: 1 },
                { id: 'q1', text: 'Explain A?', type: 'subjective', difficulty: 'medium', marks: 4 },
                { id: 'q2', text: 'Calculate B?', type: 'subjective', difficulty: 'medium', marks: 8 },
                { id: 'q3', text: 'Compare C?', type: 'subjective', difficulty: 'hard', marks: 8 },
                { id: 'q4', text: 'Analyze D?', type: 'subjective', difficulty: 'hard', marks: 8 },
            ];

            const result = validateExam(withTheoryPayload(questions), EXAM_CONFIG.mid1, null);
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes('one_mark'))).toBe(true);
        });

        it('rejects Mid-1 with wrong total marks', () => {
            const questions = [
                { id: 'q0', text: 'Define X?', type: 'subjective', difficulty: 'easy', marks: 1 },
                { id: 'q1', text: 'Define Y?', type: 'subjective', difficulty: 'easy', marks: 1 },
                { id: 'q2', text: 'Explain A?', type: 'subjective', difficulty: 'medium', marks: 4 },
                { id: 'q3', text: 'Calculate B?', type: 'subjective', difficulty: 'medium', marks: 4 },
                { id: 'q4', text: 'Compare C?', type: 'subjective', difficulty: 'medium', marks: 4 },
                { id: 'q5', text: 'Analyze D?', type: 'subjective', difficulty: 'medium', marks: 4 },
            ]; // total = 18, not 30

            const result = validateExam(withTheoryPayload(questions), EXAM_CONFIG.mid1, null);
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes('total_marks'))).toBe(true);
        });
    });

    describe('validateExam — ESE Theory', () => {
        it('accepts valid ESE theory exam with two 1-mark + one 2-mark', () => {
            const questions = [
                { id: 'q0', text: 'State the purpose of concept X.', type: 'subjective', difficulty: 'easy', marks: 1 },
                { id: 'q1', text: 'Name one property of concept Y.', type: 'subjective', difficulty: 'easy', marks: 1 },
                { id: 'q2', text: 'List two types of concept E.', type: 'subjective', difficulty: 'easy', marks: 2 },
                { id: 'q3', text: 'Explain method A and its main steps.', type: 'subjective', difficulty: 'medium', marks: 4 },
                { id: 'q4', text: 'Analyze concept B using a multi-step example.', type: 'subjective', difficulty: 'hard', marks: 8 },
                { id: 'q5', text: 'Compare methods C and D against two criteria.', type: 'subjective', difficulty: 'medium', marks: 4 },
                { id: 'q6', text: 'Design approach F subject to explicit constraints.', type: 'subjective', difficulty: 'hard', marks: 8 },
                { id: 'q7', text: 'Describe four key features of system G.', type: 'subjective', difficulty: 'medium', marks: 4 },
                { id: 'q8', text: 'Evaluate method H and justify its use.', type: 'subjective', difficulty: 'hard', marks: 8 },
                { id: 'q9', text: 'Explain four practical uses of concept I.', type: 'subjective', difficulty: 'medium', marks: 4 },
                { id: 'q10', text: 'Diagnose a multi-condition failure involving concept J.', type: 'subjective', difficulty: 'hard', marks: 8 },
                { id: 'q11', text: 'Compare two limitations of approach K.', type: 'subjective', difficulty: 'medium', marks: 4 },
                { id: 'q12', text: 'Describe the main stages of process L.', type: 'subjective', difficulty: 'medium', marks: 4 },
            ]; // 2x1 + 1x2 + 6x4 + 4x8 = 60

            const result = validateExam(withTheoryPayload(questions), EXAM_CONFIG.ese, null);
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
            expect(result.stats.totalMarks).toBe(60);
            expect(result.stats.oneMarkCount).toBe(2);
            expect(result.stats.twoMarkCount).toBe(1);
        });
    });

    describe('theory answer and rubric validation', () => {
        it('rejects a rubric whose allocated marks do not equal the question marks', () => {
            const question = withTheoryPayload([{ id: 'q8', text: 'Explain a concept?', type: 'subjective', difficulty: 'medium', marks: 8 }])[0];
            question.rubric[0].marks = 2;
            const result = validateExam(withTheoryPayload([
                { id: 'q0', text: 'One fact?', type: 'subjective', difficulty: 'easy', marks: 1 },
                { id: 'q1', text: 'One fact?', type: 'subjective', difficulty: 'easy', marks: 1 },
                { id: 'q2', text: 'Explain?', type: 'subjective', difficulty: 'medium', marks: 4 },
                { id: 'q3', text: 'Analyze?', type: 'subjective', difficulty: 'hard', marks: 8 },
                { id: 'q4', text: 'Compare?', type: 'subjective', difficulty: 'medium', marks: 4 },
                { id: 'q5', text: 'Evaluate?', type: 'subjective', difficulty: 'hard', marks: 8 },
                { id: 'q6', text: 'Apply?', type: 'subjective', difficulty: 'medium', marks: 4 },
            ]).map((item) => item.id === 'q3' ? question : item), EXAM_CONFIG.mid1, null);
            expect(result.valid).toBe(false);
            expect(result.errors.some((error) => error.includes('rubric_total_'))).toBe(true);
        });

        it('accepts an 8-mark comparison as eight paired one-mark rows', () => {
            const question = withTheoryPayload([{ id: 'q8', text: 'Differentiate A and B.', type: 'subjective', difficulty: 'medium', marks: 8 }])[0];
            expect(question.rubric).toHaveLength(8);
            expect(question.rubric.every((item) => item.marks === 1 && item.keyPoints.length === 2)).toBe(true);
            expect(validateTheoryAnswerPayload(question).valid).toBe(true);
        });

        it('rejects more than twelve rubric criteria on an ordinary 8-mark answer', () => {
            const question = withTheoryPayload([{ id: 'q8', text: 'Explain a concept.', type: 'subjective', difficulty: 'hard', marks: 8 }])[0];
            question.rubric = Array.from({ length: 13 }, (_, index) => ({
                criterion: `Criterion ${index + 1}`, marks: 0.5, keyPoints: ['Expected idea'], acceptedAlternatives: [],
            }));
            const result = validateTheoryAnswerPayload(question);
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('subjective_q8:rubric_exceeds_12_criteria');
        });
    });

    describe('stripReviewMetadata', () => {
        it('removes review from MCQ questions', () => {
            const questions = [
                {
                    id: 'q0',
                    text: 'Question?',
                    type: 'mcq',
                    options: ['A', 'B', 'C', 'D'],
                    answer: 0,
                    review: { correctReason: 'x', distractorReasons: ['a', 'b', 'c'], singleBestAnswerCheck: 'only one', difficultyEvidence: 'y' },
                },
                {
                    id: 'q1',
                    text: 'Theory?',
                    type: 'subjective',
                    marks: 4,
                },
            ];

            const stripped = stripReviewMetadata(questions);
            expect(stripped[0].review).toBeUndefined();
            expect(stripped[0].options).toEqual(['A', 'B', 'C', 'D']);
            expect(stripped[0].answer).toBe(0);
            expect(stripped[1].marks).toBe(4);
            // Original not mutated
            expect(questions[0].review).toBeDefined();
        });
    });

    describe('validateBatch', () => {
        it('accepts valid batch', () => {
            const questions = [
                { id: 'q0', text: 'Q0?', type: 'mcq', options: ['A', 'B', 'C', 'D'], answer: 0 },
                { id: 'q1', text: 'Q1?', type: 'mcq', options: ['A', 'B', 'C', 'D'], answer: 1 },
            ];
            const result = validateBatch(questions, 2);
            expect(result.valid).toBe(true);
        });

        it('rejects wrong count', () => {
            const result = validateBatch([{ id: 'q0', text: 'Q?', type: 'mcq', options: ['A', 'B', 'C', 'D'], answer: 0 }], 2);
            expect(result.valid).toBe(false);
        });
    });
});
