# Syllabus Context Fitting — Runtime Implementation Contract

**Status:** Implementation-ready design for Arena. This document resolves how the app should select, scope, fit, and pass syllabus content to Groq. It is a design contract, not a claim that runtime integration is already implemented.

## Decision in one line

**Fetch one exact subject JSON, select the exam-eligible ordered chapters, and send the complete selected scope whenever it fits. If it does not fit, split at chapter/topic boundaries and generate bounded batches with a shared coverage plan; never silently truncate the source.**

Do not load all 2,420 JSON files into the browser bundle or send the whole dataset to Groq.

## 1. Runtime data layout

The dataset is organized as:

- Syllabus: `<department>/<course-or-branch>/<subject-file>.json`
- Optional practicals: sibling `*_practicals.json`
- Subject JSON: `schema_version`, `status`, `subject` metadata, ordered `chapters[]`
- Chapter: `chapter_number`, `chapter_name`, `content[]`
- Practical: `subject` metadata and ordered `practicals[]`

### Delivery recommendation

Keep source JSON files as static assets, not JavaScript imports. During build/deployment, place or copy the dataset under a stable public path such as `/syllabus-data/`, and publish a small index/manifest that maps normalized identifiers to exact syllabus and practical URLs. Fetch only the chosen subject JSON and its matching practical file.

Do not use `import.meta.glob(..., { eager: true })` for all JSON files; that can pull the full dataset into the app bundle. If the hosting/deployment path cannot serve these files publicly, expose a server endpoint that reads the same files. Do not put Groq API keys in frontend code; the current Vite proxy is development-only unless a real server route exists in production.

## 2. Resolve the exact subject before loading content

Use database-selected subject metadata as the anchor. Resolve a unique dataset entry using the strongest available fields in this order:

1. Subject code / stable subject ID, when present on both sides.
2. Course or branch + semester.
3. Canonical subject title as an additional check, not the sole lookup key.
4. Department/category mapping.

Normalize for matching only (case, whitespace, Unicode punctuation); preserve the original values in the displayed/source content. If multiple candidates remain, metadata conflicts, or no candidate matches, stop with a typed `SYLLABUS_NOT_FOUND` or `SYLLABUS_AMBIGUOUS` error. Do not guess based on a similar title.

Validate that the syllabus record has `status === "ready"`, a non-empty `chapters` array, and non-empty chapter names/content. Match the practical file to the same subject code/name, branch, and semester before using it. Practicals are optional and must never be borrowed from a similarly named subject.

## 3. Select the allowed syllabus scope

First normalize chapters to a stable ordered list. Do not alphabetize chapters; source order is authoritative.

- **Mid-1 theory:** first 50% of syllabus scope. If reliable unit/contact-hour weights exist, choose the ordered boundary nearest 50% cumulative weight without skipping earlier units. Otherwise choose the chapter boundary nearest half of the ordered chapters. Do not split a chapter merely to hit an exact percentage unless the syllabus itself provides topic-level boundaries.
- **Mid-2 MCQ:** use an explicit verified Mid-2 scope if configured. If no such scope exists, use the existing documented policy only if the app's course policy explicitly defines it; do not assume silently that Mid-2 means the second half.
- **ESE theory:** all ordered chapters in the relevant subject unless an authoritative exam blueprint narrows it.
- **Practicals:** include only for an exam type where practical material is allowed and only when useful to the specified subject/exam. Do not let practicals replace theory syllabus coverage.

Keep a `scopeManifest` with selected chapter numbers/names, omitted chapter numbers/names and reason, source path, matching metadata, and whether official weights were available.

## 4. Budget calculation — token-aware, not character truncation

The existing `geminiQuestions.js` uses `MAX_SOURCE_CHARS = 6000` and truncates text. Remove that truncation behavior during integration.

For the chosen model, configure/read its supported context window and maximum output tokens. Compute:

```text
usableInputTokens =
  modelContextWindowTokens
  - reservedOutputTokens
  - fixedPromptTokens
  - safetyMarginTokens
```

- `fixedPromptTokens` includes system rules, exactly one exam blueprint, exactly one difficulty overlay, subject metadata, output schema and coverage instructions.
- Reserve output capacity based on the requested format; MCQs include internal review fields, and theory includes model answers and rubrics. Do not allocate the entire context window to source input.
- If a tokenizer for the chosen model is available server-side, use it. Otherwise estimate conservatively (e.g. approximately 1 token per 3 characters for mixed technical text), and keep a safety margin. This estimate is a guardrail, not an exact tokenizer.
- Log estimated prompt tokens, selected source characters, selected chapter IDs, model, output reserve, and whether batching was needed. Never log API keys or student secrets.

## 5. Context fitting algorithm

### Preferred path: one request

1. Serialize the selected scope in original order, with clear delimiters and provenance for each chapter.
2. Estimate the total request tokens including the fixed prompt and schema.
3. If it fits `usableInputTokens`, send the complete selected scope in one request.
4. Do not summarize or rewrite source text unnecessarily when the complete scope fits.

### Overflow path: deterministic chapter/topic batching

If the selected scope does not fit:

1. Convert chapters into ordered source chunks. Start with one chapter per chunk; split an oversized chapter only at existing topic headings or content-entry boundaries. If needed, split a content entry at paragraph/newline boundaries. Never drop a tail or silently slice a string.
2. If a single indivisible source entry still exceeds the available source budget, fail with `SYLLABUS_CHUNK_TOO_LARGE`; do not truncate it.
3. Build a compact **coverage plan** listing every selected chapter/topic and assigning planned questions/marks to them. The plan must satisfy the whole-paper blueprint before generation starts.
4. Group contiguous chunks into batches that fit the token budget. Preserve original chapter order and stable source IDs.
5. Generate questions per batch using the same exam rules and difficulty overlay, but only for the question/mark allocation assigned to that batch. Explicitly forbid questions from topics not present in that batch.
6. Keep batch size small enough for reliable quality review. For MCQs, target batches of about 5 questions; for theory, batch by complete question/mark allocations, not by splitting an individual question across calls.
7. Combine the batch results, then run whole-paper validation: exact question count/marks, duplicates across batches, coverage-plan adherence, answer index/option validity, rubric totals, and correct-answer positions.
8. If a batch fails, retry only that batch with a bounded retry count. If the combined exam still fails validation, return an error rather than weakening the blueprint or silently substituting questions.

Do not use an LLM-generated summary as the only evidence for formulas, definitions, code syntax, constraints or numerical facts. Summaries may help build a topic map, but generation batches must retain the relevant original source chunks and provenance.

## 6. Coverage allocation rules

Create a plan before generation; do not rely on the model to distribute coverage spontaneously.

- Give every selected chapter/topic a stable ID, such as `chapter-03-topic-02`.
- Use official weightage if supplied and validated. Otherwise distribute questions/marks across selected chapters reasonably and label the allocation as generated, not official.
- Allocate each question to one primary topic; optional secondary topics may be recorded internally for integrated questions.
- For cross-topic questions, include all necessary source chunks in the same batch. Do not ask an integrated question when its required topic is absent from the batch context.
- Track `planned`, `generated`, and `validated` counts/marks per topic. Reject large uncovered portions of the selected scope rather than claiming full coverage.

For theory, the plan must first satisfy the exact marks blueprint in `FINAL_PROMPT_TEMPLATE.md`. Topic allocation is subordinate to required marks/counts; if the constraints cannot both be satisfied, fail and report the conflict.

## 7. Required internal context object

Use a backend object equivalent to this (field names can match the codebase, but the information must be preserved):

```js
{
  subject: {
    code: "09CH2102",
    title: "Canonical subject title",
    department: "Diploma",
    courseOrBranch: "Chemical Engineering",
    semester: 2
  },
  examType: "Mid1",
  difficulty: "medium",
  scope: {
    rule: "first_50_percent",
    weightageBasis: "official_contact_hours", // or "ordered_chapter_boundary"
    selectedChapterIds: ["chapter-01", "chapter-02"],
    omittedChapterIds: ["chapter-03"],
    sourcePath: "Diploma/Chemical_Engineering/example.json"
  },
  batches: [
    {
      id: "batch-01",
      sourceChunkIds: ["chapter-01", "chapter-02"],
      plannedQuestionCount: 5,
      plannedMarks: null
    }
  ],
  fitting: {
    model: "configured-model-id",
    estimatedInputTokens: 0,
    reservedOutputTokens: 0,
    usedBatching: false
  }
}
```

The example values are illustrative only. Never hard-code them for a real subject. This provenance object is backend/internal metadata unless a verified database column exists; do not invent Supabase columns just to persist it.

## 8. Integration boundaries

- Keep the context builder separate from prompt text construction and from the Groq HTTP call.
- Suggested pure functions:
  - `resolveSyllabusRecord(subject, manifest)`
  - `validateSyllabusRecord(record, subject)`
  - `selectExamScope(record, examType, policy)`
  - `makeSourceChunks(scope)`
  - `estimateInputTokens(messages, modelConfig)`
  - `fitScopeIntoBatches(chunks, tokenBudget)`
  - `buildCoveragePlan(scope, examBlueprint)`
  - `validateCombinedExam(result, examBlueprint, coveragePlan)`
- Unit-test each function with missing/ambiguous subjects, code mismatch, missing practicals, empty chapters, oversized chapter, exact-fit context, overflow batching, Mid-1 boundary, and whole-paper validation.
- The model call must receive the canonical instructions in `Algorithm/FINAL_PROMPT_TEMPLATE.md`, not a concatenation of every Markdown reference file.
- Keep answer keys, model answers, rubrics and internal review metadata out of the student-facing attempt payload.
- Persist a generated exam only after full validation and only through the existing database contract.

## 9. Acceptance criteria for Arena

Implementation is ready to review when all of these are true:

- [ ] Only one exact subject's syllabus/practical files are fetched for an exam request.
- [ ] No eager import of all dataset JSON files into the frontend bundle.
- [ ] Matching uses code/branch/semester/title and rejects ambiguous or mismatched records.
- [ ] Mid-1 scope is chosen by verified weightage or ordered chapter boundary; ESE scope is full unless policy says otherwise.
- [ ] No silent character slicing or hidden chapter loss.
- [ ] Context fits in one request when possible and batches at meaningful boundaries when needed.
- [ ] Batch allocations combine into the exact requested count/marks and preserve cross-batch duplicate checks.
- [ ] Insufficient/oversized source produces an explicit error, not fabricated syllabus coverage.
- [ ] Tests cover fitting, overflow, scope selection, malformed data, and whole-exam validation.
- [ ] The model ID and token budgets are configuration values, not hard-coded assumptions about a model's limits.
- [ ] The runtime prompt, parser, database mapping, and display-safe payload agree on one schema.
