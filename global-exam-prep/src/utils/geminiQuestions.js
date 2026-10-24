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

function normalizeText(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

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

/**
 * Build a portable strict Groq JSON Schema for MCQs.
 * Exact question count, four-option cardinality, and semantic rules are
 * enforced by local validators instead of JSON Schema array-size constraints.
 */
export function buildMcqSchema(count) {
    return {
        type: 'json_schema',
        json_schema: {
            name: 'mcq_exam',
            strict: true,
            schema: {
                type: 'object',
                properties: {
                    questions: {
                        type: 'array',
                        minItems: count,
                        maxItems: count,
                        items: {
                            type: 'object',
                            properties: {
                                text: { type: 'string' },
                                options: {
                                    type: 'array',
                                    minItems: 4,
                                    maxItems: 4,
                                    items: { type: 'string' },
                                },
                                answer: { type: 'integer', enum: [0, 1, 2, 3] },
                            },
                            required: ['text', 'options', 'answer'],
                            additionalProperties: false,
                        },
                    },
                },
                required: ['questions'],
                additionalProperties: false,
            },
        },
    };
}

/**
 * Build a portable strict Groq JSON Schema for theory questions.
 * Exact question count and caller-provided mark sequence are validated locally.
 */
export function buildTheorySchema(count) {
    return {
        type: 'json_schema',
        json_schema: {
            name: 'theory_exam',
            strict: true,
            schema: {
                type: 'object',
                properties: {
                    questions: {
                        type: 'array',
                        minItems: count,
                        maxItems: count,
                        items: {
                            type: 'object',
                            properties: {
                                text: { type: 'string' },
                                marks: { type: 'integer' },
                            },
                            required: ['text', 'marks'],
                            additionalProperties: false,
                        },
                    },
                },
                required: ['questions'],
                additionalProperties: false,
            },
        },
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

const GENERIC_DIFFICULTY_WRAPPERS = [
    /^(case review|case study|a case review|a trainee suggests|during a .* exercise|in a .* case|for a short viva|a worked problem requires|a student must distinguish|a solution review checks)\b/i,
    /which option (is fully defensible|best satisfies the requirement|is best in this case)\??$/i,
];

function validateDifficultySubstance(questions, difficulty) {
    questions.forEach((q, index) => {
        const stem = String(q?.text ?? '').trim();
        if (GENERIC_DIFFICULTY_WRAPPERS.some(pattern => pattern.test(stem))) {
            throw new Error(`Question quality check failed at question ${index + 1}: generic difficulty wrapper detected. The stem must create real reasoning, not merely label a recall question as a case. Please retry.`);
        }
        // A 1-mark theory item must stay brief even in a hard paper; difficulty
        // must not force a one-mark question to demand multi-part/page-long work.
        if (q?.type === 'subjective' && Number(q?.marks) === 1) {
            const multiPartCommand = /\b(explain|describe|discuss|analy[sz]e|evaluate|compare|differentiate|elaborate|illustrate|justify|outline|enumerate|derive|prove|design|construct|write a program|write an algorithm)\b/i.test(stem);
            if (stem.length > 180 || multiPartCommand) {
                throw new Error(`Question quality check failed at question ${index + 1}: a 1-mark item must ask for one concise fact or point, not a multi-part explanation.`);
            }
            return;
        }
        if (difficulty === 'medium' || difficulty === 'hard') {
            const lower = normalizeText(stem);
            const genericLead = /^(during|in|for|a student|a trainee|case review|case study|a design review|a worked problem)/i.test(stem);
            const substantiveCue = /\b(if|when|given|because|although|however|must|requires|constraint|result|output|error|debug|compare|choose|select|calculate|determine|interpret|recommend|design|diagnose|under which|provided that|only if|whereas|instead)\b/i.test(lower)
                || /[=<>≤≥+*/]/.test(stem)
                || /\b\d+\b/.test(stem);
            if (genericLead && !substantiveCue) {
                throw new Error(`Question quality check failed at question ${index + 1}: scenario wording adds no usable condition. Please retry with a decision, data, constraint, or real application.`);
            }
        }
        if (difficulty === 'hard') {
            const reasoningCueCount = [
                /\b(if|when|given|provided that|only if|unless)\b/i.test(stem),
                /\b(compare|evaluate|diagnose|design|justify|recommend|determine|interpret|debug|optimize)\b/i.test(stem),
                /\b(constraint|requirement|limitation|trade.?off|edge case|error|output|result|condition)\b/i.test(stem),
                /\b\d+\b|[=<>≤≥+*/]/.test(stem),
            ].filter(Boolean).length;
            if (reasoningCueCount < 2) {
                throw new Error(`Question quality check failed at question ${index + 1}: hard difficulty needs observable multi-step reasoning, a constraint, data, or a meaningful diagnosis/design task. Please retry.`);
            }
        }
    });
}

function validateCommonQuestions(questions, count) {
    if (!Array.isArray(questions) || questions.length !== count) {
        throw new Error(`Question quality check failed: expected exactly ${count} questions, received ${Array.isArray(questions) ? questions.length : 0}. Please retry.`);
    }

    const seen = new Set();
    const seenTokenSets = [];
    for (const [index, q] of questions.entries()) {
        const text = typeof q?.text === 'string' ? q.text.trim() : '';
        const normalized = normalizeText(text);
        if (text.length < 12) throw new Error(`Question ${index + 1} is empty or too short. Please retry generation.`);
        if (seen.has(normalized)) throw new Error(`Question quality check failed: exact duplicate question at position ${index + 1}. Please retry.`);
        seen.add(normalized);
        const tokens = new Set(normalized.split(/[^a-z0-9]+/).filter(token => token.length > 2));
        const nearDuplicate = seenTokenSets.some(previous => {
            const intersection = [...tokens].filter(token => previous.has(token)).length;
            const union = new Set([...tokens, ...previous]).size;
            return union > 0 && intersection / union >= 0.82;
        });
        if (nearDuplicate) throw new Error(`Question quality check failed: near-duplicate question at position ${index + 1}. Please retry with a distinct concept or reasoning task.`);
        seenTokenSets.push(tokens);
    }
}

function validateMCQs(questions) {
    const forbiddenOptions = new Set(['true', 'false', 'none of the above', 'all of the above', 'both a and b', 'all options']);
    questions.forEach((q, index) => {
        if (!Array.isArray(q.options) || q.options.length !== 4 ||
            q.options.some(option => typeof option !== 'string' || !option.trim())) {
            throw new Error(`MCQ quality check failed at question ${index + 1}: exactly four non-empty options are required. Please retry.`);
        }
        const normalizedOptions = q.options.map(normalizeText);
        if (new Set(normalizedOptions).size !== 4) {
            throw new Error(`MCQ quality check failed at question ${index + 1}: options must be distinct. Please retry.`);
        }
        if (normalizedOptions.some(option => forbiddenOptions.has(option))) {
            throw new Error(`MCQ quality check failed at question ${index + 1}: generic shortcut options are not allowed. Please retry.`);
        }
        const answer = typeof q.answer === 'string' && /^[A-D]$/i.test(q.answer)
            ? q.answer.toUpperCase().charCodeAt(0) - 65
            : Number(q.answer);
        if (!Number.isInteger(answer) || answer < 0 || answer > 3) {
            throw new Error(`MCQ quality check failed at question ${index + 1}: answer must be an integer from 0 to 3. Please retry.`);
        }

        const bannedPatterns = [
            /rigorous definition\s*\/\s*mechanism/i,
            /highly plausible edge.case/i,
            /standard misconception related to/i,
            /common failure state of/i,
            /technically accurate but theoretically irrelevant/i,
            /inverse or corrupted boundary of/i,
        ];
        if ([q.text, ...q.options].some(value => bannedPatterns.some(pattern => pattern.test(value)))) {
            throw new Error(`MCQ quality check failed at question ${index + 1}: generic placeholder content is not allowed. Please retry.`);
        }

        const lengths = q.options.map(option => normalizeText(option).length).sort((a, b) => a - b);
        const medianLength = (lengths[1] + lengths[2]) / 2;
        if (medianLength >= 18 && lengths[3] > Math.max(medianLength * 2.25, medianLength + 28)) {
            throw new Error(`MCQ quality check failed at question ${index + 1}: one option is a conspicuous length outlier. Please retry.`);
        }
    });
}

/**
 * Build a correction prompt that tells the model exactly what went wrong so
 * the next attempt fixes the specific validation failure.
 */
function buildCorrectionPrompt(basePrompt, validationError, attempt) {
    return basePrompt + `\n\nPREVIOUS ATTEMPT FAILED (attempt ${attempt} of ${MAX_RETRIES}):\n${validationError}\n\nYou must fix the exact issue above. Return corrected JSON only — no markdown, no extra prose. Ensure:\n- Exactly ${basePrompt.match(/Create exactly (\d+)/)?.[1] || 'the requested count'} questions\n- Valid JSON object with a "questions" array\n- Each MCQ has exactly 4 distinct options and one answer index 0-3\n- No duplicate or near-identical question stems`;
}

export async function generateQuestionsFromText({
    text,
    difficulty = 'medium',
    count = 10,
    isObjective = true,
    marksForQuestions = null,
    recoveryDepth = 0,
    excludedQuestionTexts = [],
}) {
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
            });
            combined.push(...batch.map((question, index) => ({ ...question, id: `ai_q${offset + index}` })));
            batchIndex += 1;
        }
        // Cross-batch validation is necessary because each response is validated alone.
        validateCommonQuestions(combined, count);
        return combined;
    }

    if (Array.isArray(marksForQuestions) && !isObjective && marksForQuestions.length !== count) {
        throw new Error('The assigned mark sequence must contain one mark value per theory question.');
    }

    // Make truncation explicit: the model must not infer that omitted material is absent from the source.
    const truncated = text.length > MAX_SOURCE_CHARS;
    const source = truncated
        ? text.slice(0, MAX_SOURCE_CHARS) + '\n\n[NOTE: SOURCE EXCERPT TRUNCATED. Treat only the visible material as evidence; do not make claims about what omitted text does or does not contain.]'
        : text;

    // Build strict JSON Schema for structured output. This enforces the response
    // shape at the API level, drastically reducing invalid-JSON failures.
    const responseFormat = isObjective
        ? buildMcqSchema(count)
        : buildTheorySchema(count);

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
- Silently verify the key, all options, uniqueness, grounding, and difficulty before answering. Output only the required JSON; do not include explanations.

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
    let schemaFallbackAttempted = false;
    let currentResponseFormat = responseFormat;

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
                        response_format: currentResponseFormat,
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

                // Groq sometimes rejects a generation with code json_validate_failed.
                // That is distinct from an unsupported schema. Retry once in JSON-object
                // mode, then use bounded retries and local validation if the transient
                // provider-side validation failure persists.
                const jsonValidationFailure = providerCode === 'json_validate_failed'
                    || /failed to validate json|generated json does not match|json_validate_failed/i.test(message);
                if ((category === 'schema_config' || jsonValidationFailure) && !schemaFallbackAttempted) {
                    schemaFallbackAttempted = true;
                    currentResponseFormat = { type: 'json_object' };
                    console.warn(
                        jsonValidationFailure
                            ? 'Groq JSON validation failed; retrying once in json_object mode with local validation.'
                            : 'Strict json_schema is unsupported; retrying in json_object mode with local validation.'
                    );
                    attempt -= 1; // fallback does not consume a generation retry
                    continue;
                }
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

            const questions = parseModelQuestions(cleaned);
            if (!Array.isArray(questions) || questions.length === 0) {
                throw new Error('AI returned no questions. Please retry generation.');
            }
            // Validate all returned items. A short response is recovered below by
            // requesting only the missing questions; it is never accepted as a full batch.
            const isPartialResponse = questions.length < count;
            if (questions.length > count) {
                validateCommonQuestions(questions, count);
            } else {
                validateCommonQuestions(questions, questions.length);
            }
            if (!isObjective && Array.isArray(marksForQuestions)) {
                const expectedMarks = marksForQuestions.slice(0, questions.length);
                if (questions.some((q, i) => Number(q.marks) !== expectedMarks[i])) {
                    throw new Error('Theory response did not follow the required mark sequence: ' + JSON.stringify(expectedMarks) + '. Please retry.');
                }
                // Set the expected type before difficulty validation so 1-mark brevity rules apply.
                questions.forEach(q => { q.type = 'subjective'; });
            }
            validateDifficultySubstance(questions, requestedDifficulty);
            if (isObjective) validateMCQs(questions);

            const normalizedQuestions = questions.map((q, index) => {
                const text = String(q?.text || q?.question || '').trim() || 'Error reading question text';
                if (isObjective) {
                    let answer = typeof q.answer === 'string' && /^[A-D]$/i.test(q.answer)
                        ? q.answer.toUpperCase().charCodeAt(0) - 65
                        : Number(q.answer);
                    const opts = q.options.map(option => String(option).trim());
                    if (!Number.isInteger(answer) || answer < 0 || answer > 3) {
                        throw new Error(`MCQ ${index + 1} has an invalid answer index.`);
                    }
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
                    marks: Number.isInteger(q.marks) && q.marks > 0 ? q.marks : (Array.isArray(marksForQuestions) ? marksForQuestions[index] : (count > 5 ? 14 : 7)),
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
                validateCommonQuestions(combined, count);
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
            if (schemaFallbackAttempted && error.category === 'schema_config') {
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
    throw new Error(`Question generation rejected by validation: ${lastError ? lastError.message : 'Unknown error after ' + MAX_RETRIES + ' attempts'}`);
}
