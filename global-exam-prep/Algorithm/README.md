# Exam Generation Algorithm Instructions

These Markdown files define the exam-generation specification. They are not, by themselves, runtime code.

## Canonical runtime prompt

Use [`FINAL_PROMPT_TEMPLATE.md`](./FINAL_PROMPT_TEMPLATE.md) as the **single canonical prompt template** for Groq integration. Backend code should assemble one request from the stable system rules, exactly one exam-specific block, exactly one difficulty overlay, verified subject context, and one exact output schema. Do not concatenate every Markdown file into every request.

The template consolidates the applicable rules from the files below and documents how to fetch, select, scope, and fit syllabus context without silent truncation.

**Implementation contract for context retrieval/fitting:** [`CONTEXT_FITTING_IMPLEMENTATION.md`](./CONTEXT_FITTING_IMPLEMENTATION.md) specifies exact subject resolution, exam-scope selection, token budgeting, overflow batching, coverage allocation, internal provenance, and acceptance tests.

## Reference files

- [`Mid1.md`](./Mid1.md): non-departmental theory Mid-1.
- [`Mid1_Departmental.md`](./Mid1_Departmental.md): departmental MCQ Mid-1.
- [`Mid2.md`](./Mid2.md): Mid-2 MCQ.
- [`ESE.md`](./ESE.md): ESE theory.
- [`Easy.md`](./Easy.md), [`Medium.md`](./Medium.md), [`Hard.md`](./Hard.md): difficulty definitions.

These remain human-readable reference/specification files. If they conflict with the canonical template or an authoritative course blueprint, reconcile the documentation before changing runtime behavior.

## Backend responsibilities

1. Resolve the exact course, semester, subject ID/code/title, departmental policy, exam eligibility, exam type, difficulty, syllabus and practical-source mapping.
2. Reject unsupported combinations and unverified/mismatched syllabus records; do not ask Groq to decide policy or database details.
3. Fetch only the selected subject's ordered syllabus/practical content and verified blueprint. For Mid-1, apply the first-50%-of-syllabus rule using official unit/contact-hour weighting when available.
4. Build traceable topic chunks/coverage metadata and fit them to the chosen model's actual context/output-token limits. Never silently truncate a long syllabus. If sufficient source fidelity cannot be maintained, fail safely.
5. Assemble the prompt using [`FINAL_PROMPT_TEMPLATE.md`](./FINAL_PROMPT_TEMPLATE.md), call Groq, parse strict JSON and run deterministic structure, count, answer-index, marks/rubric and available coverage checks with bounded retries.
6. Map validated output to the actual supported `TestsData` schema and persist the test before returning the student-facing exam. Never expose the answer key, model answers, rubrics or internal review evidence during the attempt.

## Canonical policy summary

- Departmental subject: Mid-1 MCQ and Mid-2 MCQ; no ESE unless authoritative course policy explicitly permits it.
- Non-departmental subject: Mid-1 theory, Mid-2 MCQ, and ESE theory when eligible.
- MCQ: exactly 30 questions, four options each, one zero-based answer index per question. The existing database mapping flattens the options in question order (120 option entries).
- Mid-1 theory: 30 marks, exactly two 1-mark questions; remaining 28 marks from 4-/8-mark questions.
- ESE theory: 60 marks, exactly two 1-mark questions plus one 2-mark question; remaining 56 marks from 4-/8-mark questions. Stop if an official blueprint conflicts.
- Mid-1 scope: first 50% of ordered syllabus, accounting for verified unit/contact-hour weighting where available. ESE covers the full relevant syllabus unless official policy narrows it.
- Difficulty changes cognitive demand, not syllabus boundaries, exam format, counts, eligibility or marks.

## Important implementation status

The canonical prompt template is committed, but **runtime integration is not complete**. The current `global-exam-prep/src/utils/geminiQuestions.js` uses a simpler prompt and has a `MAX_SOURCE_CHARS = 6000` truncation cap. The template describes the intended design; backend source retrieval, prompt assembly, model call, schema mapping, persistence and end-to-end testing still need to be implemented and verified.

If any rule conflicts with a verified official course blueprint, stop and flag the conflict rather than silently overriding authoritative policy.
