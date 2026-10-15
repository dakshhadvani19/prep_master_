# Indian Constitution — Semester 1 Exam Bank v2

**Canonical source:** [Semester 1 exam bank v2](../exam-bank-v2.json)  
**SubjectId:** `44009121010101`  
**isDepartmentalSubject:** `true`

This folder contains legacy question-source and review files from the earlier 12 × 10 MCQ draft. Those files are retained for reference; they are **not** the current database export.

## Current exam design

- **Mid 1:** 12 MCQ variants; 30 questions each.
- **Mid 2:** 12 MCQ variants; 30 questions each.
- **ESE:** Not generated for departmental subjects.

Each exam type has 4 Easy, 4 Medium and 4 Hard variants.

**Mid 1 syllabus scope:** Mid 1 (first 50%): Constitution-making, Preamble, basic structure, constitutional features, Fundamental Rights/Duties, Articles 14/19/21 and Directive Principles.

## Files

- [Canonical JSON bank](../exam-bank-v2.json): filter its `test_index` by `SubjectId = 44009121010101` and the desired `examType`.
- [Canonical seed SQL](../seed-all-v2.sql): complete 252-row staged transaction.
- `tests/`, `answer-review.json`: prior draft source/review material, not the v2 INSERT payload.
- `seed.sql`: deliberately retired placeholder; it contains no INSERT statements. Do not use as a database seed.

The live `public."TestsData"` table has only `TestId`, `Questions`, `Options`, and `Answers`. Exam metadata is maintained in the v2 JSON bank. Theory rows use an empty `Options` array and store model answers in `Answers`; consuming code must detect this format instead of rendering it as an MCQ.

The generated content is a draft and requires subject-matter review before production use.
