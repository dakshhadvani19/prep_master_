/**
 * Regression tests for geminiQuestions.js — AI question generation with
 * strict JSON Schema (Groq structured output) and bounded retry logic.
 *
 * Covers the 12 failure modes:
 *   1. Valid MCQ JSON
 *   2. Valid theory JSON
 *   3. Strict-schema config
 *   4. Missing props / wrong types / malformed output / invalid answer indices
 *   5. Incorrect / duplicate options
 *   6. Missing / extra / duplicate questions across batches
 *   7. Exact theory mark-sequence enforcement
 *   8. Rate-limit retry timing + recovery
 *   9. Non-retryable schema/config errors
 *   10. Bounded recovery + terminal messages
 *   11. Batch failure without saving partial exam
 *   12. Mid-1 / Mid-2 / ESE complete paper validation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchMock = vi.fn();
globalThis.fetch = fetchMock;

let geminiQuestionsModule;

async function importModule() {
    if (!geminiQuestionsModule) {
        geminiQuestionsModule = await import('../src/utils/geminiQuestions');
    }
    return geminiQuestionsModule;
}

// Each call returns a brand-new Response — Response bodies are single-read.
function mockJsonResponse(status, jsonBody, extraHeaders = {}) {
    const headers = new Headers({ 'Content-Type': 'application/json', ...extraHeaders });
    return new Response(JSON.stringify(jsonBody), { status, headers });
}

// Question stems with zero shared content words (avoids near-duplicate detection).
// All stems are short enough for 1-mark questions (no multi-part verbs like "explain"/"describe").
const MCQ_STEMS = [
    'What is the capital city of France?',
    'Which gas do plants absorb from air?',
    'What is two plus two equal to?',
    'Which planet is known as the red planet?',
    'What is the largest ocean on Earth?',
    'Who wrote the play Romeo and Juliet?',
    'What is the chemical symbol for gold?',
    'Which year did World War Two end?',
    'What is the square root of sixty four?',
    'Which gas do humans exhale?',
    'What is the tallest mountain in the world?',
    'Who painted the Mona Lisa?',
    'What is the smallest prime number?',
    'Which continent is the largest by area?',
    'What is the currency of Japan?',
    'Who developed the theory of relativity?',
    'What is the speed of light in vacuum?',
    'Which element has the atomic number one?',
    'What is the largest planet in our solar system?',
    'Who was the first person to walk on the Moon?',
    'What is the capital of Australia?',
    'Which gas makes up most of the atmosphere?',
    'What is the freezing point of water in Celsius?',
    'Who wrote the Harry Potter book series?',
    'What is the main gas in the air we breathe?',
    'Which country is known as the Land of the Rising Sun?',
    'What is the largest organ in the human body?',
    'Who invented the telephone?',
    'What is the longest river in the world?',
    'Which gas is used in balloons to make them float?',
];

const THEORY_STEMS = [
    'State the purpose of a database index?',
    'Name one property of ACID transactions?',
    'What is a hash table collision?',
    'State the waterfall model phases?',
    'What is compiler lexical analysis?',
    'Name one role of virtual memory?',
    'What is a load balancer used for?',
    'Name one step of the scientific method?',
    'State one object oriented design principle?',
    'What is a recursive function base case?',
    'Define stack memory?',
    'How does DNS resolve domain names?',
    'What is a semaphore in programming?',
    'Name one process scheduling algorithm?',
    'What is a page fault?',
    'Describe the TCP three way handshake?',
    'What is a relational database schema?',
    'How does garbage collection work?',
    'What is the difference between HTTP and HTTPS?',
    'What is API rate limiting?',
    'State the CAP theorem?',
    'What is consistent hashing?',
    'What is a bloom filter?',
    'Name one difference between threads and processes?',
    'What is virtual memory used for?',
    'Name one property of a firewall?',
    'What is polymorphism in programming?',
    'Define normalization in databases?',
    'What is the OSI model used for?',
    'What is binary search time complexity?',
];

function buildMcqBody(count, stemOffset = 0) {
    const questions = Array.from({ length: count }, (_, i) => ({
        text: MCQ_STEMS[(stemOffset + i) % MCQ_STEMS.length],
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        answer: i % 4,
    }));
    return { choices: [{ message: { content: JSON.stringify({ questions }) } }] };
}

function buildTheoryBody(count, marksSequence, stemOffset = 0) {
    const questions = Array.from({ length: count }, (_, i) => ({
        text: THEORY_STEMS[(stemOffset + i) % THEORY_STEMS.length],
        marks: marksSequence?.[i] ?? 4,
    }));
    return { choices: [{ message: { content: JSON.stringify({ questions }) } }] };
}

describe('geminiQuestions — strict JSON Schema migration', () => {
    beforeEach(() => {
        fetchMock.mockReset();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('1. Valid MCQ JSON — accepted', () => {
        it('returns validated MCQ questions from Groq structured output', async () => {
            const { generateQuestionsFromText } = await importModule();
            fetchMock.mockImplementation(() => Promise.resolve(mockJsonResponse(200, buildMcqBody(5))));

            const result = await generateQuestionsFromText({
                text: 'Syllabus content about operating systems and databases. ' + 'x'.repeat(200),
                difficulty: 'medium',
                count: 5,
                isObjective: true,
            });

            expect(result).toHaveLength(5);
            result.forEach((q) => {
                expect(q.type).toBe('mcq');
                expect(q.options).toHaveLength(4);
                expect(typeof q.answer).toBe('number');
                expect(q.answer).toBeGreaterThanOrEqual(0);
                expect(q.answer).toBeLessThanOrEqual(3);
            });
        });
    });

    describe('2. Valid theory JSON — accepted', () => {
        it('returns validated theory questions with marks', async () => {
            const { generateQuestionsFromText } = await importModule();
            fetchMock.mockImplementation(() => Promise.resolve(mockJsonResponse(200, buildTheoryBody(3, [4, 8, 4]))));

            const result = await generateQuestionsFromText({
                text: 'Syllabus content about database normalization. ' + 'x'.repeat(200),
                difficulty: 'medium',
                count: 3,
                isObjective: false,
                marksForQuestions: [4, 8, 4],
            });

            expect(result).toHaveLength(3);
            result.forEach((q, i) => {
                expect(q.type).toBe('subjective');
                expect(q.marks).toBe([4, 8, 4][i]);
            });
        });
    });

    describe('3. Strict-schema config', () => {
        it('buildMcqSchema enforces required fields and additionalProperties: false', async () => {
            const { buildMcqSchema } = await importModule();
            const schema = buildMcqSchema(3);
            expect(schema.type).toBe('json_schema');
            expect(schema.json_schema.strict).toBe(true);
            const items = schema.json_schema.schema.properties.questions.items;
            expect(items.required).toEqual(['text', 'options', 'answer']);
            expect(items.additionalProperties).toBe(false);
            expect(items.properties.options.minItems).toBe(4);
            expect(items.properties.options.maxItems).toBe(4);
            expect(items.properties.answer.enum).toEqual([0, 1, 2, 3]);
            expect(schema.json_schema.schema.properties.questions.minItems).toBe(3);
            expect(schema.json_schema.schema.properties.questions.maxItems).toBe(3);
        });

        it('buildTheorySchema does not force all questions to share one mark value', async () => {
            const { buildTheorySchema } = await importModule();
            const schema = buildTheorySchema(3);
            const items = schema.json_schema.schema.properties.questions.items;
            expect(items.properties.marks.type).toBe('integer');
            expect(items.properties.marks.enum).toBeUndefined();
            expect(items.properties.marks.const).toBeUndefined();
            const questionsProp = schema.json_schema.schema.properties.questions;
            expect(questionsProp.minItems).toBe(3);
            expect(questionsProp.maxItems).toBe(3);
        });
    });

    describe('3a. Full MCQ paper is requested once', () => {
        it('sends all 30 MCQs in one request with an exact-count schema', async () => {
            const { generateQuestionsFromText } = await importModule();
            fetchMock.mockResolvedValueOnce(mockJsonResponse(200, buildMcqBody(30)));

            const result = await generateQuestionsFromText({
                text: 'Syllabus content covering all in-scope chapters. ' + 'x'.repeat(500),
                difficulty: 'medium',
                count: 30,
                isObjective: true,
            });

            expect(result).toHaveLength(30);
            expect(fetchMock).toHaveBeenCalledTimes(1);
            const request = JSON.parse(fetchMock.mock.calls[0][1].body);
            expect(request.messages[1].content).toContain('Create exactly 30 original single-answer MCQs');
            expect(request.response_format).toEqual({ type: 'json_object' });
        });
    });

    describe('3b. Recover short-but-valid batches', () => {
        it('fills missing MCQs if the one full-paper request returns only two', async () => {
            const { generateQuestionsFromText } = await importModule();
            fetchMock
                .mockResolvedValueOnce(mockJsonResponse(400, {
                    error: {
                        message: "Failed to validate JSON. Please adjust your prompt. See 'failed_generation' for more details.",
                        category: 'generation_format',
                        providerCode: 'json_validate_failed',
                    },
                }))
                .mockResolvedValueOnce(mockJsonResponse(200, buildMcqBody(2, 0)))
                .mockResolvedValueOnce(mockJsonResponse(200, buildMcqBody(3, 2)));

            const result = await generateQuestionsFromText({
                text: 'Syllabus content about operating systems and databases. ' + 'x'.repeat(200),
                difficulty: 'medium',
                count: 5,
                isObjective: true,
            });

            expect(result).toHaveLength(5);
            expect(new Set(result.map(question => question.text)).size).toBe(5);
            expect(fetchMock).toHaveBeenCalledTimes(3);
            expect(JSON.parse(fetchMock.mock.calls[1][1].body).response_format).toEqual({ type: 'json_object' });
        });

        it('recovers theory short responses while keeping the caller mark sequence', async () => {
            const { generateQuestionsFromText } = await importModule();
            fetchMock
                .mockResolvedValueOnce(mockJsonResponse(200, buildTheoryBody(2, [1, 4], 0)))
                .mockResolvedValueOnce(mockJsonResponse(200, buildTheoryBody(1, [8], 2)));

            const result = await generateQuestionsFromText({
                text: 'Syllabus content about databases and operating systems. ' + 'x'.repeat(200),
                difficulty: 'medium',
                count: 3,
                isObjective: false,
                marksForQuestions: [1, 4, 8],
            });

            expect(result.map(question => question.marks)).toEqual([1, 4, 8]);
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });
    });

    describe('4. Missing props / wrong types / malformed output / invalid answer indices', () => {
        it('rejects missing options property', async () => {
            const { generateQuestionsFromText } = await importModule();
            fetchMock.mockImplementation(() => Promise.resolve(mockJsonResponse(200, {
                choices: [{ message: { content: JSON.stringify({ questions: [{ text: 'What is the capital city of France?', answer: 0 }] }) } }],
            })));

            await expect(generateQuestionsFromText({
                text: 'Syllabus content here. ' + 'x'.repeat(100),
                difficulty: 'medium',
                count: 1,
                isObjective: true,
            })).rejects.toThrow();
        });

        it('rejects missing text property', async () => {
            const { generateQuestionsFromText } = await importModule();
            fetchMock.mockImplementation(() => Promise.resolve(mockJsonResponse(200, {
                choices: [{ message: { content: JSON.stringify({ questions: [{ options: ['A', 'B', 'C', 'D'], answer: 0 }] }) } }],
            })));

            await expect(generateQuestionsFromText({
                text: 'Syllabus content here. ' + 'x'.repeat(100),
                difficulty: 'medium',
                count: 1,
                isObjective: true,
            })).rejects.toThrow();
        });

        it('rejects malformed JSON output', async () => {
            const { generateQuestionsFromText } = await importModule();
            fetchMock.mockImplementation(() => Promise.resolve(mockJsonResponse(200, {
                choices: [{ message: { content: 'not valid json at all' } }],
            })));

            await expect(generateQuestionsFromText({
                text: 'Syllabus content here. ' + 'x'.repeat(100),
                difficulty: 'medium',
                count: 1,
                isObjective: true,
            })).rejects.toThrow(/invalid JSON|no questions|retry generation/i);
        });

        it('rejects invalid answer index (5)', async () => {
            const { generateQuestionsFromText } = await importModule();
            fetchMock.mockImplementation(() => Promise.resolve(mockJsonResponse(200, {
                choices: [{ message: { content: JSON.stringify({ questions: [{
                    text: 'What is the capital city of France?', options: ['A', 'B', 'C', 'D'], answer: 5,
                }] }) } }],
            })));

            await expect(generateQuestionsFromText({
                text: 'Syllabus content here. ' + 'x'.repeat(100),
                difficulty: 'medium',
                count: 1,
                isObjective: true,
            })).rejects.toThrow();
        });

        it('rejects wrong answer type (string instead of number)', async () => {
            const { generateQuestionsFromText } = await importModule();
            fetchMock.mockImplementation(() => Promise.resolve(mockJsonResponse(200, {
                choices: [{ message: { content: JSON.stringify({ questions: [{
                    text: 'What is the capital city of France?', options: ['A', 'B', 'C', 'D'], answer: 'zero',
                }] }) } }],
            })));

            await expect(generateQuestionsFromText({
                text: 'Syllabus content here. ' + 'x'.repeat(100),
                difficulty: 'medium',
                count: 1,
                isObjective: true,
            })).rejects.toThrow();
        });
    });

    describe('5. Incorrect / duplicate options', () => {
        it('rejects fewer than 4 options', async () => {
            const { generateQuestionsFromText } = await importModule();
            fetchMock.mockImplementation(() => Promise.resolve(mockJsonResponse(200, {
                choices: [{ message: { content: JSON.stringify({ questions: [{
                    text: 'What is the capital city of France?', options: ['A', 'B', 'C'], answer: 0,
                }] }) } }],
            })));

            await expect(generateQuestionsFromText({
                text: 'Syllabus content here. ' + 'x'.repeat(100),
                difficulty: 'medium',
                count: 1,
                isObjective: true,
            })).rejects.toThrow(/four options|options/);
        });

        it('does not reject repeated option text on semantic quality grounds', async () => {
            const { generateQuestionsFromText } = await importModule();
            fetchMock.mockResolvedValueOnce(mockJsonResponse(200, {
                choices: [{ message: { content: JSON.stringify({ questions: [{
                    text: 'What is the capital city of France?', options: ['A', 'A', 'C', 'D'], answer: 0,
                }] }) } }],
            }));

            const result = await generateQuestionsFromText({
                text: 'Syllabus content here. ' + 'x'.repeat(100),
                difficulty: 'medium',
                count: 1,
                isObjective: true,
            });
            expect(result).toHaveLength(1);
            expect(result[0].options).toHaveLength(4);
        });

        it('rejects empty option text', async () => {
            const { generateQuestionsFromText } = await importModule();
            fetchMock.mockImplementation(() => Promise.resolve(mockJsonResponse(200, {
                choices: [{ message: { content: JSON.stringify({ questions: [{
                    text: 'What is the capital city of France?', options: ['A', '', 'C', 'D'], answer: 0,
                }] }) } }],
            })));

            await expect(generateQuestionsFromText({
                text: 'Syllabus content here. ' + 'x'.repeat(100),
                difficulty: 'medium',
                count: 1,
                isObjective: true,
            })).rejects.toThrow();
        });

        it('does not reject shortcut-style options through a local quality gate', async () => {
            const { generateQuestionsFromText } = await importModule();
            fetchMock.mockResolvedValueOnce(mockJsonResponse(200, {
                choices: [{ message: { content: JSON.stringify({ questions: [{
                    text: 'What is the capital city of France?', options: ['A', 'B', 'C', 'all of the above'], answer: 0,
                }] }) } }],
            }));

            const result = await generateQuestionsFromText({
                text: 'Syllabus content here. ' + 'x'.repeat(100),
                difficulty: 'medium',
                count: 1,
                isObjective: true,
            });
            expect(result).toHaveLength(1);
        });
    });

    describe('6. Missing / extra / duplicate questions across batches', () => {
        it('recovers an under-counted full request by asking for only the missing questions', async () => {
            const { generateQuestionsFromText } = await importModule();
            fetchMock
                .mockResolvedValueOnce(mockJsonResponse(200, buildMcqBody(3, 0)))
                .mockResolvedValueOnce(mockJsonResponse(200, buildMcqBody(3, 3)));

            const result = await generateQuestionsFromText({
                text: 'Syllabus content here. ' + 'x'.repeat(200),
                difficulty: 'medium',
                count: 6,
                isObjective: true,
            });

            expect(result).toHaveLength(6);
            expect(new Set(result.map(question => question.text)).size).toBe(6);
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it('uses the requested number if the provider returns extra questions', async () => {
            const { generateQuestionsFromText } = await importModule();
            fetchMock.mockResolvedValueOnce(mockJsonResponse(200, buildMcqBody(6)));

            const result = await generateQuestionsFromText({
                text: 'Syllabus content here. ' + 'x'.repeat(200),
                difficulty: 'medium',
                count: 5,
                isObjective: true,
            });

            expect(result).toHaveLength(5);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('does not reject exact duplicate stems through a local quality gate', async () => {
            const { generateQuestionsFromText } = await importModule();
            fetchMock.mockResolvedValueOnce(mockJsonResponse(200, {
                choices: [{ message: { content: JSON.stringify({ questions: [
                    { text: 'Exact duplicate stem here?', options: ['A', 'B', 'C', 'D'], answer: 0 },
                    { text: 'Exact duplicate stem here?', options: ['A', 'B', 'C', 'D'], answer: 1 },
                ] }) } }],
            }));

            const result = await generateQuestionsFromText({
                text: 'Syllabus content here. ' + 'x'.repeat(100),
                difficulty: 'medium',
                count: 2,
                isObjective: true,
            });
            expect(result).toHaveLength(2);
        });

        it('does not reject near-duplicate stems through a local quality gate', async () => {
            const { generateQuestionsFromText } = await importModule();
            fetchMock.mockResolvedValueOnce(mockJsonResponse(200, {
                choices: [{ message: { content: JSON.stringify({ questions: [
                    { text: 'What is a deadlock in operating systems?', options: ['A', 'B', 'C', 'D'], answer: 0 },
                    { text: 'What is a deadlock in operating systems?', options: ['A', 'B', 'C', 'D'], answer: 1 },
                ] }) } }],
            }));

            const result = await generateQuestionsFromText({
                text: 'Syllabus content here. ' + 'x'.repeat(100),
                difficulty: 'medium',
                count: 2,
                isObjective: true,
            });
            expect(result).toHaveLength(2);
        });

        it('makes one request for an MCQ set larger than five questions', async () => {
            const { generateQuestionsFromText } = await importModule();
            fetchMock.mockResolvedValueOnce(mockJsonResponse(200, buildMcqBody(6, 0)));

            const result = await generateQuestionsFromText({
                text: 'Syllabus content here. ' + 'x'.repeat(300),
                difficulty: 'medium',
                count: 6,
                isObjective: true,
            });

            expect(result).toHaveLength(6);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('does not return an invalid partial result when JSON parsing fails', async () => {
            const { generateQuestionsFromText } = await importModule();
            fetchMock.mockImplementation(() => Promise.resolve(mockJsonResponse(200, {
                choices: [{ message: { content: 'invalid' } }],
            })));

            await expect(generateQuestionsFromText({
                text: 'Syllabus content here. ' + 'x'.repeat(300),
                difficulty: 'medium',
                count: 6,
                isObjective: true,
            })).rejects.toThrow(/invalid JSON|rejected by validation/i);

            expect(fetchMock).toHaveBeenCalledTimes(3);
        });
    });

    describe('7. Exact theory mark-sequence enforcement', () => {
        it('enforces caller-provided mark sequence for theory questions', async () => {
            const { generateQuestionsFromText } = await importModule();
            // count=4 > maxPerResponse(3) → batch1=3 (offset 0), batch2=1 (offset 3)
            // 3 mocks for 3 retry attempts
            fetchMock
                .mockResolvedValueOnce(mockJsonResponse(200, buildTheoryBody(3, [1, 4, 8], 0)))
                .mockResolvedValueOnce(mockJsonResponse(200, buildTheoryBody(1, [4], 3)))
                .mockResolvedValueOnce(mockJsonResponse(200, buildTheoryBody(3, [1, 4, 8], 0)))
                .mockResolvedValueOnce(mockJsonResponse(200, buildTheoryBody(1, [4], 3)))
                .mockResolvedValueOnce(mockJsonResponse(200, buildTheoryBody(3, [1, 4, 8], 0)))
                .mockResolvedValueOnce(mockJsonResponse(200, buildTheoryBody(1, [4], 3)));

            const result = await generateQuestionsFromText({
                text: 'Syllabus content here. ' + 'x'.repeat(200),
                difficulty: 'medium',
                count: 4,
                isObjective: false,
                marksForQuestions: [1, 4, 8, 4],
            });

            expect(result.map((q) => q.marks)).toEqual([1, 4, 8, 4]);
        });

        it('uses the caller mark sequence even when generated mark fields differ', async () => {
            const { generateQuestionsFromText } = await importModule();
            fetchMock
                .mockResolvedValueOnce(mockJsonResponse(200, buildTheoryBody(3, [4, 4, 4], 0)))
                .mockResolvedValueOnce(mockJsonResponse(200, buildTheoryBody(1, [4], 3)));

            const result = await generateQuestionsFromText({
                text: 'Syllabus content here. ' + 'x'.repeat(200),
                difficulty: 'medium',
                count: 4,
                isObjective: false,
                marksForQuestions: [1, 4, 8, 4],
            });
            expect(result.map(question => question.marks)).toEqual([1, 4, 8, 4]);
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });
    });

    describe('8. Rate-limit retry timing + recovery', () => {
        it('retries after Groq rate-limit and recovers', async () => {
            const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((cb) => {
                cb();
                return { ref: () => {}, unref: () => {} };
            });

            const { generateQuestionsFromText } = await importModule();
            const rateLimitBody = {
                error: { message: 'Rate limit reached: try again in 2.5s', type: 'rate_limit_error' },
            };

            // Fresh Response for each call
            fetchMock
                .mockResolvedValueOnce(mockJsonResponse(429, rateLimitBody, { 'retry-after': '2.5' }))
                .mockResolvedValue(mockJsonResponse(200, buildMcqBody(3)));

            const result = await generateQuestionsFromText({
                text: 'Syllabus content here. ' + 'x'.repeat(100),
                difficulty: 'medium',
                count: 3,
                isObjective: true,
            });

            expect(result).toHaveLength(3);
            expect(fetchMock).toHaveBeenCalledTimes(2);
            setTimeoutSpy.mockRestore();
        });

        it('exhausts rate-limit retries and throws terminal error', async () => {
            const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((cb) => {
                cb();
                return { ref: () => {}, unref: () => {} };
            });

            const { generateQuestionsFromText } = await importModule();
            const rateLimitBody = {
                error: { message: 'Rate limit reached: try again in 1s', type: 'rate_limit_error' },
            };

            // Same error every time — fresh Response each call
            fetchMock.mockImplementation(() => Promise.resolve(mockJsonResponse(429, rateLimitBody, { 'retry-after': '1' })));

            await expect(generateQuestionsFromText({
                text: 'Syllabus content here. ' + 'x'.repeat(100),
                difficulty: 'medium',
                count: 3,
                isObjective: true,
            })).rejects.toThrow(/rate limit persisted|rate limit/i);

            // Initial call + MAX_RATE_LIMIT_RETRIES (4) retries = 5 total
            expect(fetchMock).toHaveBeenCalledTimes(5);
            setTimeoutSpy.mockRestore();
        });
    });

    describe('9. Provider JSON validation failures', () => {
        const jsonValidationError = {
            error: {
                message: "Failed to validate JSON. Please adjust your prompt. See 'failed_generation' for more details.",
                type: 'invalid_request_error',
                category: 'generation_format',
                providerCode: 'json_validate_failed',
            },
        };

        it('retries json_validate_failed in JSON-object mode', async () => {
            const { generateQuestionsFromText } = await importModule();
            fetchMock
                .mockResolvedValueOnce(mockJsonResponse(400, jsonValidationError))
                .mockResolvedValueOnce(mockJsonResponse(200, buildMcqBody(3)));

            const result = await generateQuestionsFromText({
                text: 'Syllabus content here. ' + 'x'.repeat(100),
                difficulty: 'medium',
                count: 3,
                isObjective: true,
            });

            expect(result).toHaveLength(3);
            expect(fetchMock).toHaveBeenCalledTimes(2);
            const firstRequest = JSON.parse(fetchMock.mock.calls[0][1].body);
            const retryRequest = JSON.parse(fetchMock.mock.calls[1][1].body);
            expect(firstRequest.response_format).toEqual({ type: 'json_object' });
            expect(retryRequest.response_format).toEqual({ type: 'json_object' });
        });

        it('continues bounded retries if json_object mode also gets json_validate_failed', async () => {
            const { generateQuestionsFromText } = await importModule();
            fetchMock
                .mockResolvedValueOnce(mockJsonResponse(400, jsonValidationError))
                .mockResolvedValueOnce(mockJsonResponse(400, jsonValidationError))
                .mockResolvedValueOnce(mockJsonResponse(200, buildMcqBody(3)));

            const result = await generateQuestionsFromText({
                text: 'Syllabus content here. ' + 'x'.repeat(100),
                difficulty: 'medium',
                count: 3,
                isObjective: true,
            });

            expect(result).toHaveLength(3);
            expect(fetchMock).toHaveBeenCalledTimes(3);
            const finalRequest = JSON.parse(fetchMock.mock.calls[2][1].body);
            expect(finalRequest.response_format).toEqual({ type: 'json_object' });
        });
    });

    describe('9. Non-retryable schema/config errors', () => {
        it('stops immediately if the provider rejects JSON-object configuration', async () => {
            const { generateQuestionsFromText } = await importModule();
            const schemaErrorBody = {
                error: {
                    message: 'JSON response format is not supported by this endpoint',
                    type: 'bad_request',
                    category: 'schema_config',
                },
            };
            fetchMock.mockResolvedValueOnce(mockJsonResponse(400, schemaErrorBody));

            await expect(generateQuestionsFromText({
                text: 'Syllabus content here. ' + 'x'.repeat(100),
                difficulty: 'medium',
                count: 3,
                isObjective: true,
            })).rejects.toThrow(/JSON response format is not supported/);

            expect(fetchMock).toHaveBeenCalledTimes(1);
        });


        it('does not retry a non-retryable response-format error', async () => {
            const { generateQuestionsFromText } = await importModule();
            const schemaErrorBody = {
                error: {
                    message: 'JSON response format is not supported',
                    type: 'bad_request',
                    category: 'schema_config',
                },
            };

            fetchMock.mockResolvedValueOnce(mockJsonResponse(400, schemaErrorBody));
            await expect(generateQuestionsFromText({
                text: 'Syllabus content here. ' + 'x'.repeat(100),
                difficulty: 'medium',
                count: 3,
                isObjective: true,
            })).rejects.toThrow();

            expect(fetchMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('10. Bounded recovery + terminal messages', () => {
        it('stops after MAX_RETRIES on repeated validation failures', async () => {
            const { generateQuestionsFromText } = await importModule();
            // Malformed structure should still be rejected to protect the exam UI.
            fetchMock.mockImplementation(() => Promise.resolve(mockJsonResponse(200, {
                choices: [{ message: { content: JSON.stringify({ questions: [
                    { text: 'What is the capital city of France?', options: ['A', 'B', 'C'], answer: 0 },
                    { text: 'Which gas do plants absorb from air?', options: ['A', 'B', 'C'], answer: 0 },
                    { text: 'What is two plus two equal to?', options: ['A', 'B', 'C'], answer: 0 },
                ] }) } }],
            })));

            await expect(generateQuestionsFromText({
                text: 'Syllabus content here. ' + 'x'.repeat(100),
                difficulty: 'medium',
                count: 3,
                isObjective: true,
            })).rejects.toThrow(/response format error/i);

            // MAX_RETRIES = 3 attempts
            expect(fetchMock).toHaveBeenCalledTimes(3);
        });

        it('terminal message includes last validation error', async () => {
            const { generateQuestionsFromText } = await importModule();
            fetchMock.mockImplementation(() => Promise.resolve(mockJsonResponse(200, {
                choices: [{ message: { content: JSON.stringify({ questions: [{
                    text: 'What is the capital city of France?', options: ['A', 'B', 'C', 'D'], answer: 9,
                }] }) } }],
            })));

            await expect(generateQuestionsFromText({
                text: 'Syllabus content here. ' + 'x'.repeat(100),
                difficulty: 'medium',
                count: 1,
                isObjective: true,
            })).rejects.toThrow(/invalid answer index|rejected by validation/i);
        });
    });

    describe('11. Failed recovery never returns partial exams', () => {
        it('completes missing-count recovery without duplicate-content rejection', async () => {
            const { generateQuestionsFromText } = await importModule();
            fetchMock.mockImplementation(() => Promise.resolve(mockJsonResponse(200, buildMcqBody(2, 0))));

            const result = await generateQuestionsFromText({
                text: 'Syllabus content here. ' + 'x'.repeat(300),
                difficulty: 'medium',
                count: 6,
                isObjective: true,
            });

            expect(result).toHaveLength(6);
            expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
        });
    });

    describe('12. Mid-1 / Mid-2 / ESE complete paper validation', () => {
        const EXAM_CONFIG = {
            mid1: { type: 'subjective', totalMarks: 30, questionCount: 7, markSequence: [1, 4, 1, 8, 4, 8, 4] },
            mid2: { type: 'objective', totalMarks: 30, questionCount: 30 },
            ese: { type: 'subjective', totalMarks: 60, questionCount: 13, markSequence: [1, 4, 1, 8, 4, 2, 8, 4, 8, 4, 8, 4, 4] },
        };

        it('validates Mid-1 complete paper (7 questions, 30 marks)', async () => {
            const { generateQuestionsFromText } = await importModule();
            // count=7 > maxPerResponse(3) → batch1=3 (offset 0), batch2=3 (offset 3), batch3=1 (offset 6)
            // 3 mocks per attempt × 3 attempts = 9 mocks
            const bodies = [];
            const batches = [
                { count: 3, marks: [1, 4, 1], offset: 0 },
                { count: 3, marks: [8, 4, 8], offset: 3 },
                { count: 1, marks: [4], offset: 6 },
            ];
            for (let attempt = 0; attempt < 3; attempt += 1) {
                for (const b of batches) {
                    bodies.push(mockJsonResponse(200, buildTheoryBody(b.count, b.marks, b.offset)));
                }
            }
            bodies.forEach((body) => fetchMock.mockResolvedValueOnce(body));

            const result = await generateQuestionsFromText({
                text: 'Syllabus content here covering multiple chapters. ' + 'x'.repeat(500),
                difficulty: 'medium',
                count: 7,
                isObjective: false,
                marksForQuestions: EXAM_CONFIG.mid1.markSequence,
            });

            expect(result).toHaveLength(EXAM_CONFIG.mid1.questionCount);
            expect(result.map((q) => q.marks)).toEqual(EXAM_CONFIG.mid1.markSequence);
            expect(result.reduce((sum, q) => sum + q.marks, 0)).toBe(EXAM_CONFIG.mid1.totalMarks);
        });

        it('validates Mid-2 complete paper (30 questions)', async () => {
            const { generateQuestionsFromText } = await importModule();
            fetchMock.mockResolvedValueOnce(mockJsonResponse(200, buildMcqBody(30)));

            const result = await generateQuestionsFromText({
                text: 'Syllabus content for a full mid-term covering many topics. ' + 'x'.repeat(800),
                difficulty: 'medium',
                count: EXAM_CONFIG.mid2.questionCount,
                isObjective: true,
            });

            expect(result).toHaveLength(EXAM_CONFIG.mid2.questionCount);
            result.forEach((q) => expect(q.type).toBe('mcq'));
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('validates ESE complete paper (13 questions, 60 marks)', async () => {
            const { generateQuestionsFromText } = await importModule();
            // count=13 > maxPerResponse(3) → batch1=3, batch2=3, batch3=3, batch4=3, batch5=1
            // 3 mocks per attempt × 3 attempts = 15 mocks
            const bodies = [];
            const batches = [
                { count: 3, marks: [1, 4, 1], offset: 0 },
                { count: 3, marks: [8, 4, 2], offset: 3 },
                { count: 3, marks: [8, 4, 8], offset: 6 },
                { count: 3, marks: [4, 8, 4], offset: 9 },
                { count: 1, marks: [4], offset: 12 },
            ];
            for (let attempt = 0; attempt < 3; attempt += 1) {
                for (const b of batches) {
                    bodies.push(mockJsonResponse(200, buildTheoryBody(b.count, b.marks, b.offset)));
                }
            }
            bodies.forEach((body) => fetchMock.mockResolvedValueOnce(body));

            const result = await generateQuestionsFromText({
                text: 'Comprehensive syllabus content covering all chapters for final exam. ' + 'x'.repeat(800),
                difficulty: 'medium',
                count: 13,
                isObjective: false,
                marksForQuestions: EXAM_CONFIG.ese.markSequence,
            });

            expect(result).toHaveLength(EXAM_CONFIG.ese.questionCount);
            expect(result.map((q) => q.marks)).toEqual(EXAM_CONFIG.ese.markSequence);
            expect(result.reduce((sum, q) => sum + q.marks, 0)).toBe(EXAM_CONFIG.ese.totalMarks);
        });

        it('uses the configured ESE mark sequence even if Groq returns different marks', async () => {
            const { generateQuestionsFromText } = await importModule();
            const wrongMarks = Array(13).fill(4);
            const batches = [
                { count: 3, marks: wrongMarks.slice(0, 3), offset: 0 },
                { count: 3, marks: wrongMarks.slice(3, 6), offset: 3 },
                { count: 3, marks: wrongMarks.slice(6, 9), offset: 6 },
                { count: 3, marks: wrongMarks.slice(9, 12), offset: 9 },
                { count: 1, marks: wrongMarks.slice(12, 13), offset: 12 },
            ];
            batches.forEach(batch => {
                fetchMock.mockResolvedValueOnce(mockJsonResponse(
                    200,
                    buildTheoryBody(batch.count, batch.marks, batch.offset),
                ));
            });

            const result = await generateQuestionsFromText({
                text: 'Comprehensive syllabus content. ' + 'x'.repeat(500),
                difficulty: 'medium',
                count: 13,
                isObjective: false,
                marksForQuestions: EXAM_CONFIG.ese.markSequence,
            });

            expect(result.map(question => question.marks)).toEqual(EXAM_CONFIG.ese.markSequence);
            expect(result.reduce((sum, question) => sum + question.marks, 0)).toBe(60);
        });;
    });

    describe('parseModelQuestions', () => {
        it('extracts questions from a flat array', async () => {
            const { parseModelQuestions } = await importModule();
            const result = parseModelQuestions(JSON.stringify([{ text: 'What is the capital city of France?', options: ['A', 'B', 'C', 'D'], answer: 0 }]));
            expect(Array.isArray(result)).toBe(true);
        });

        it('extracts questions from an object with questions array', async () => {
            const { parseModelQuestions } = await importModule();
            const result = parseModelQuestions(JSON.stringify({ questions: [{ text: 'Explain concept?', marks: 4 }] }));
            expect(result).toEqual([{ text: 'Explain concept?', marks: 4 }]);
        });

        it('throws on empty string', async () => {
            const { parseModelQuestions } = await importModule();
            expect(() => parseModelQuestions('')).toThrow();
        });

        it('throws on non-JSON', async () => {
            const { parseModelQuestions } = await importModule();
            expect(() => parseModelQuestions('hello world')).toThrow(/invalid JSON/);
        });
    });
});
