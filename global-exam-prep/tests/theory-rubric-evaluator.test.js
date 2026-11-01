import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    evaluateTheoryAttempt,
    prepareTheoryEvaluation,
    validateAndNormalizeModelResult,
} from '../api/_lib/theory-rubric-evaluator';

function buildAttempt(answer = 'An operating system manages processes and memory.') {
    return {
        id: '11111111-1111-4111-8111-111111111111',
        subject_name: 'Operating Systems',
        exam_type: 'Mid-1',
        total_marks: 4,
        answer_revision: 0,
        status: 'submitted',
        questions: [{
            id: 'q1',
            type: 'subjective',
            text: 'Explain two responsibilities of an operating system.',
            marks: 4,
            answer: '1. Process management. 2. Memory management.',
            answerFormat: 'points',
            rubric: [
                {
                    criterion: 'Process management',
                    marks: 2,
                    keyPoints: ['Schedules and manages processes', 'Supports process execution'],
                    acceptedAlternatives: ['CPU process scheduling'],
                },
                {
                    criterion: 'Memory management',
                    marks: 2,
                    keyPoints: ['Allocates and tracks memory for processes'],
                    acceptedAlternatives: ['Manages RAM allocation'],
                },
            ],
        }],
        answers: { q1: answer },
    };
}

function validModelResult(questionId = 'q1') {
    return {
        overallFeedback: 'You identified process management but did not explain memory allocation.',
        strengths: ['You correctly described process management.'],
        improvementAreas: ['Explain how memory is allocated and tracked.'],
        questions: [{
            questionId,
            feedback: 'The first responsibility was partly explained; the second was missing.',
            criteria: [
                {
                    criterionIndex: 0,
                    awardedMarks: 1.5,
                    feedback: 'One concept is correct and the second needs more detail.',
                    keyPoints: [
                        { keyPointIndex: 0, status: 'met', evidenceQuote: 'manages processes', feedback: 'Correctly identifies process management.' },
                        { keyPointIndex: 1, status: 'partial', evidenceQuote: '', feedback: 'The execution support was not clearly explained.' },
                    ],
                },
                {
                    criterionIndex: 1,
                    awardedMarks: 0,
                    feedback: 'Memory management was not covered.',
                    keyPoints: [
                        { keyPointIndex: 0, status: 'missing', evidenceQuote: '', feedback: 'Explain allocation and tracking of memory.' },
                    ],
                },
            ],
        }],
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('theory rubric evaluator', () => {
    it('prepares only theory questions and checks the saved rubric totals', () => {
        const prepared = prepareTheoryEvaluation(buildAttempt());
        expect(prepared).toHaveLength(1);
        expect(prepared[0].studentAnswer).toContain('manages processes');
        expect(prepared[0].rubric.reduce((sum, criterion) => sum + criterion.marks, 0)).toBe(4);
    });

    it('rejects a saved rubric whose allocations do not equal the question marks', () => {
        const attempt = buildAttempt();
        attempt.questions[0].rubric[0].marks = 1;
        expect(() => prepareTheoryEvaluation(attempt)).toThrow(/marking rubric|total marks/i);
    });

    it('calculates marks from rubric criteria and keeps exact answer evidence only', () => {
        const result = validateAndNormalizeModelResult(
            validModelResult(),
            prepareTheoryEvaluation(buildAttempt()),
            prepareTheoryEvaluation(buildAttempt()),
        );
        expect(result.totalAwardedMarks).toBe(1.5);
        expect(result.totalPossibleMarks).toBe(4);
        expect(result.questions[0].criteria[0].awardedMarks).toBe(1.5);
        expect(result.questions[0].criteria[0].keyPoints[0].evidenceQuote).toBe('manages processes');
        expect(result.questions[0].criteria[1].keyPoints[0].evidenceQuote).toBe('');
    });

    it('caps criterion marks at the saved allocation instead of failing the whole attempt', () => {
        const raw = validModelResult();
        raw.questions[0].criteria[0].awardedMarks = 2.5;
        const prepared = prepareTheoryEvaluation(buildAttempt());
        const result = validateAndNormalizeModelResult(raw, prepared, prepared);
        expect(result.questions[0].criteria[0].awardedMarks).toBe(2);
        expect(result.totalAwardedMarks).toBe(2);
    });

    it('fills an omitted criterion and missing key-point assessment conservatively', () => {
        const raw = validModelResult();
        raw.questions[0].criteria[0].keyPoints.pop();
        delete raw.questions[0].criteria[0].feedback;
        delete raw.questions[0].feedback;
        raw.questions[0].criteria.pop();
        const prepared = prepareTheoryEvaluation(buildAttempt());

        const result = validateAndNormalizeModelResult(raw, prepared, prepared);
        expect(result.questions[0].criteria).toHaveLength(2);
        expect(result.questions[0].criteria[0].keyPoints).toHaveLength(2);
        expect(result.questions[0].criteria[0].keyPoints[1].status).toBe('missing');
        expect(result.questions[0].criteria[1].awardedMarks).toBe(0);
        expect(result.questions[0].criteria[1].feedback).toMatch(/omitted/i);
        expect(result.questions[0].feedback).toMatch(/criterion-level feedback/i);
        expect(result.totalAwardedMarks).toBe(1);
        expect(result.totalPossibleMarks).toBe(4);
    });

    it('returns a completed conservative result when the model omits an answered question', () => {
        const raw = validModelResult();
        raw.questions = [];
        const prepared = prepareTheoryEvaluation(buildAttempt());
        const result = validateAndNormalizeModelResult(raw, prepared, prepared);
        expect(result.totalAwardedMarks).toBe(0);
        expect(result.questions[0].awardedMarks).toBe(0);
        expect(result.questions[0].feedback).toMatch(/zero marks conservatively/i);
    });

    it('does not call Groq when every theory answer is blank and assigns zero', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const result = await evaluateTheoryAttempt(buildAttempt('   '), 'test-groq-key');
        expect(fetchMock).not.toHaveBeenCalled();
        expect(result.totalAwardedMarks).toBe(0);
        expect(result.totalPossibleMarks).toBe(4);
        expect(result.questions[0].criteria.every(criterion => criterion.awardedMarks === 0)).toBe(true);
    });

    it('retries a transient Groq TPM rate limit and then completes evaluation', async () => {
        const successBody = {
            choices: [{ message: { content: JSON.stringify(validModelResult()) } }],
        };
        const rateLimitResponse = new Response(JSON.stringify({
            error: { message: 'Rate limit reached. Please try again in 1ms.' },
        }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
        });
        const successResponse = new Response(JSON.stringify(successBody), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(rateLimitResponse)
            .mockResolvedValueOnce(successResponse);
        vi.stubGlobal('fetch', fetchMock);

        const result = await evaluateTheoryAttempt(buildAttempt(), 'test-groq-key');
        expect(result.totalAwardedMarks).toBe(1.5);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('uses JSON-object output and the configured Groq model for answered papers', async () => {
        const responseBody = {
            choices: [{ message: { content: JSON.stringify(validModelResult()) } }],
        };
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(responseBody), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await evaluateTheoryAttempt(buildAttempt(), 'test-groq-key');
        expect(result.totalAwardedMarks).toBe(1.5);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, request] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
        expect(request.headers.Authorization).toBe('Bearer test-groq-key');
        const payload = JSON.parse(request.body);
        expect(payload.model).toBe('openai/gpt-oss-20b');
        expect(payload.response_format).toEqual({ type: 'json_object' });
        expect(payload.max_completion_tokens).toBe(4096);
        expect(payload.messages[0].content).toContain('Never omit a required field');
    });
});
