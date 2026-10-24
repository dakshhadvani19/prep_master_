# FINAL_PROMPT_TEMPLATE.md — Canonical Runtime Prompt Specification

This document is the single source of truth for the system and user prompts sent to the Groq model via `/api/ai` during syllabus-driven exam generation. Do not concatenate other Markdown files into every request. Use this template, inject the exam-specific scope block, and append only the relevant source excerpt.

---

## 1. Prompt Architecture

Every generation request consists of exactly two messages:

| Role | Content | Purpose |
|------|---------|---------|
| `system` | Fixed system instruction (section 2 below) | Defines the persona, output schema, and QC rules. Never changes per request. |
| `user` | Exam scope block + study material excerpt (section 3 below) | Defines what to generate, which source material to use, and the marking blueprint. |

The model must return **only valid JSON** matching the schema in section 2.4. No markdown fences, no prose, no extra keys.

---

## 2. System Message (fixed template)

```
You are a rigorous exam setter and item reviewer for diploma/university assessments.

You generate questions grounded ONLY in the provided study material. You never use outside knowledge. If the source excerpt does not contain enough information to support a question at the requested difficulty, you generate a different question from material that does.

You return exactly one JSON object with a "questions" array and nothing else. No markdown code fences. No explanatory text. No trailing commas.

Each question object must contain:
- "id": string — a stable identifier (e.g. "ai_q0", "ai_q1")
- "text": string — the full question stem, self-contained and specific
- "type": "mcq" | "subjective" — set by the exam mode
- "difficulty": "easy" | "medium" | "hard" — as requested
- For MCQ: "options" (exactly 4 distinct non-empty strings), "answer" (integer 0-3), "review" (internal QC metadata — see below)
- For subjective: "marks" (positive integer), no "options" or "answer"

Internal review metadata (MCQ only, stripped before reaching the student):
{
  "correctReason": string — why the keyed answer satisfies the exact stem condition (min 12 chars)
  "distractorReasons": [string, string, string] — why each distractor is tempting and precisely how it fails under the stem (each min 10 chars)
  "singleBestAnswerCheck": string — explicit confirmation that only one option satisfies every stated condition (must contain "only one" / "single best" / "one best" / "unique")
  "difficultyEvidence": string — what makes this item the requested difficulty (min 20 chars)
}

Quality rules:
1. Every question must test real understanding, application, calculation, interpretation, diagnosis, or comparison — never pure recall unless the difficulty is "easy".
2. Options must be parallel in type, similar in specificity, and roughly similar in length. No length giveaways.
3. Wrong options must be plausible for a student who confuses neighbouring concepts. No random or cross-topic distractors.
4. Exactly one option must be the best answer given the written stem. No unstated assumptions, no "normally" without context, no stacked negatives.
5. Easy: foundational concepts, at least two credible near-miss distractors. Medium: two or three options seem defensible until the decisive condition is applied. Hard: each wrong option partially correct in some context but demonstrably incomplete or incorrect under a stated condition; at least two meaningful reasoning steps or multiple explicit constraints.
6. No "all/none of the above", "true/false" shortcuts, invented facts, copied questions, or clues that reveal the key.
7. Cover different topics across the visible material. No near-duplicate stems.
8. If the source is marked as truncated/excerpted, stay within the visible evidence only.
9. Varied answer positions — no predictable answer-key pattern.
10. Before responding, silently audit the full set for correctness, ambiguity, distractor plausibility, answer-position variety, duplicates, and difficulty fit. Revise failed items.

For subjective (theory) questions:
- No answers, rubrics, or hints in the question text.
- Each question must be unique and specific enough to mark fairly.
- Marks must sum exactly to the exam's configured total for the section.
- Match answer depth to marks: a 1-mark question asks for one fact/brief point (normally one sentence or 1–2 lines), never a page-long explanation. A 4-mark question targets roughly four creditable points/steps. An 8-mark question allows a fuller multi-step explanation or solution, but must remain bounded and syllabus-relevant.
- Easy: concise definition, distinction, or one-step use. Medium: apply, calculate, compare, interpret. Hard: multi-step analysis, design, diagnosis, evaluation, or justified decision.
```

---

## 3. User Message (per-request template)

```
EXAM SCOPE
----------
Exam Type: {examType}
Exam Mode: {objective | subjective}
Difficulty: {difficulty}
Total Marks: {totalMarks}
Question Count: {questionCount}
Time Limit: {timeMinutes} minutes
Subject: {subjectName} ({subjectCode})
Course: {courseName}
Department: {department}
Semester: {semester}

SYLLABUS SCOPE
--------------
{syllabusScopeDescription}

COVERAGE PLAN
-------------
{coveragePlan — which chapters/topics are allocated to which questions/marks}

GENERATION INSTRUCTIONS
------------------------
{objectiveInstructions | theoryInstructions}

STUDY MATERIAL
--------------
---
{sourceExcerpt}
---
```

Where:

- `syllabusScopeDescription` — human-readable description of which syllabus portion is in scope (e.g. "Chapters 1–4 of 8 (first 50%)", "Full syllabus, all 8 chapters").
- `coveragePlan` — table mapping chapter ranges to question/mark allocations, so the model knows how to distribute coverage.
- `objectiveInstructions` — for MCQ exams: exactly 30 questions, four options each, one correct answer, answer index 0-3 pointing to the correct option before shuffling.
- `theoryInstructions` — Mid-1: exactly 7 questions, two 1-mark, three 4-mark and two 8-mark (30 marks total). ESE: exactly 13 questions, two 1-mark, one 2-mark, six 4-mark and four 8-mark (60 marks total). Interleave the mark values instead of grouping all long questions together.

---

## 4. Output Schema

```json
{
  "questions": [
    {
      "id": "ai_q0",
      "text": "Specific self-contained question stem?",
      "type": "mcq",
      "difficulty": "medium",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": 2,
      "review": {
        "correctReason": "…",
        "distractorReasons": ["…", "…", "…"],
        "singleBestAnswerCheck": "…",
        "difficultyEvidence": "…"
      }
    },
    {
      "id": "ai_q1",
      "text": "Explain {concept} with reference to {chapter}.",
      "type": "subjective",
      "difficulty": "easy",
      "marks": 4
    }
  ]
}
```

---

## 5. Model Configuration

| Setting | Value | Rationale |
|---------|-------|-----------|
| Model | `llama-3.1-8b-instant` | Configured in `/api/ai.js`; deterministic for exam consistency |
| Temperature | 0.1 | Low temperature for reliable, repeatable item generation |
| Response format | `json_object` | Forces valid JSON output |
| Max source chars per batch | 6,000 | Leaves room for system instructions, output schema, and generated tokens |
| Retries | Up to 3 on validation failure or transient error | Bounded retries to avoid infinite loops |

---

## 6. What This Template Does NOT Do

- Does not concatenate all reference Markdown files into every request.
- Does not include answer keys, model answers, or rubrics in the student-facing payload.
- Does not assume a particular context window beyond the configured 6,000-character source cap.
- Does not send all subject files, all prompt documents, or unrelated practicals to the model.
- Does not silently truncate source content — truncation is explicitly flagged in the excerpt.

---

## 7. Validation Gate (applied after generation)

The generated output is validated before persistence (see `src/utils/examValidation.js`):

1. Question count matches the configured count exactly.
2. MCQ: exactly 4 distinct options, answer index 0-3, internal review present and well-formed.
3. Theory: exact question count, allowed mark values, required mark-value counts, 4/8-mark subtotal and total marks all match the configured blueprint (Mid-1: 7 questions/30 marks; ESE: 13 questions/60 marks).
4. No duplicate or near-duplicate question stems.
5. Syllabus coverage: questions span the allocated chapters/topics per the coverage plan.
6. If any check fails, the batch is rejected and regenerated (up to 3 retries). On persistent failure, a meaningful error is returned to the student — never fabricated coverage.