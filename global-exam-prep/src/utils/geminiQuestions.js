export async function generateQuestionsFromText({ text, difficulty = 'medium', count = 10, isObjective = true }) {
    const MAX_CHARS = 6000; // Reduced to prevent 502 timeouts on large content
    const truncated = text.length > MAX_CHARS
        ? text.slice(0, MAX_CHARS) + '\n\n[Content truncated for length]'
        : text;

    const difficultyDesc = {
        easy: 'foundational, testing basic recall and definitions',
        medium: 'moderately challenging, testing understanding and application',
        hard: 'advanced, requiring analysis and deep understanding',
    }[difficulty] || 'moderately challenging';

    // System message and user prompt MUST agree on the wrapper format.
    // response_format: { type: 'json_object' } requires an object (not a bare array),
    // so we always wrap in { "questions": [...] }.
    const systemMessage = isObjective
        ? 'You are an expert university exam question creator. Always respond with a valid JSON object with a single key "questions" whose value is an array of MCQ objects. Each question object MUST have: "id" (string), "text" (string), "options" (array of exactly 4 strings), "answer" (integer 0-3). Do not include any markdown, code fences, or extra text.'
        : 'You are an expert university exam question creator. Always respond with a valid JSON object with a single key "questions" whose value is an array of theory question objects. Each object MUST have: "id" (string), "text" (string). Do not include answers, markdown, code fences, or extra text.';

    let userPrompt = '';

    if (isObjective) {
        userPrompt = `Generate exactly ${count} multiple choice questions (MCQs) based on the study material below.
Difficulty: ${difficulty} — ${difficultyDesc}.
RULES:
- Each question must have exactly 4 distinct options (no duplicates).
- "answer" must be the 0-based index of the correct option (0=A, 1=B, 2=C, 3=D).
- Wrong options must be plausible but clearly incorrect to an expert.
- Cover varied topics from across the material.

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
    } else {
        userPrompt = `Generate exactly ${count} open-ended theory/subjective questions based on the study material below.
Difficulty: ${difficulty} — ${difficultyDesc}.
RULES:
- Questions must require descriptive answers, problem-solving, or proofs.
- Do NOT provide the answer, only the question text.
- Cover varied topics from across the material.

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

    try {
        let res;
        try {
            console.log("Generating questions via Groq (Fast Lane)...");
            res = await fetch('/api/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [
                        { role: 'system', content: systemMessage },
                        { role: 'user', content: userPrompt }
                    ],
                    model: 'llama-3.1-8b-instant',
                    response_format: { type: 'json_object' }
                })
            });
        } catch (fetchErr) {
            console.error('Groq fetch error:', fetchErr);
            throw new Error(`Connection Error: ${fetchErr.message}`);
        }

        if (!res.ok) {
            const errorBody = await res.json().catch(() => ({}));
            console.error('Groq Error Body:', errorBody);
            throw new Error(`AI generation failed: ${errorBody.error?.message || res.status}`);
        }

        const data = await res.json();
        
        // Handle OpenAI/Groq response format
        let cleaned = "";
        if (data.choices && data.choices[0] && data.choices[0].message) {
            cleaned = data.choices[0].message.content.trim();
        } else {
            cleaned = JSON.stringify(data);
        }
        
        // Strip markdown code fences if any
        if (cleaned.includes('```')) {
            const matches = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (matches && matches[1]) {
                cleaned = matches[1].trim();
            }
        }

        let questions = [];
        try {
            let parsed = JSON.parse(cleaned);

            // The model should always return { "questions": [...] } but handle other shapes
            if (Array.isArray(parsed)) {
                questions = parsed;
            } else if (parsed && typeof parsed === 'object') {
                if (Array.isArray(parsed.questions)) {
                    questions = parsed.questions;
                } else if (Array.isArray(parsed.data)) {
                    questions = parsed.data;
                } else {
                    // Last resort: pick first array value
                    const arrays = Object.values(parsed).filter(val => Array.isArray(val));
                    if (arrays.length > 0) questions = arrays[0];
                }
            }
        } catch (parseError) {
            console.error('Initial JSON Parse Failed. Data Received:', cleaned);
            
            // Regex fallback: find first { ... } block
            const objectMatch = cleaned.match(/\{[\s\S]*\}/);
            const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
            try {
                if (objectMatch) {
                    const p = JSON.parse(objectMatch[0]);
                    questions = p.questions || p.data || Object.values(p).find(v => Array.isArray(v)) || [];
                } else if (arrayMatch) {
                    questions = JSON.parse(arrayMatch[0]);
                } else {
                    throw new Error('No JSON structure found in response.');
                }
            } catch (fallbackError) {
                console.error('AI Extraction Failed. Text:', cleaned);
                throw new Error('AI returned invalid formatting. Please try generating again.');
            }
        }

        if (!Array.isArray(questions) || questions.length === 0) {
            throw new Error('AI returned no questions. Please try again with different content.');
        }

        // Fallback options in case AI still produces malformed options
        const FALLBACK_OPTIONS = ['True', 'False', 'None of the above', 'All of the above'];

        return questions.map((q, idx) => {
            if (isObjective) {
                let rawAns = q.answer !== undefined ? q.answer : 0;
                if (typeof rawAns === 'string') {
                    if (rawAns.match(/^[A-Da-d]$/)) {
                        rawAns = rawAns.toUpperCase().charCodeAt(0) - 65; // A=0, B=1, etc.
                    } else {
                        rawAns = parseInt(rawAns, 10);
                    }
                }

                // Ensure exactly 4 options
                let opts = Array.isArray(q.options) ? q.options : FALLBACK_OPTIONS;
                if (opts.length < 4) {
                    opts = [...opts, ...FALLBACK_OPTIONS.slice(opts.length)];
                } else if (opts.length > 4) {
                    opts = opts.slice(0, 4);
                }
                // Clamp answer to valid range
                const ans = isNaN(rawAns) || rawAns < 0 || rawAns > 3 ? 0 : rawAns;

                return {
                    id: 'ai_q' + idx,
                    text: q.text || q.question || 'Error reading question text',
                    options: opts,
                    answer: ans,
                    type: 'mcq',
                };
            } else {
                return {
                    id: 'ai_q' + idx,
                    text: q.text || q.question || 'Error reading question text',
                    marks: count > 5 ? 14 : 7,
                    type: 'subjective',
                };
            }
        });
    } catch (err) {
        console.error('AI Generation Error:', err);
        throw new Error(err.retryAfter ? err.message : `AI Error: ${err.message}`);
    }
}

