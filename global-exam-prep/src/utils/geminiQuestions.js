const MAX_SOURCE_CHARS = 6000;
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
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('AI returned invalid JSON. Please retry question generation.');
        parsed = JSON.parse(match[0]);
    }

    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.questions)) return parsed.questions;
    throw new Error('AI response must be a JSON object containing a questions array.');
}

function validateCommonQuestions(questions, count) {
    if (!Array.isArray(questions) || questions.length !== count) {
        throw new Error(`Question quality check failed: expected exactly ${count} questions, received ${Array.isArray(questions) ? questions.length : 0}. Please retry.`);
    }

    const seen = new Set();
    for (const [index, q] of questions.entries()) {
        const text = typeof q?.text === 'string' ? q.text.trim() : '';
        const normalized = normalizeText(text);
        if (text.length < 12) throw new Error(`Question ${index + 1} is empty or too short. Please retry generation.`);
        if (seen.has(normalized)) throw new Error(`Question quality check failed: duplicate question at position ${index + 1}. Please retry.`);
        seen.add(normalized);
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

        // Internal review metadata is mandatory for MCQs. It is never exposed in the returned question.
        const review = q.review;
        if (!review || typeof review.correctReason !== 'string' || review.correctReason.trim().length < 12 ||
            !Array.isArray(review.distractorReasons) || review.distractorReasons.length !== 3 ||
            review.distractorReasons.some(reason => typeof reason !== 'string' || reason.trim().length < 10) ||
            typeof review.singleBestAnswerCheck !== 'string' || !/only one|single best|one best|unique/i.test(review.singleBestAnswerCheck) ||
            typeof review.difficultyEvidence !== 'string' || review.difficultyEvidence.trim().length < 20) {
            throw new Error(`MCQ quality check failed at question ${index + 1}: answer and all three distractors need a meaningful internal review. Please retry.`);
        }

        const reviewReasons = [review.correctReason, ...review.distractorReasons].map(normalizeText);
        if (new Set(reviewReasons).size !== reviewReasons.length) {
            throw new Error(`MCQ quality check failed at question ${index + 1}: review reasons must be specific to the key and each distractor. Please retry.`);
        }

        const bannedPatterns = [
            /rigorous definition\\s*\\/\\s*mechanism/i,
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

export async function generateQuestionsFromText({
    text,
    difficulty = 'medium',
    count = 10,
    isObjective = true,
}) {
    const requestedDifficulty = VALID_DIFFICULTIES.has(difficulty) ? difficulty : 'medium';
    const blueprint = DIFFICULTY_BLUEPRINT[requestedDifficulty];
    if (typeof text !== 'string' || text.trim().length < 100) {
        throw new Error('There is not enough readable syllabus or study material to create reliable questions.');
    }
    if (!Number.isInteger(count) || count < 1 || count > 50) {
        throw new Error('Question count must be an integer between 1 and 50.');
    }

    // Make truncation explicit: the model must not infer that omitted material is absent from the source.
    const truncated = text.length > MAX_SOURCE_CHARS;
    const source = truncated
        ? text.slice(0, MAX_SOURCE_CHARS) + '\\n\\n[NOTE: SOURCE EXCERPT TRUNCATED. Treat only the visible material as evidence; do not make claims about what omitted text does or does not contain.]'
        : text;

    const systemMessage = isObjective
        ? `You are a rigorous exam setter and item reviewer for diploma/university assessments. Return only valid JSON: { "questions": [...] }. Each MCQ must contain "id" (string), "text" (string), "options" (exactly 4 distinct strings), "answer" (integer 0-3), and internal "review": {"correctReason": string, "distractorReasons": [string,string,string], "singleBestAnswerCheck": string}. The review field is internal QC and will be stripped before the question reaches the exam UI. Never add markdown or extra prose.`
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
13. Before responding, silently audit the full set for correctness, ambiguity, distractor plausibility, answer-position variety, duplicate or near-duplicate stems, and difficulty fit. Revise failed items rather than returning them.

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
DIFFICULTY: ${blueprint.label} (${requestedDifficulty}).
Reasoning target: ${blueprint.reasoning}.
1. Easy: concise definition, distinction, or one-step use of a foundational concept.
2. Medium: apply, calculate, compare, interpret, or explain a short practical scenario.
3. Hard: multi-step analysis, design, diagnosis, evaluation of constraints, or a justified decision among plausible approaches.
4. Calibrate the task to the difficulty and to a realistic exam. Avoid vague commands such as "write everything about" and avoid unnecessary artificial complexity.
5. Do not include answers, rubrics, or hints. Ensure each question is unique and sufficiently specific to mark fairly.
6. If the source is truncated, only rely on visible content.

Required JSON shape:
{ "questions": [ { "id": "ai_q0", "text": "A clear, assessable question?" } ] }

Study Material:
---
${source}
---`;
    }

    try {
        let response;
        try {
            response = await fetch('/api/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [
                        { role: 'system', content: systemMessage },
                        { role: 'user', content: userPrompt },
                    ],
                    model: 'llama-3.1-8b-instant',
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
            if (response.status === 429) error.retryAfter = Number(response.headers.get('retry-after')) || 0;
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
        validateCommonQuestions(questions, count);
        if (isObjective) validateMCQs(questions);

        return questions.map((q, index) => {
            const text = q.text.trim();
            if (isObjective) {
                let answer = typeof q.answer === 'string' && /^[A-D]$/i.test(q.answer)
                    ? q.answer.toUpperCase().charCodeAt(0) - 65
                    : Number(q.answer);
                const randomized = shuffleWithAnswer(q.options.map(option => option.trim()), answer);
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
                marks: Number.isInteger(q.marks) && q.marks > 0 ? q.marks : (count > 5 ? 14 : 7),
                type: 'subjective',
                difficulty: requestedDifficulty,
            };
        });
    } catch (error) {
        console.error('AI Generation / Validation Error:', error);
        throw new Error(error.retryAfter ? error.message : `Question generation rejected by validation: ${error.message}`);
    }
}
