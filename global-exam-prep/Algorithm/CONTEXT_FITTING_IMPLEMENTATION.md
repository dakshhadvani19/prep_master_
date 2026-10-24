# CONTEXT_FITTING_IMPLEMENTATION.md — Context Fitting & Batching Contract

This document defines how syllabus source material is fitted into the 6,000-character model input budget without silently discarding content. It is the implementation contract for `src/utils/contextFitter.js`.

---

## 1. Token Budget Model

| Component | Reserved Characters | Notes |
|-----------|-------------------|-------|
| System instructions | ~1,200 | Fixed system message (FINAL_PROMPT_TEMPLATE.md) |
| Exam scope + coverage plan | ~600 | Per-request scope block |
| Output schema + JSON overhead | ~400 | Required JSON shape, keys, brackets |
| Generated output (reserved) | ~1,500 | Room for the model's response tokens |
| **Source excerpt budget** | **≤ 6,000** | Hard cap enforced by `MAX_SOURCE_CHARS` |

The 6,000-character source cap is a **display/excerpt limit**, not a silent discard. When source material exceeds the cap, it must be split at chapter boundaries, batched, and combined.

---

## 2. Scope Selection Rules (per exam type)

| Exam Type | Scope | Marks | Question Rules |
|-----------|-------|-------|----------------|
| **Mid-1 (Theory)** | First 50% of ordered chapters (verified unit/contact-hour weights where available; otherwise closest defensible chapter boundary) | 30 | Exactly 7 questions: two 1-mark, three 4-mark, two 8-mark (30 marks total); interleave types |
| **Mid-2 (MCQ / Objective)** | Verified and configured Mid-2 scope — do not silently assume second half or full syllabus | 30 | Exactly 30 questions, four distinct options, exactly one correct answer |
| **ESE / Final (Theory)** | Full relevant syllabus unless an authoritative blueprint narrows it | 60 | Exactly 13 questions: two 1-mark, one 2-mark, six 4-mark, four 8-mark (60 marks total); interleave types |
| **Practicals** | Only the matching subject's practical content, only where appropriate | — | Practical-specific questions only |

Difficulty changes cognitive demand only — never exam eligibility, scope, counts, or marks.

---

## 3. Context Fitting Algorithm

### Step 1 — Load and Validate the Syllabus Record

1. Resolve the subject via `src/utils/subjectResolver.js` (numeric SubjectId → source ID → domain/course/subject).
2. Load the syllabus JSON from the dataset via `src/utils/syllabusLoader.js`.
3. Validate readiness: `status === "ready"`, non-empty `chapters` array, each chapter has `chapter_name` and non-empty `content`.
4. Load the sibling `_practicals.json` if it exists and the exam type warrants it.
5. Reject missing, ambiguous, or conflicting matches — never substitute a similarly named subject silently.
6. If the record has `status === "missing_syllabus"` or empty chapters, return a meaningful error: syllabus content is not available for this subject.

### Step 2 — Select Scope Chapters

- **Mid-1**: Take the first 50% of chapters by count (rounded to nearest whole chapter boundary). If contact-hour or unit weights are available in the record, use those instead.
- **Mid-2**: Use the verified Mid-2 scope from the syllabus record or catalog configuration.
- **ESE**: Use all chapters unless a blueprint narrows the scope.

### Step 3 — Estimate Fit Within 6,000 Characters

1. Concatenate the context prefix (academic context) + scope chapter content.
2. If total ≤ 6,000 characters, send as a single batch.
3. If total > 6,000 characters, split at chapter boundaries:
   - Assign whole chapters to batches. Never split mid-chapter.
   - Each batch must fit within the remaining budget after reserving space for system instructions, scope block, and output schema.
   - If a single chapter exceeds the budget, that chapter is processed alone and a truncation note is appended (explicit, never silent).

### Step 4 — Construct Coverage Plan

Before generation, build a coverage plan:

```
{
  totalChapters: N,
  inScopeChapters: [chapter indices],
  batches: [
    { batchIndex: 0, chapters: [1, 2], charCount: 4500, questionAllocation: 10, markAllocation: 10 },
    { batchIndex: 1, chapters: [3, 4], charCount: 4200, questionAllocation: 10, markAllocation: 10 },
    ...
  ],
  perBatchMarks: { ... },
  crossBatchValidation: true
}
```

Allocate questions or marks across batches proportionally to chapter content size. For theory exams, ensure the 1-mark, 2-mark, 4-mark, and 8-mark distribution can be satisfied across batches.

### Step 5 — Generate Per-Batch

Keep each Groq response small to avoid output-token truncation: request at most **5 MCQs** or **3 theory questions** per response, even when all syllabus content fits in one source batch. Split the exam's exact question/mark allocation across calls, then combine and validate the complete paper.

Additionally split each source batch into small generation requests: at most **5 MCQs per Groq response** and at most **3 theory questions per response**. Even if the source fits in one chapter batch, make multiple calls when needed to reach 30 MCQs or the configured theory count. Require the model to return exactly the requested count for every call.

For each batch:
1. Build the user message with the scope block, coverage plan, and that batch's source excerpt.
2. Call `generateQuestionsFromText` via `/api/ai`.
3. Validate the batch output against the schema (question count, option count, answer index, marks).
4. Track which chapters each batch covered.

### Step 6 — Combine and Validate

1. Combine all batch question arrays into a single exam.
2. Re-validate the complete exam:
   - Total question count matches the configured count.
   - Total marks match the exam blueprint.
   - No duplicate or near-duplicate questions across batches.
   - Coverage spans all in-scope chapters.
   - For MCQ: exactly 30 questions, 4 options each, one correct answer.
   - For Mid-1 theory: exactly 7 questions with marks `[1, 4, 1, 8, 4, 8, 4]` (30 total). A 1-mark prompt must request one brief fact/point, not a page-length response.
   - For ESE theory: exactly 13 questions with marks `[1, 4, 1, 8, 4, 2, 8, 4, 8, 4, 8, 4, 4]` (60 total). A 1-mark prompt must request one brief fact/point, not a page-length response.
3. Strip internal review metadata from MCQ questions before the student-facing payload.

### Step 7 — Failure Handling

- If any batch fails validation after 3 retries, reject the entire exam generation with a meaningful error.
- If the source cannot be processed reliably (e.g., a single chapter is too large and cannot be split further), return a meaningful error instead of fabricating coverage.
- Never silently discard syllabus content. Truncation is always explicit and visible in the prompt.

---

## 4. Practical Content Handling

- Load only the matching subject's practical file (`*_practicals.json`).
- Practical content is included only when the exam type is appropriate (e.g., lab-based assessments).
- Practicals are never mixed into theory exam source material unless explicitly configured.

---

## 5. Source Cap Enforcement (MAX_SOURCE_CHARS = 6,000)

The existing `geminiQuestions.js` enforces `MAX_SOURCE_CHARS = 6000`. When truncation occurs:

1. A truncation note is appended: `[NOTE: SOURCE EXCERPT TRUNCATED. Treat only the visible material as evidence; do not make claims about what omitted text does or does not contain.]`
2. The model is instructed to stay within visible evidence only.
3. Truncation is never silent — the student and the validation layer can see that content was excerpted.

---

## 6. Integration Points

| Module | Responsibility |
|--------|---------------|
| `src/utils/subjectResolver.js` | Subject ID resolution (bridge → domain/course/subject) |
| `src/utils/syllabusLoader.js` | Load syllabus JSON from dataset by subject code |
| `src/utils/contextFitter.js` | Scope selection, batching, coverage plan |
| `src/utils/geminiQuestions.js` | Model invocation, 6,000-char cap, per-batch validation |
| `src/utils/examValidation.js` | Combined exam validation (counts, marks, duplicates, coverage) |
| `src/pages/ExamPortal.jsx` | Orchestrates the full flow: consent → syllabus → scope → fit → generate → validate → persist |

---

## 7. What This Does NOT Do

- Does not send all subject files, all prompt documents, or unrelated practicals to the model.
- Does not silently discard syllabus content when it exceeds the cap.
- Does not split chapters mid-content — splits happen at chapter boundaries only.
- Does not fabricate syllabus coverage when content cannot be processed reliably.
- Does not include internal review metadata in the student-facing exam payload.