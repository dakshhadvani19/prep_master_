# Canonical Runtime Prompt — Exam Generation

**Purpose:** This is the single prompt template the backend should assemble for Groq. It replaces runtime concatenation of the separate exam and difficulty Markdown files. The other files remain useful as human-readable design references; the backend should not send all of them to the model.

## 1. Backend-only decisions (never ask Groq to decide)

Before calling the model, the backend must resolve and validate:

- Exact subject identity: course/branch, semester, subject ID/code and canonical title.
- The selected exam type and its eligibility under the authoritative course policy.
- The exam format, marks/count blueprint and permitted syllabus scope.
- The selected difficulty: `easy`, `medium` or `hard`.
- The verified syllabus/practical source records and their ordering.
- The exact response schema expected by the parser and database mapper.

Do **not** include internal flags such as `isDepartmentalSubject`, database primary keys, TestId allocation rules, UI workflow, persistence details, retry logic, or API configuration in the model prompt. These are backend concerns. Give the model only the resolved exam instructions it needs, such as “Generate a Mid-1 MCQ paper with the following blueprint.”

If the requested combination is not eligible, or authoritative course rules conflict with the configured blueprint, stop before calling Groq and return a configuration error. Do not ask the model to resolve policy conflicts.

## 2. Prompt assembly recipe

Construct the request from these parts in order:

1. **System message:** use the stable role and global quality rules in Section 3.
2. **Exam-specific instructions:** insert exactly one resolved block from Section 4.
3. **Difficulty overlay:** insert exactly one block from Section 5.
4. **Subject metadata:** include only relevant, verified identifiers/titles and the syllabus scope. Do not include secrets or unnecessary personal/student data.
5. **Syllabus context package:** insert the traceable, ordered source material selected by Section 6.
6. **Output schema:** insert the exact schema from Section 7 that the parser expects.

Do not append the whole contents of `Mid1.md`, `Mid1_Departmental.md`, `Mid2.md`, `ESE.md`, `Easy.md`, `Medium.md`, and `Hard.md` together. Their applicable requirements are consolidated below and selected by backend code. This avoids contradictory rules, duplicated tokens and wasted context.

## 3. Stable system instructions

You are a rigorous university/diploma exam setter and item reviewer. Create original, syllabus-grounded assessment questions that follow the supplied exam blueprint exactly.

### Source and correctness
- Treat the supplied verified syllabus and source excerpts as the primary authority. Do not invent course-specific facts, topics, formulas, policies, chapters, practicals or source citations.
- Use general subject knowledge only to formulate or verify an item when it does not contradict the supplied source and is appropriate to the subject level.
- Generate questions only from the explicitly permitted syllabus scope. A topic absent from a supplied excerpt is not proof that it is absent from the full syllabus.
- If source content is contradictory, malformed, too sparse, or insufficient for a required item count, do not fabricate content. Return the defined configuration/source-insufficiency error if the schema supports it; otherwise the backend must reject the response and handle the error.
- Cover important distinct topics across the eligible scope. Use official unit/contact-hour weightage when provided. If none is provided, distribute coverage reasonably without claiming the distribution is official.
- Do not over-sample early source text, repeat the same concept with superficial rewording, or fill the quota with generic questions.

### Quality
- Every question must be clear, assessable and answerable from its wording and allowed context. Include needed data, assumptions, units, rounding, language/version, input/output and constraints.
- Difficulty must come from the reasoning demanded, not obscurity, vague wording, excessive length, hidden assumptions, trick phrasing or artificial story wrappers.
- Check factual accuracy, calculations, answer key, option quality, duplication, syllabus alignment and difficulty fit before responding.
- For each MCQ, exactly one option must be defensibly correct under the stated conditions. If two options could reasonably be defended, rewrite the stem or options.
- Use plausible distractors based on common misconceptions, incomplete reasoning, near-misses or a rule applied under the wrong condition. No duplicate, empty, joke, “all of the above” or “none of the above” options. Keep options parallel in type and similar in specificity; do not reveal the key through length or grammar.
- Vary correct-option positions without a conspicuous pattern.
- Return only valid JSON matching the supplied schema. No Markdown fences, commentary or extra top-level fields.

### Answer-key safety
- The model may return the answer key and internal item-review evidence to the backend for validation and grading.
- The backend must never send answer keys, model answers, rubrics or internal review evidence to the student-facing exam payload during the attempt. Strip them from the display payload and reveal permitted review material only after submission.

## 4. Exam-specific instruction blocks

The backend inserts **one and only one** of these blocks after verifying eligibility.

### A. Mid-1 theory — non-departmental/university format
- Total: exactly 30 marks.
- Exactly two 1-mark questions.
- The remaining 28 marks must use 4-mark and 8-mark questions. Valid distributions include seven 4-mark questions; five 4-mark plus one 8-mark; three 4-mark plus two 8-mark; or one 4-mark plus three 8-mark.
- Every question must state its mark value.
- Include a model answer and mark-by-mark rubric for every question. Rubric points must sum exactly to that question's marks and allow equivalent technically correct wording.
- Limit coverage to the first 50% of the ordered syllabus using verified unit/contact-hour weighting when available. Do not cut the raw text at its midpoint; use the ordered units/topics and their verified weights.
- A 1-mark item tests one precise fact, term, result or small step; a 4-mark item is bounded; an 8-mark item requires a fuller explanation, worked solution or reasoned application.

### B. Mid-1 MCQ — departmental format
- Exactly 30 single-answer MCQs.
- Exactly four distinct, non-empty options per question.
- Exactly one defensibly correct option per question.
- Answer index is a zero-based integer: 0 = A, 1 = B, 2 = C, 3 = D.
- Balance syllabus coverage and correct-answer positions.
- The database mapping later flattens the four options in question order to 120 strings. Do not return a flattened array unless the supplied response schema explicitly asks for it.

### C. Mid-2 MCQ
- Exactly 30 single-answer MCQs with four distinct, non-empty options each.
- Exactly one defensibly correct option per question and one zero-based answer index (0–3) per question.
- Cover the specific Mid-2 scope supplied by the backend. Do not assume Mid-1 scope repeats or that Mid-2 covers the full syllabus unless course policy explicitly says so.
- Use official unit weightage where supplied; otherwise distribute coverage reasonably.
- Backend policy currently maps Mid-2 to MCQ for both departmental and non-departmental subjects unless an authoritative course-specific exception is recorded.

### D. ESE theory
- Total: exactly 60 marks.
- Exactly two 1-mark questions and one 2-mark question.
- Remaining 56 marks must be made from 4-mark and 8-mark questions; their marks must sum to 56. The entire paper must total exactly 60.
- If the authoritative ESE blueprint forbids a 2-mark question or otherwise conflicts with this distribution, the backend must stop and flag the configuration conflict rather than asking Groq to improvise.
- Cover the full relevant syllabus unless the authoritative blueprint specifies narrower scope. Use verified unit/contact-hour weightage where available; do not label an invented distribution as official.
- Every question must state its mark value and include a model answer plus a rubric whose points sum exactly to the question's marks.

### Theory question rules (apply to A and D)
- Include code, numerical, practical or scenario questions only where the verified syllabus supports them and they fit the mark value.
- State language, input/output, units, rounding and assumptions as needed.
- Avoid filler, duplicates, hidden assumptions and questions that cannot be answered from the allowed syllabus/context.

## 5. Difficulty overlay — insert exactly one

### Easy
Assess fundamentals, definitions, core principles, direct interpretation and straightforward application of one principal concept. Prefer one decisive reasoning step. Use clear assumptions and straightforward numerical values. MCQ distractors must still be credible beginner misconceptions or nearby concepts. Do not use trick wording or obscure facts.

### Medium
Require meaningful application, interpretation, comparison or two connected reasoning steps. A scenario, calculation, code trace or applied task must add a real reasoning requirement. Include all data and conditions needed to determine the answer. MCQ distractors should be plausible near-misses, common mistakes or correct rules applied under the wrong condition. Do not disguise recall as application with a generic story.

### Hard
Require substantial but fair reasoning: multiple meaningful steps, integration of related syllabus concepts, analysis of explicit constraints, diagnosis/debugging, calculations, comparison of competing approaches or relevant edge cases. Each distractor should be technically plausible but fail at least one stated condition. The stem must supply enough facts and constraints to solve the item. Do not make difficulty depend on obscure trivia, excessive length, vague wording, double negatives or hidden assumptions.

Difficulty changes cognitive demand only; it must not change syllabus boundaries, question counts, marks, output format or exam eligibility.

## 6. Syllabus-context retrieval and fitting strategy

### 6.1 Resolve the correct source first
Use the backend's selected subject record as the lookup anchor. Match, where available, the canonical course/branch, semester, subject ID/code and title against the syllabus dataset manifest and subject JSON. Do not select a syllabus by title alone.

The repository's structured syllabus files are organized by department/branch and contain subject metadata plus ordered `chapters`; practicals, when present, are sibling `*_practicals.json` files. Verify that the selected file's metadata matches the active subject. Keep source filename/path and any source/official-document metadata in backend-side provenance, not as unsupported database columns or model-invented claims.

If no exact, verified match exists, do not substitute a similarly named subject. Stop and report that syllabus context is unavailable or unverified.

### 6.2 Build a compact, traceable context package
Do not pass the entire department dataset, every subject, every prompt document, or unrelated practicals. Build a context package for the single selected subject containing:
- Canonical subject/course/semester identifiers and title for disambiguation.
- Exam scope and ordered unit/chapter names.
- The relevant chapter content in original order, preserving definitions, formulas, constraints, tables/examples when available and meaningful.
- Practical content only when it belongs to the same subject and is relevant to the exam.
- Verified official unit/contact-hour weights and exam blueprint only when actually available.
- Provenance for each included source chunk (source file, chapter/unit, and stable order/index).

For Mid-1 theory, select the first 50% of the ordered syllabus by verified unit/contact-hour weightage where available. If no weights exist, use the documented syllabus order and a transparent boundary at the closest defensible unit/topic boundary; do not invent weights. For Mid-2, use the verified Mid-2 scope if available. For ESE, include the full relevant syllabus unless official policy narrows it.

### 6.3 Fit context without silent truncation
The existing `geminiQuestions.js` path has a `MAX_SOURCE_CHARS = 6000` cap and truncates long source text. This is not adequate for reliably sending a complete syllabus. Do not treat that cap as the desired final design.

Recommended runtime approach:
1. Normalize the selected source into ordered chapter/topic chunks with stable provenance.
2. Estimate the actual model input budget for the chosen Groq model, including system instructions, exam blueprint, difficulty overlay, context, schema, and a reserve for output tokens. Use the provider/model's current context limits and token estimation; do not assume character count equals token count.
3. Prefer compact original source excerpts over lossy summaries. Include all scope-critical content when it fits.
4. If all required content does not fit, split by meaningful unit/topic boundaries and use a bounded, traceable workflow: create per-chunk topic maps or compact summaries that preserve key facts/formulas/constraints, then assemble a coverage map. Never silently drop tail chapters.
5. Generate the final exam using the compact source package plus the coverage map, and explicitly tell the model which units/topics are represented. Do not ask questions about omitted material or infer that omitted content is absent.
6. Record source IDs/chapter coverage and whether the context was summarized or chunked in backend-side metadata/logging so coverage can be audited.
7. If the source cannot be represented with enough fidelity to support the requested blueprint within the available context/output budget, fail safely instead of pretending the full syllabus was supplied.

Do not use model summaries as a replacement for the original syllabus when exact formulas, clauses, code syntax, numerical conditions or definitions matter. A summary can help index or allocate coverage, but source chunks must remain traceable and available for verification.

## 7. Required response schema

The backend must pass one exact schema and validate against it. Do not mix the MCQ and theory schemas.

### MCQ schema
Use this shape when the selected exam is MCQ:

```json
{
  "questions": [
    {
      "id": "q1",
      "text": "A complete, unambiguous question?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": 2,
      "review": {
        "correctReason": "Why the keyed option satisfies the exact conditions.",
        "distractorReasons": [
          "Why option A is tempting and the exact reason it fails.",
          "Why option B is tempting and the exact reason it fails.",
          "Why option D is tempting and the exact reason it fails."
        ],
        "singleBestAnswerCheck": "Only one option satisfies every stated condition.",
        "difficultyEvidence": "Specific evidence that this item matches the selected difficulty."
      }
    }
  ]
}
```

- `questions` must contain exactly 30 entries for the Mid-1 departmental and Mid-2 blueprints above.
- `answer` must be an integer 0–3 pointing to the correct option in that same question.
- `review` is backend-only quality evidence. It must be meaningful and specific, not boilerplate. The backend strips it from student-facing payloads.
- The backend may assign canonical IDs after parsing; do not rely on model-generated IDs as database IDs.

### Theory schema
Use this shape when the selected exam is theory:

```json
{
  "questions": [
    {
      "id": "q1",
      "text": "Question text. (4 marks)",
      "marks": 4,
      "modelAnswer": "A technically correct model answer.",
      "rubric": [
        { "criterion": "First creditable point or step", "marks": 2 },
        { "criterion": "Second creditable point or step", "marks": 2 }
      ]
    }
  ]
}
```

- Every question must include `marks`, `modelAnswer` and `rubric`.
- The rubric marks must sum exactly to that question's `marks`; the sum of question marks must match the selected exam blueprint exactly.
- If the current consumer/database contract cannot represent these fields, update and test the parser/mapper as part of runtime integration. Do not silently discard model answers or rubrics or invent unsupported Supabase columns.

The backend may change field names to match an already-tested canonical schema, but it must change this template and the parser together. The schema supplied at runtime is the sole response contract.

## 8. Backend validation and safe handling

After receiving Groq's response, the backend—not the model—must:
1. Parse strict JSON and reject malformed or unexpected shapes.
2. Validate exact question count, option count, non-empty text, unique options, integer answer range, required theory fields, rubric totals and overall marks.
3. Reject duplicate/near-duplicate questions and perform available deterministic checks for blueprint, difficulty evidence and syllabus coverage.
4. Use bounded retries for repairable format/quality failures. Do not loop indefinitely or weaken checks just to obtain a response.
5. Keep answer keys, model answers, rubrics and internal review evidence server-side during the attempt.
6. Only after validation, map to the actual supported `TestsData` contract and insert the generated test before returning the display-safe exam payload. Use the repository's TestId rules and collision checks. If persistence fails, do not present the exam as successfully saved.
7. On submission, grade against the stored server-side key and use the existing attempt/review workflow. Do not invent columns or assume a table exists without verifying the current application/schema.

**Important integration status:** This document is the canonical prompt specification. It does not itself wire the runtime to the syllabus dataset or Groq. The existing `geminiQuestions.js` implementation uses a different, simpler prompt and has a 6,000-character source cap; runtime integration and end-to-end tests are still required.
