const MAX_SOURCE_CHARS = 6000;
const MAX_RETRIES = 3;
const MAX_RATE_LIMIT_RETRIES = 4;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function parseRetryAfterSeconds(message) {
    const match = String(message ?? '').match(/try again in\s+([\d.]+)\s*s/i);
    return match ? Number(match[1]) : 0;
}

const VALID_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

function splitSourceIntoParts(text, partCount) {
    if (partCount <= 1) return [text];
    const parts = [];
    let start = 0;
    const targetSize = text.length / partCount;

    for (let part = 1; part < partCount; part += 1) {
        const target = Math.round(text.length * part / partCount);
        const minBoundary = Math.max(start + 1, Math.floor(target - targetSize * 0.35));
        const maxBoundary = Math.min(text.length - 1, Math.ceil(target + targetSize * 0.35));
        let boundary = text.indexOf('\n', target);
        if (boundary < minBoundary || boundary > maxBoundary) {
            boundary = text.lastIndexOf('\n', target);
        }
        if (boundary < minBoundary || boundary > maxBoundary) {
            boundary = text.indexOf(' ', target);
        }
        if (boundary < minBoundary || boundary > maxBoundary) {
            boundary = text.lastIndexOf(' ', target);
        }
        if (boundary < minBoundary || boundary > maxBoundary) boundary = target;
        parts.push(text.slice(start, boundary).trim());
        start = boundary < text.length && /\s/.test(text[boundary]) ? boundary + 1 : boundary;
    }
    parts.push(text.slice(start).trim());
    return parts;
}

const DIFFICULTY_BLUEPRINT = {
    easy: {
        label: 'Easy',
        reasoning: 'one-step understanding or a direct, basic application of an important syllabus concept',
        distractors: 'At least two distractors must be from the same concept family and plausibly attract a beginner with a recognizable misconception. The correct answer may be clearer after the key concept is applied, but it must not be revealed by absurd or unrelated choices.',
        traps: 'Use a straightforward stem, one decisive concept, and realistic near-misses. No trick wording or obscure facts.',
    },
    medium: {
        label: 'Medium',
        reasoning: 'application to a practical case, distinguishing close concepts, interpreting a result, or following two linked reasoning steps',
        distractors: 'At least two and preferably all three distractors should look reasonable at first glance. Each should represent a real nearby concept, a common wrong step, an incomplete answer, or a correct rule applied under the wrong condition. The stem must contain the condition that distinguishes the single best answer.',
        traps: 'Require the student to compare the options against the scenario. Do not merely attach a longer story to a recall question.',
    },
    hard: {
        label: 'Hard',
        reasoning: 'multi-step reasoning, a diagnosis or design choice with constraints, edge conditions, or comparison of competing plausible approaches',
        distractors: 'All three distractors must be technically plausible and at least partially correct in some context. Build traps from an omitted condition, a valid method used outside its assumptions, an incorrect intermediate step, or a solution that meets some but not all stated requirements. The keyed choice must be the only one that satisfies every explicit constraint.',
        traps: 'Include enough numerical, procedural, or scenario detail to support the reasoning. Confusion must come from genuine technical trade-offs, never vague wording, hidden assumptions, double negatives, or two defensible answers.',
    },
};

function shuffleWithAnswer(options, answerIndex) {
    const decorated = options.map((value, index) => ({
        value,
        isCorrect: index === answerIndex,
        sort: Math.random(),
    })).sort((a, b) => a.sort - b.sort);
    return {
        options: decorated.map(item => item.value),
        answer: decorated.findIndex(item => item.isCorrect),
    };
}

export function parseModelQuestions(cleaned) {
    let parsed;
    try {
        parsed = JSON.parse(cleaned);
    } catch {
        // Try to extract a JSON object from anywhere in the response
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('AI returned invalid JSON. Please retry question generation.');
        try {
            parsed = JSON.parse(match[0]);
        } catch {
            throw new Error('AI returned invalid JSON. Please retry question generation.');
        }
    }

    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.questions)) return parsed.questions;
    throw new Error('AI response must be a JSON object containing a questions array.');
}

function optionText(value) {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
    for (const key of ['text', 'label', 'value', 'option', 'content']) {
        const candidate = value[key];
        if (typeof candidate === 'string' || typeof candidate === 'number') {
            const normalized = String(candidate).trim();
            if (normalized) return normalized;
        }
    }
    return '';
}

// Models sometimes encode the same four options as objects or as A/B/C/D keys
// even when JSON-object mode is used. Canonicalize equivalent shapes, but never
// invent missing distractors: incomplete questions must still be retried.
function normalizeObjectiveQuestion(question) {
    if (!question || typeof question !== 'object' || Array.isArray(question)) return question;

    let rawOptions = question.options ?? question.choices ?? question.answers;
    if (!Array.isArray(rawOptions) && rawOptions && typeof rawOptions === 'object') {
        const letterKeys = ['A', 'B', 'C', 'D'];
        rawOptions = letterKeys.every((key) => Object.prototype.hasOwnProperty.call(rawOptions, key))
            ? letterKeys.map((key) => rawOptions[key])
            : Object.values(rawOptions);
    }
    if (!Array.isArray(rawOptions)) {
        const namedOptions = [
            question.optionA ?? question.option_a ?? question.A,
            question.optionB ?? question.option_b ?? question.B,
            question.optionC ?? question.option_c ?? question.C,
            question.optionD ?? question.option_d ?? question.D,
        ];
        rawOptions = namedOptions.some((value) => value !== undefined) ? namedOptions : rawOptions;
    }

    const options = Array.isArray(rawOptions) ? rawOptions.map(optionText) : rawOptions;
    let answer = question.answer ?? question.correctAnswer ?? question.correct_answer;
    if (typeof answer === 'string' && Array.isArray(options) && !/^[A-D]$/i.test(answer.trim())) {
        const answerText = answer.trim().toLocaleLowerCase();
        const matchingIndex = options.findIndex((option) => option.toLocaleLowerCase() === answerText);
        if (matchingIndex >= 0) answer = matchingIndex;
    }
    return { ...question, options, answer };
}

/**
 * Minimal response-shape checks only. Semantic quality, difficulty heuristics,
 * duplicate rejection, and option-plausibility filters are intentionally not
 * applied after generation. Groq receives these requirements in its prompt;
 * this layer only protects the exam UI's required data shape.
 */
function validateCommonQuestions(questions, count, isObjective = false) {
    if (!Array.isArray(questions) || questions.length !== count) {
        throw new Error(`AI response format error: expected ${count} question(s), received ${Array.isArray(questions) ? questions.length : 0}.`);
    }

    questions.forEach((question, index) => {
        if (!question || typeof question !== 'object' || Array.isArray(question)) {
            throw new Error(`AI response format error: question ${index + 1} is not an object.`);
        }
        const text = question.text ?? question.question;
        if (typeof text !== 'string' || !text.trim()) {
            throw new Error(`AI response format error: question ${index + 1} has no non-empty text field.`);
        }
        if (isObjective) {
            if (!Array.isArray(question.options) || question.options.length !== 4
                || question.options.some(option => typeof option !== 'string' || !option.trim())) {
                throw new Error(`AI response format error: MCQ ${index + 1} must contain four non-empty string options.`);
            }
            const answer = typeof question.answer === 'string' && /^[A-D]$/i.test(question.answer)
                ? question.answer.toUpperCase().charCodeAt(0) - 65
                : Number(question.answer);
            if (!Number.isInteger(answer) || answer < 0 || answer > 3) {
                throw new Error(`AI response format error: MCQ ${index + 1} must have an answer index from 0 to 3.`);
            }
        }
    });
}

/**
 * Build a correction prompt that tells the model exactly what went wrong so
 * the next attempt fixes the specific validation failure.
 */
function buildCorrectionPrompt(basePrompt, validationError, attempt) {
    // Avoid echoing an entire invalid payload into the next request. That can add
    // thousands of tokens and trigger the provider's TPM limit during recovery.
    return basePrompt + `\n\nPREVIOUS ATTEMPT HAD A RESPONSE-FORMAT ISSUE (attempt ${attempt} of ${MAX_RETRIES}):\n${validationError}\nRegenerate the complete requested output from the original material. Return corrected JSON only. Ensure the requested count, exactly four non-empty string MCQ options, a valid answer index, and requested theory marks. Do not reuse invalid option values.`;
}

export async function generateQuestionsFromText({
    text,
    difficulty = 'medium',
    count = 10,
    isObjective = true,
    marksForQuestions = null,
    recoveryDepth = 0,
    excludedQuestionTexts = [],
    maxSourceChars = MAX_SOURCE_CHARS,
}) {
    const sourceLimit = Number.isInteger(maxSourceChars) && maxSourceChars >= 100
        ? maxSourceChars
        : MAX_SOURCE_CHARS;
    const requestedDifficulty = VALID_DIFFICULTIES.has(difficulty) ? difficulty : 'medium';
    const blueprint = DIFFICULTY_BLUEPRINT[requestedDifficulty];
    if (typeof text !== 'string' || text.trim().length < 100) {
        throw new Error('There is not enough readable syllabus or study material to create reliable questions.');
    }
    if (!Number.isInteger(count) || count < 1 || count > 50) {
        throw new Error('Question count must be an integer between 1 and 50.');
    }

    // MCQ exams must be requested as one complete paper (Mid-2 = 30 MCQs).
    // Only theory exams use smaller internal requests.
    const maxPerResponse = 3;
    if (!isObjective && count > maxPerResponse) {
        const combined = [];
        const batchCountTotal = Math.ceil(count / maxPerResponse);
        // For long material, make a few balanced source sections and reuse each
        // section for nearby small batches instead of resending the entire source.
        // This preserves coverage while materially lowering tokens per minute.
        const sourcePartCount = text.length >= 3000
            ? Math.min(batchCountTotal, Math.max(2, Math.floor(text.length / 1800)))
            : 1;
        const sourceParts = splitSourceIntoParts(text, sourcePartCount);
        let batchIndex = 0;

        for (let offset = 0; offset < count; offset += maxPerResponse) {
            const batchCount = Math.min(maxPerResponse, count - offset);
            const batchMarks = Array.isArray(marksForQuestions)
                ? marksForQuestions.slice(offset, offset + batchCount)
                : null;
            const sourcePartIndex = Math.min(sourceParts.length - 1, Math.floor(batchIndex * sourceParts.length / batchCountTotal));
            const batch = await generateQuestionsFromText({
                text: sourceParts[sourcePartIndex],
                difficulty: requestedDifficulty,
                count: batchCount,
                isObjective,
                marksForQuestions: batchMarks,
                maxSourceChars: sourceLimit,
            });
            combined.push(...batch.map((question, index) => ({ ...question, id: `ai_q${offset + index}` })));
            batchIndex += 1;
        }
        // Cross-batch validation is necessary because each response is validated alone.
        validateCommonQuestions(combined, count, isObjective);
        return combined;
    }

    if (Array.isArray(marksForQuestions) && !isObjective && marksForQuestions.length !== count) {
        throw new Error('The assigned mark sequence must contain one mark value per theory question.');
    }

    // Make truncation explicit: the model must not infer that omitted material is absent from the source.
    const truncated = text.length > sourceLimit;
    const source = truncated
        ? text.slice(0, sourceLimit) + '\n\n[NOTE: SOURCE EXCERPT TRUNCATED. Treat only the visible material as evidence; do not make claims about what omitted text does or does not contain.]'
        : text;

    // Use JSON-object mode to avoid Groq's strict-schema generation validator
    // rejecting the output before the application's minimal format guard runs.
    // The exact requested format and count are stated explicitly in the prompt.
    const responseFormat = { type: 'json_object' };

    const systemMessage = isObjective
        ? `Create accurate, syllabus-grounded MCQs. Return only valid JSON matching the required schema: {"questions":[{"text":"...","options":["...","...","...","..."],"answer":0}]}. Four distinct options; answer index 0-3. No explanations, review fields, or IDs.` 
        : `Create accurate, syllabus-grounded theory questions. Return only valid JSON matching the required schema: {"questions":[{"text":"...","marks":4}]}. No answers, hints, marking schemes, or IDs.`

    const exclusionText = excludedQuestionTexts.length
        ? `ALREADY GENERATED — do not repeat these question stems: ${JSON.stringify(excludedQuestionTexts.map(stem => String(stem).slice(0, 180)))}\n`
        : '';

    let userPrompt;
    if (isObjective) {
        userPrompt = `Create exactly ${count} original single-answer MCQs based only on the study material.
DIFFICULTY: ${blueprint.label} (${requestedDifficulty}). Target: ${blueprint.reasoning}.
Distractors: ${blueprint.distractors}
Design: ${blueprint.traps}

Rules:
- Test distinct syllabus concepts using recall, application, calculation, interpretation, diagnosis, or comparison as appropriate.
- Include all conditions needed to identify exactly one correct answer; do not rely on unstated assumptions or ambiguous wording.
- Give four distinct, plausible options of similar type, specificity, and length. Wrong options should reflect realistic misconceptions, not random or unrelated facts.
- For medium/hard, the stem must contain a meaningful scenario, data, constraint, or reasoning task. Do not disguise recall with generic story wording.
- Avoid true/false, all/none-of-the-above, placeholders, invented facts, duplicate concepts, and predictable answer positions.
- Follow every requested count, difficulty, syllabus, option, answer-key, and JSON-format rule while generating. Return only the required JSON object, with no markdown or extra prose.

${exclusionText}
Study material:
---
${source}
---`;
    } else {
        userPrompt = `Create exactly ${count} unique open-ended theory questions using only the study material.
MARKS IN QUESTION ORDER: ${Array.isArray(marksForQuestions) ? JSON.stringify(marksForQuestions) : 'Use the caller-provided exam blueprint'}. Follow these marks exactly.
Mark depth: 1 mark = one concise fact/point (normally one sentence or 1–2 lines; no multi-part explanation); 2 marks = a compact answerable task; 4 marks = about four creditable points/steps; 8 marks = a bounded, fuller multi-step response.
DIFFICULTY: ${blueprint.label} (${requestedDifficulty}); target: ${blueprint.reasoning}.
Easy: foundational definition or one-step use. Medium: short application, calculation, comparison, or interpretation. Hard: multi-step analysis, diagnosis, design, or a justified decision.
Keep every question clear, distinct, fair, and syllabus-specific. Do not include answers, hints, or marking schemes. If the source is truncated, rely only on visible content.

${exclusionText}
Study material:
---
${source}
---`;
    }

    let lastError = null;
    let rateLimitRetries = 0;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            let response;
            try {
                response = await fetch('/api/ai', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        messages: [
                            { role: 'system', content: systemMessage },
                            { role: 'user', content: attempt > 1
                                ? buildCorrectionPrompt(userPrompt, lastError.message, attempt)
                                : userPrompt },
                        ],
                        model: 'openai/gpt-oss-20b',
                        response_format: responseFormat,
                        reasoning_effort: 'low',
                    }),
                });
            } catch (fetchError) {
                throw new Error(`Connection error while generating questions: ${fetchError.message}`);
            }

            if (!response.ok) {
                const errorBody = await response.json().catch(() => ({}));
                const message = errorBody.error?.message || response.status;
                const category = errorBody.error?.category || 'upstream';
                const providerCode = errorBody.error?.providerCode || errorBody.error?.code || '';
                const error = new Error(`AI generation failed: ${message}`);
                error.category = category;
                error.providerCode = providerCode;

                if (response.status === 429) {
                    error.isRateLimit = true;
                    error.retryAfter = Number(errorBody.error?.retryAfter)
                        || Number(response.headers.get('retry-after'))
                        || parseRetryAfterSeconds(message);
                }

                // JSON-object mode is used from the first request, so provider-side
                // JSON validation errors go through the normal bounded corrected-prompt retry.
                // Unsupported response-format/configuration errors are not retryable.
                throw error;
            }

            const data = await response.json();
            const rawContent = data?.choices?.[0]?.message?.content;
            if (typeof rawContent !== 'string' || !rawContent.trim()) {
                throw new Error('AI returned an empty response. Please retry generation.');
            }

            let cleaned = rawContent.trim();
            if (cleaned.includes('```')) {
                const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                if (match?.[1]) cleaned = match[1].trim();
            }

            const parsedQuestions = parseModelQuestions(cleaned);
            if (!Array.isArray(parsedQuestions) || parsedQuestions.length === 0) {
                throw new Error('AI returned no questions. Please retry generation.');
            }

            // Trust the generated content. If the provider over-returns, use the requested
            // count; if it under-returns, make a bounded request for only the missing items.
            const slicedQuestions = parsedQuestions.slice(0, count);
            const questions = isObjective
                ? slicedQuestions.map(normalizeObjectiveQuestion)
                : slicedQuestions;
            const isPartialResponse = questions.length < count;
            validateCommonQuestions(questions, questions.length, isObjective);

            const normalizedQuestions = questions.map((q, index) => {
                const text = String(q?.text || q?.question || '').trim();
                if (isObjective) {
                    let answer = typeof q.answer === 'string' && /^[A-D]$/i.test(q.answer)
                        ? q.answer.toUpperCase().charCodeAt(0) - 65
                        : Number(q.answer);
                    const opts = q.options.map(option => String(option ?? ''));
                    const randomized = shuffleWithAnswer(opts, answer);
                    return {
                        id: `ai_q${index}`,
                        text,
                        options: randomized.options,
                        answer: randomized.answer,
                        type: 'mcq',
                        difficulty: requestedDifficulty,
                    };
                }

                return {
                    id: `ai_q${index}`,
                    text,
                    marks: Array.isArray(marksForQuestions)
                        ? marksForQuestions[index]
                        : (Number.isInteger(Number(q.marks)) && Number(q.marks) > 0 ? Number(q.marks) : (count > 5 ? 14 : 7)),
                    type: 'subjective',
                    difficulty: requestedDifficulty,
                };
            });

            if (isPartialResponse) {
                if (recoveryDepth >= 2) {
                    throw new Error(`AI returned only ${normalizedQuestions.length} of ${count} requested questions after recovery attempts.`);
                }
                const missingCount = count - normalizedQuestions.length;
                const missingMarks = Array.isArray(marksForQuestions)
                    ? marksForQuestions.slice(normalizedQuestions.length)
                    : null;
                let missingQuestions;
                try {
                    missingQuestions = await generateQuestionsFromText({
                        text,
                        difficulty: requestedDifficulty,
                        count: missingCount,
                        isObjective,
                        marksForQuestions: missingMarks,
                        recoveryDepth: recoveryDepth + 1,
                        maxSourceChars: sourceLimit,
                        excludedQuestionTexts: [
                            ...excludedQuestionTexts,
                            ...normalizedQuestions.map(question => question.text),
                        ],
                    });
                } catch (recoveryError) {
                    const wrappedError = new Error(
                        `Could not recover the missing ${missingCount} question(s): ${recoveryError.message}`
                    );
                    wrappedError.partialRecoveryFailed = true;
                    throw wrappedError;
                }
                const combined = [...normalizedQuestions, ...missingQuestions]
                    .map((question, index) => ({ ...question, id: `ai_q${index}` }));
                validateCommonQuestions(combined, count, isObjective);
                return combined;
            }

            return normalizedQuestions;
        } catch (error) {
            lastError = error;
            console.error(`AI Generation / Validation Error (attempt ${attempt} of ${MAX_RETRIES}):`, error.message);
            // Recovery already performed its own bounded retries. Do not regenerate
            // the original partial batch when only the missing-question request failed.
            if (error.partialRecoveryFailed) throw error;
            // A repeated schema-configuration error is not made better by retrying.
            // Other failures (including json_validate_failed in JSON-object mode and
            // rate limits) continue through the bounded retry policy.
            if (error.category === 'schema_config') {
                break;
            }
            // Rate limits are temporary. Wait for Groq's reset hint and retry the same
            // validation attempt instead of treating this as a bad question or failing the exam.
            const rateLimited = error.isRateLimit || error.retryAfter > 0 || /rate limit reached|too many requests/i.test(error.message);
            if (rateLimited) {
                if (rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) {
                    throw new Error(`Groq rate limit persisted after ${MAX_RATE_LIMIT_RETRIES} retries. Please try generating the exam again. ${error.message}`);
                }
                rateLimitRetries += 1;
                const suggestedSeconds = error.retryAfter || parseRetryAfterSeconds(error.message);
                const backoffSeconds = Math.min(2 ** rateLimitRetries, 20);
                // Add a small buffer so the retry does not hit the same TPM window edge.
                const waitSeconds = Math.min(Math.max(suggestedSeconds || backoffSeconds, 1), 60) + 1;
                console.warn(`Groq TPM rate limit: retry ${rateLimitRetries}/${MAX_RATE_LIMIT_RETRIES} in ${waitSeconds.toFixed(1)}s.`);
                await sleep(waitSeconds * 1000);
                attempt -= 1;
                continue;
            }
            // Validation/format errors still use the normal bounded correction retries.
        }
    }

    // All retries exhausted
    throw new Error(`Question generation failed after ${MAX_RETRIES} attempts: ${lastError ? lastError.message : 'Unknown generation error'}`);
}
