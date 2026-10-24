import {
  exclusionList,
  filterUniqueQuestions,
} from './questionUniqueness.js';

export const GROQ_MODEL = 'llama-3.1-8b-instant';
export const MAX_GENERATION_ROUNDS = 4;
export const MCQ_BATCH_SIZE = 10;

const DIFFICULTY_DESC = {
  easy: 'foundational, testing basic recall and definitions',
  medium: 'moderately challenging, testing understanding and application',
  hard: 'advanced, requiring analysis and deep understanding',
};

function uniquenessRules() {
  return `You must generate the exact number of questions requested.

Every question in this response must test a distinct knowledge point or require genuinely different reasoning.

Do not repeat a question already generated in this response.
Do not create superficial paraphrases of another question.
Do not repeat the same question across different batches of this exam.
Do not reproduce questions from the supplied existing-question exclusion list.

Vary the concepts, scenarios, examples, code, and reasoning required.
Remain strictly aligned with the supplied subject syllabus.
Do not sacrifice correctness or syllabus alignment to achieve variety.

Before returning the response, review the entire question set for exact duplicates, paraphrased duplicates, repeated concepts expressed as equivalent questions, invalid questions, and incorrect answers.

Return only the required structured JSON object matching the requested schema. No markdown, no code fences, no extra text.`;
}

function systemMessage(isObjective) {
  return isObjective
    ? 'You are an expert university exam question creator. Always respond with a valid JSON object with a single key "questions" whose value is an array of MCQ objects. Each question object MUST have: "id" (string), "text" (string), "options" (array of exactly 4 distinct strings), "answer" (integer 0-3). Do not include any markdown, code fences, or extra text.'
    : 'You are an expert university exam question creator. Always respond with a valid JSON object with a single key "questions" whose value is an array of theory question objects. Each object MUST have: "id" (string), "text" (string). Do not include answers, markdown, code fences, or extra text.';
}

function userPrompt({ truncated, difficulty, difficultyDesc, count, isObjective, exclude }) {
  const excludeBlock = exclude
    ? `\nExisting-question exclusion list (do not repeat or paraphrase any of these):\n${exclude}\n`
    : '';
  if (isObjective) {
    return `Generate exactly ${count} multiple choice questions (MCQs) based on the study material below.
Difficulty: ${difficulty} — ${difficultyDesc}.
${uniquenessRules()}
RULES:
- Each question must have exactly 4 distinct options (no duplicates).
- "answer" must be the 0-based index of the correct option (0=A, 1=B, 2=C, 3=D).
- Wrong options must be plausible but clearly incorrect to an expert.
- Cover varied topics from across the material.
${excludeBlock}
Required JSON format:
{
  "questions": [
    {
      "id": "ai_q0",
      "text": "Question text?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": 0
    }
  ]
}

Study Material:
---
${truncated}
---`;
  }
  return `Generate exactly ${count} open-ended theory/subjective questions based on the study material below.
Difficulty: ${difficulty} — ${difficultyDesc}.
${uniquenessRules()}
RULES:
- Questions must require descriptive answers, problem-solving, or proofs.
- Do NOT provide the answer, only the question text.
- Cover varied topics from across the material.
${excludeBlock}
Required JSON format:
{
  "questions": [
    {
      "id": "ai_q0",
      "text": "Question text?"
    }
  ]
}

Study Material:
---
${truncated}
---`;
}

export function parseGroqQuestions(payload) {
  let cleaned = '';
  if (payload && payload.choices && payload.choices[0] && payload.choices[0].message) {
    cleaned = String(payload.choices[0].message.content || '').trim();
  } else if (typeof payload === 'string') {
    cleaned = payload.trim();
  } else {
    cleaned = JSON.stringify(payload || {});
  }

  if (cleaned.includes('```')) {
    const matches = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (matches && matches[1]) cleaned = matches[1].trim();
  }

  const extract = (parsed) => {
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.questions)) return parsed.questions;
      if (Array.isArray(parsed.data)) return parsed.data;
      const arrays = Object.values(parsed).filter((val) => Array.isArray(val));
      if (arrays.length > 0) return arrays[0];
    }
    return [];
  };

  try {
    return extract(JSON.parse(cleaned));
  } catch {
    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (objectMatch) {
      try {
        return extract(JSON.parse(objectMatch[0]));
      } catch {
        /* fall through */
      }
    }
    if (arrayMatch) {
      try {
        const arr = JSON.parse(arrayMatch[0]);
        return Array.isArray(arr) ? arr : [];
      } catch {
        /* fall through */
      }
    }
    const err = new Error('AI returned invalid formatting. Please try generating again.');
    err.code = 'invalid_json';
    throw err;
  }
}

function batchSizes(total, isObjective) {
  if (!isObjective || total <= MCQ_BATCH_SIZE) return [total];
  const sizes = [];
  let left = total;
  while (left > 0) {
    const n = Math.min(MCQ_BATCH_SIZE, left);
    sizes.push(n);
    left -= n;
  }
  return sizes;
}

function logDiag(event, fields) {
  const safe = {
    event,
    model: fields.model,
    batch: fields.batch,
    round: fields.round,
    requested: fields.requested,
    parsed: fields.parsed,
    accepted: fields.accepted,
    rejected: fields.rejected,
    rejectReasons: fields.rejectReasons,
    requestId: fields.requestId || null,
  };
  console.info('[groq-gen]', JSON.stringify(safe));
}

async function postGroq({ messages, model, fetchFn, temperature }) {
  const res = await fetchFn('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      model,
      response_format: { type: 'json_object' },
      temperature,
    }),
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const msg = errorBody.error?.message || String(res.status);
    const err = new Error(`AI generation failed: ${msg}`);
    if (errorBody.error?.retryAfter) err.retryAfter = errorBody.error.retryAfter;
    throw err;
  }
  return res.json();
}

function finalize(accepted, isObjective, count) {
  return accepted.map((q, idx) => {
    if (isObjective) {
      return {
        id: 'ai_q' + idx,
        text: q.text,
        options: q.options,
        answer: q.answer,
        type: 'mcq',
      };
    }
    return {
      id: 'ai_q' + idx,
      text: q.text,
      marks: count > 5 ? 14 : 7,
      type: 'subjective',
    };
  });
}

export async function generateQuestionsFromText(
  { text, difficulty = 'medium', count = 10, isObjective = true },
  { fetchFn, model = GROQ_MODEL, maxRounds = MAX_GENERATION_ROUNDS, temperature = 0.7 } = {}
) {
  const doFetch = fetchFn || fetch;
  const MAX_CHARS = 6000;
  const truncated = text.length > MAX_CHARS
    ? text.slice(0, MAX_CHARS) + '\n\n[Content truncated for length]'
    : text;
  const difficultyDesc = DIFFICULTY_DESC[difficulty] || DIFFICULTY_DESC.medium;
  const needed = Number(count) || 0;
  if (needed < 1) throw new Error('Invalid question count.');

  const accepted = [];
  const sizes = batchSizes(needed, isObjective);
  let round = 0;
  let batchIndex = 0;

  const requestBatch = async (n, exclude) => {
    round += 1;
    batchIndex += 1;
    let data;
    try {
      data = await postGroq({
      messages: [
        { role: 'system', content: systemMessage(isObjective) },
        {
          role: 'user',
          content: userPrompt({
            truncated,
            difficulty,
            difficultyDesc,
            count: n,
            isObjective,
            exclude,
          }),
        },
      ],
      model,
      fetchFn: doFetch,
      temperature,
    });
    } catch (callErr) {
      logDiag('batch_error', {
        model,
        batch: batchIndex,
        round,
        requested: n,
        parsed: 0,
        accepted: 0,
        rejected: 0,
        rejectReasons: { api: 1 },
        requestId: null,
      });
      throw callErr;
    }
    let parsed;
    try {
      parsed = parseGroqQuestions(data);
    } catch (parseErr) {
      logDiag('invalid_json', {
        model,
        batch: batchIndex,
        round,
        requested: n,
        parsed: 0,
        accepted: 0,
        rejected: 0,
        rejectReasons: { invalid_json: 1 },
        requestId: data?.id || null,
      });
      return { kept: [], rejected: [{ reason: 'invalid_json' }], parsed: [] };
    }
    const { kept, rejected } = filterUniqueQuestions(parsed, accepted, { isObjective });
    const reasons = {};
    for (const r of rejected) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
    logDiag('batch', {
      model,
      batch: batchIndex,
      round,
      requested: n,
      parsed: parsed.length,
      accepted: kept.length,
      rejected: rejected.length,
      rejectReasons: reasons,
      requestId: data?.id || data?.x_request_id || null,
    });
    accepted.push(...kept);
    return { kept, rejected, parsed };
  };

  try {
    for (const n of sizes) {
      const stillNeed = needed - accepted.length;
      if (stillNeed <= 0) break;
      await requestBatch(Math.min(n, stillNeed), exclusionList(accepted));
    }

    while (accepted.length < needed && round < maxRounds) {
      const stillNeed = needed - accepted.length;
      await requestBatch(stillNeed, exclusionList(accepted));
    }

    if (accepted.length < needed) {
      const err = new Error(
        `Could not generate ${needed} unique syllabus-aligned questions (got ${accepted.length}). The syllabus may be too limited, or the model repeated content.`
      );
      err.code = 'insufficient_unique';
      err.acceptedCount = accepted.length;
      throw err;
    }

    return finalize(accepted.slice(0, needed), isObjective, needed);
  } catch (err) {
    console.error('AI Generation Error:', err);
    throw new Error(err.retryAfter ? err.message : `AI Error: ${err.message}`);
  }
}
