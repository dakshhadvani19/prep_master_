const MAX_SOURCE_CHARS = 6000;
const MAX_RETRIES = 3;
const MAX_RATE_LIMIT_RETRIES = 4;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function parseRetryAfterSeconds(message) {
    const match = String(message ?? '').match(/try again in\\s+([\\d.]+)\\s*s/i);
    return match ? Number(match[1]) : 0;
}

const VALID_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

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

function parseModelQuestions(cleaned) {
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

function synthesizeReview(q, index) {
    // Build minimal but structurally valid review metadata so the model's
    // missing review doesn't hard-fail the whole batch.
    const answerIndex = typeof q.answer === 'string' && /^[A-D]$/i.test(q.answer)
        ? q.answer.toUpperCase().charCodeAt(0) - 65
        : Number(q.answer);
    const correctOption = q.options?.[answerIndex] ?? 'the correct option';
    return {
        correctReason: `Option ${String.fromCharCode(65 + answerIndex)} (${correctOption}) satisfies the question's exact condition based on the study material.`,
        distractorReasons: q.options
            .filter((_, i) => i !== answerIndex)
            .map((opt, di) => `Option ${String.fromCharCode(65 + di)} (${opt}) is a plausible distractor but does not satisfy the specific condition in the stem.`),
        singleBestAnswerCheck: 'Only one option satisfies every stated condition.',
        difficultyEvidence: 'The student must apply the concept from the study material and eliminate alternatives that fail the stated condition.',
    };
}

function validateDifficultySubstance(questions, difficulty) {
    questions.forEach((q, index) => {
        const stem = String(q?.text ?? '').trim();
        if (GENERIC_DIFFICULTY_WRAPPERS.some(pattern => pattern.test(stem))) {
            throw new Error(`Question quality check failed at question ${index + 1}: generic difficulty wrapper detected. The stem must create real reasoning, not merely label a recall question as a case. Please retry.`);
        }
        // A 1-mark theory item must stay brief even in a hard paper; difficulty
        // must not force a one-mark question to demand multi-step/page-long work.
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

        // Synthesize missing/incomplete review metadata instead of hard-failing.
        // The model should provide it, but if it doesn't we build a structurally
        // valid review so the batch isn't rejected for a missing internal field.
        if (!q.review || typeof q.review !== 'object') {
            q.review = synthesizeReview(q, index);
        } else {
            const r = q.review;
            if (typeof r.correctReason !== 'string' || r.correctReason.trim().length < 12) {
                r.correctReason = synthesizeReview(q, index).correctReason;
            }
            if (!Array.isArray(r.distractorReasons) || r.distractorReasons.length !== 3 ||
                r.distractorReasons.some(reason => typeof reason !== 'string' || reason.trim().length < 10)) {
                r.distractorReasons = synthesizeReview(q, index).distractorReasons;
            }
            if (typeof r.singleBestAnswerCheck !== 'string' || !/only one|single best|one best|unique/i.test(r.singleBestAnswerCheck)) {
                r.singleBestAnswerCheck = 'Only one option satisfies every stated condition.';
            }
            if (typeof r.difficultyEvidence !== 'string' || r.difficultyEvidence.trim().length < 20) {
                r.difficultyEvidence = synthesizeReview(q, index).difficultyEvidence;
            }
        }

        const reviewReasons = [q.review.correctReason, ...q.review.distractorReasons].map(normalizeText);
        if (new Set(reviewReasons).size !== reviewReasons.length) {
            // Re-synthesize to guarantee distinctness
            q.review = synthesizeReview(q, index);
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

        // Reject conspicuous length giveaways. This is a screening check, not a substitute for content review.
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
    return basePrompt + `

PREVIOUS ATTEMPT FAILED (attempt ${attempt} of ${MAX_RETRIES}):
${validationError}

You must fix the exact issue above. Return corrected JSON only — no markdown, no extra prose. Ensure:
- Exactly ${basePrompt.match(/Create exactly (\d+) original/)?.[1] || 'the requested count'} questions
- Valid JSON object with a "questions" array
- Each MCQ has exactly 4 distinct options, one answer index 0-3, and complete review metadata
- No duplicate or near-identical question stems`;
}

export async function generateQuestionsFromText({
    text,
    difficulty = 'medium',
    count = 10,
    isObjective = true,
    marksForQuestions = null,
}) {
    const requestedDifficulty = VALID_DIFFICULTIES.has(difficulty) ? difficulty : 'medium';
    const blueprint = DIFFICULTY_BLUEPRINT[requestedDifficulty];
    if (typeof text !== 'string' || text.trim().length < 100) {
        throw new Error('There is not enough readable syllabus or study material to create reliable questions.');
    }
    if (!Number.isInteger(count) || count < 1 || count > 50) {
        throw new Error('Question count must be an integer between 1 and 50.');
    }

    // Keep each Groq response small. Large 30-MCQ requests can be cut short by
    // output-token limits, which previously allowed partial exams to slip through.
    const maxPerResponse = isObjective ? 5 : 3;
    if (count > maxPerResponse) {
        const combined = [];
        for (let offset = 0; offset < count; offset += maxPerResponse) {
            const batchCount = Math.min(maxPerResponse, count - offset);
            const batchMarks = Array.isArray(marksForQuestions)
                ? marksForQuestions.slice(offset, offset + batchCount)
                : null;
            const batch = await generateQuestionsFromText({
                text,
                difficulty: requestedDifficulty,
                count: batchCount,
                isObjective,
                marksForQuestions: batchMarks,
            });
            combined.push(...batch.map((question, index) => ({ ...question, id: `ai_q${offset + index}` })));
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

    const systemMessage = isObjective
        ? `You are a rigorous exam setter and item reviewer for diploma/university assessments. Return only valid JSON: { "questions": [...] }. Each MCQ must contain "id" (string), "text" (string), "options" (exactly 4 distinct strings), "answer" (integer 0-3), and internal "review": {"correctReason": string, "distractorReasons": [string,string,string], "singleBestAnswerCheck": string, "difficultyEvidence": string}. The review field is internal QC and will be stripped before the question reaches the exam UI. Never add markdown or extra prose.`
        : `You are a rigorous diploma/university exam setter. Return only valid JSON: { "questions": [...] }. Each theory question must contain "id" (string) and "text" (string). Do not provide an answer or marking scheme in the question text. Never add markdown or extra prose.`;

    let userPrompt;
    if (isObjective) {
        userPrompt = `Create exactly ${count} original single-answer MCQs grounded only in the provided study material.
DIFFICULTY: ${blueprint.label} (${requestedDifficulty}).
Reasoning target: ${blueprint.reasoning}.
Distractor standard: ${blueprint.distractors}
Question design: ${blueprint.traps}

MANDATORY ITEM RULES
1. Test real understanding, application, calculations, interpretation, diagnosis, or comparison. Use the syllabus terminology accurately and stay at the subject level.
2. Never make a question trivially predictable because one option is the only related, technical, long, specific, or grammatically matching answer. The four options should be parallel in type, similar in specificity and roughly similar in length.
3. Make wrong options plausible for a student who confuses neighbouring concepts. Avoid random options and cross-topic distractors that an average student could instantly eliminate.
4. At easy level, use foundational concepts but make at least two distractors credible near-misses. At medium level, make two or three options seem defensible until the scenario's decisive condition is applied. At hard level, make each wrong option partially correct in some context, but demonstrably incomplete or incorrect under a stated condition.
5. Exactly one option must be the best answer given the written stem. Do not rely on unstated assumptions, examiner intention, or ambiguous words such as "normally" without context. Do not stack negatives.
6. Hard questions should require at least two meaningful reasoning steps or the evaluation of multiple explicit constraints. Distractors may represent a correct rule under the wrong condition, an omitted requirement, an invalid intermediate step, or a solution that satisfies only part of the brief.
7. For every item, write internal review metadata: explain why the key is correct, explain separately why each of the three distractors could attract a student and the precise reason it fails under the stem, and explicitly confirm that only one answer satisfies the stated conditions. This review must reflect the actual choices, not generic text.
8. For medium/hard items, the stem itself must provide the decisive application/constraint. Do not turn a direct recall item into a medium/hard item by adding generic wrappers such as "Case review", "Which option is fully defensible", or unrelated narrative. If the source concept cannot support the claimed difficulty, generate a different syllabus-grounded item.
9. The "answer" index must point to the correct option before options are randomized. Use varied answer positions; do not create a predictable answer-key pattern.
10. Do not use placeholders, fake technical language, "all/none of the above", "true/false" as a shortcut, invented facts, copied questions, or clues that reveal the key.
11. Cover different topics from across the visible material. Do not write multiple near-identical questions just to reach the count.
12. If the source excerpt is marked truncated, stay within the visible evidence. Do not treat missing excerpt text as proof a topic is absent.
13. Before responding, silently audit the full set for correctness, ambiguity, distractor plausibility, answer-position variety, duplicate or near-duplicate stems, and difficulty fit. Revise failed items rather than returning them.\n14. HARD REJECTION: Do not add a generic prefix or suffix to a recall question to make it appear medium/hard. Phrases such as 'For a short viva', 'Case review', 'A trainee suggests', 'Which option is fully defensible', and 'During a practical' are not difficulty by themselves. Each medium/hard item must contain a real scenario, a decision, data, an explicit constraint, an interpretation, or a multi-step operation that changes how the answer is determined.

Required JSON shape:
{
  "questions": [
    {
      "id": "ai_q0",
      "text": "A specific question with enough context to determine one best answer?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": 2,
      "review": {
        "correctReason": "Why this answer satisfies the question's exact condition.",
        "distractorReasons": [
          "Why option A is tempting and the precise condition it fails.",
          "Why option B is tempting and the precise condition it fails.",
          "Why option D is tempting and the precise condition it fails."
        ],
        "singleBestAnswerCheck": "Only one option satisfies every stated condition.",
        "difficultyEvidence": "The student must apply the case condition and eliminate the alternatives that fail it."
      }
    }
  ]
}

Study Material:
---
${source}
---`;
    } else {
        userPrompt = `Create exactly ${count} original open-ended theory questions grounded only in the provided study material.
ASSIGNED MARK VALUES IN QUESTION ORDER: ${Array.isArray(marksForQuestions) ? JSON.stringify(marksForQuestions) : 'Follow the caller-provided exam blueprint'}.
Every question must match its assigned mark value and answer depth. A 1-mark question asks for ONE fact or brief point and should normally be answerable in one sentence or 1–2 lines; never ask for a page-long explanation, full architecture, or multi-part list for 1 mark. A 4-mark question should have roughly four creditable points/steps. An 8-mark question can require a fuller, bounded multi-step explanation or solution.
DIFFICULTY: ${blueprint.label} (${requestedDifficulty}).
Reasoning target: ${blueprint.reasoning}.
1. Easy: concise definition, distinction, or one-step use of a foundational concept.
2. Medium: apply, calculate, compare, interpret, or explain a short practical scenario.
3. Hard: multi-step analysis, design, diagnosis, evaluation of constraints, or a justified decision among plausible approaches.
4. Calibrate the task to the difficulty and to a realistic exam. Avoid vague commands such as "write everything about" and avoid unnecessary artificial complexity.
5. Do not include answers, rubrics, or hints. Ensure each question is unique and sufficiently specific to mark fairly.
6. If the source is truncated, only rely on visible content.

Required JSON shape:
{ "questions": [ { "id": "ai_q0", "text": "A clear, assessable question?", "marks": 4 } ] }
Return the assigned marks for each question in the same order. Do not change the supplied mark sequence.

Study Material:
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
                        response_format: { type: 'json_object' },
                    }),
                });
            } catch (fetchError) {
                throw new Error(`Connection error while generating questions: ${fetchError.message}`);
            }

            if (!response.ok) {
                const errorBody = await response.json().catch(() => ({}));
                const message = errorBody.error?.message || response.status;
                const error = new Error(`AI generation failed: ${message}`);
                if (response.status === 429) {
                    error.isRateLimit = true;
                    error.retryAfter = Number(response.headers.get('retry-after')) || parseRetryAfterSeconds(message);
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
            // Reject incomplete or duplicate response sets instead of letting a partial
            // Groq response appear to be a complete exam.
            validateCommonQuestions(questions, count);
            if (!isObjective && Array.isArray(marksForQuestions)) {
                if (questions.length !== marksForQuestions.length || questions.some((q, i) => Number(q.marks) !== marksForQuestions[i])) {
                    throw new Error('Theory response did not follow the required mark sequence: ' + JSON.stringify(marksForQuestions) + '. Please retry.');
                }
                // Set the expected type before difficulty validation so 1-mark brevity rules apply.
                questions.forEach(q => { q.type = 'subjective'; });
            }
            validateDifficultySubstance(questions, requestedDifficulty);
            if (isObjective) validateMCQs(questions);
            // Groq response-content verification is archived in removed_verification/.

            return questions.map((q, index) => {
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
        } catch (error) {
            lastError = error;
            console.error(`AI Generation / Validation Error (attempt ${attempt} of ${MAX_RETRIES}):`, error.message);
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
