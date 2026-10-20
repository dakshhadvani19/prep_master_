# Exam Generation Algorithm Instructions

These files define prompt instructions for Grok-based exam generation. They are prompt specifications, not runtime code. The backend must resolve subject eligibility and exam format from authoritative subject/course policy before selecting files.

## Files
- `Mid1.md`: university-level/non-departmental theory Mid-1.
- `Mid1_Departmental.md`: departmental MCQ Mid-1.
- `Mid2.md`: Mid-2 MCQ for both subject categories under the current canonical policy, unless an authoritative course-specific exception says otherwise.
- `ESE.md`: non-departmental ESE theory, only when eligible.
- `Easy.md`, `Medium.md`, `Hard.md`: difficulty overlays appended to the selected exam instructions.

## Prompt assembly order
1. Resolve course, semester, subject ID, exact subject title, departmental flag, exam eligibility and verified syllabus.
2. Reject unsupported combinations rather than guessing.
3. Select exactly one exam file.
4. Append exactly one difficulty file.
5. Append the common requirements in `docs/EXAM_FORMAT_AND_MARKING_RULES.md` and `docs/QUESTION_GENERATION_RULES.md` (or include their applicable instructions in the assembled prompt).
6. Include the exact output schema and only the subject context relevant to the selected exam.
7. Call Grok, parse the response, run deterministic structure/blueprint checks, then insert the accepted test into `TestsData` before displaying the exam.

Do not ask Grok to determine departmental status, exam eligibility, database IDs, or which prompt applies. These are backend responsibilities.

## Source and correctness constraints
- Use only verified, correctly mapped subject content. Include relevant chapters and practical material where applicable.
- Never silently truncate source text. If the context exceeds provider limits, use traceable topic chunks/summaries or fail safely.
- Instruct Grok to maximize factual and answer-key accuracy, avoid ambiguity, and provide one defensible answer for every single-answer MCQ. This instruction reduces risk but does not guarantee correctness.
- Do not expose answer keys or model answers to the frontend during the attempt.
- Keep the existing `TestsData` payload contract (`TestId`, `Questions`, `Options`, `Answers`) and existing attempt/review flow. Do not invent unsupported database columns.
- `TestsData.TestId` is caller-supplied and must be unique. Insert the generated test before returning the exam screen. On submission, record the student's attempt in the existing `TestAttempts` workflow.
- Do not save or display a response that fails required structural checks. Use bounded retries and return a clear error if generation or persistence fails.

## Canonical policy summary
- Departmental subject: Mid-1 MCQ, Mid-2 MCQ; no ESE unless an authoritative course policy explicitly permits it.
- Non-departmental subject: Mid-1 theory, Mid-2 MCQ, ESE theory when available.
- MCQ exams: exactly 30 questions, four options each, one zero-based answer index per question; the database option array is flattened in question order (120 entries).
- Mid-1 theory: 30 marks; exactly two 1-mark questions, with the remaining 28 marks made from permitted 4-/8-mark questions.
- ESE theory: 60 marks; exactly two 1-mark questions plus one 2-mark question, with the remaining 56 marks made from 4-/8-mark questions, unless an official blueprint conflict requires the exam to stop for configuration.
- Mid-1 scope: first 50% of the ordered syllabus, accounting for verified unit/contact-hour weightage when available. ESE may cover the full relevant syllabus.
- Difficulty changes cognitive demand, not syllabus boundaries, exam format, required counts, or marks.

If this file conflicts with a verified official course blueprint, stop and flag the conflict. Do not silently override authoritative policy.
