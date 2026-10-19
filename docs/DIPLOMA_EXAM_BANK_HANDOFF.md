# Diploma Electrical & Civil Engineering Exam-Bank Handoff

_Last updated: 2026-10-19 (Asia/Kolkata)_

## Scope

- Repository: [dakshhadvani19/prep_master_](https://github.com/dakshhadvani19/prep_master_)
- Courses: **Diploma Electrical Engineering** and **Diploma Civil Engineering** only.
- Semesters: 1–6 for both courses.
- Exclude project, internship, and other subjects explicitly marked non-examinable.
- This workflow is repository-only. Do not execute SQL or modify Supabase.

## Current repository state

The syllabus source files exist at:

- `Syllabus/syllabus_txt/Diploma/Electrical_Engineering/semester_1.json` through `semester_6.json`
- `Syllabus/syllabus_txt/Diploma/Civil_Engineering/semester_1.json` through `semester_6.json`

As of this handoff update, no canonical question-bank files were found under `Questions/TestsData/Diploma/Electrical Engineering/` or `Questions/TestsData/Diploma/Civil Engineering/`. Do not report those banks as completed until files are actually created and validated.

Other course banks (Computer Engineering, Chemical Engineering, and ICT) exist in the repository. They are not automatically approved source material; reuse a question only after checking its actual content, answer, subject fit, syllabus scope, and mark value.

## Required exam rules

Determine the allowed exam types from authoritative subject metadata; do not infer them from a subject name.

- **Departmental subject:** Mid 1 and Mid 2 are MCQ; no ESE unless the authoritative course policy explicitly permits it.
- **Non-departmental subject:** Mid 1 and ESE are theory; Mid 2 is MCQ.
- Each allowed exam type has **six variants**: two Easy, two Medium, and two Hard.
- Each MCQ variant has exactly 30 questions, four options per question (120 flattened option strings), and 30 zero-based answer indexes.
- Theory Mid 1 totals 30 marks and contains exactly two 1-mark questions. The remaining 28 marks use 4- and 8-mark questions.
- Theory ESE totals 60 marks and contains exactly two 1-mark questions. Two 1-mark questions plus only 4- and 8-mark questions cannot total 60. Follow `docs/EXAM_FORMAT_AND_MARKING_RULES.md`: flag this arithmetic conflict and obtain an approved blueprint exception (one possible solution is one 2-mark question plus 4-/8-mark questions totalling 56); never silently produce an incorrect total.
- Mid 1 covers only the first 50% of the ordered syllabus, respecting contact-hour weighting when available. ESE covers the full relevant syllabus unless an authoritative blueprint says otherwise.
- Theory questions must state their mark value and include a model answer/marking points appropriate to the marks.

## Canonical data and IDs

- Follow `docs/QUESTION_GENERATION_RULES.md`.
- Follow `docs/EXAM_FORMAT_AND_MARKING_RULES.md`.
- Follow `docs/primary_key_rules.md`.
- Use the existing `exam-bank-v2.json` + `test_index` contract as the canonical reference format; preserve source/subject/syllabus metadata.
- Check IDs against all existing banks before assigning new ones. Never overwrite an existing test or reuse a TestId for different content.
- Keep question payloads, metadata, manifests, and QA notes consistent.

## Implementation algorithm

See [DIPLOMA_EE_CIVIL_QUESTION_GENERATION_ALGORITHM.md](DIPLOMA_EE_CIVIL_QUESTION_GENERATION_ALGORITHM.md) for the generation sequence, reuse policy, lightweight quality gate, marking rules, and cleanup boundaries.

## Cleanup and safety

- Preserve canonical banks, manifests, review notes, and any required import/seed source until replacements and database insertion have been verified.
- Do not delete files simply because they look duplicated. Confirm whether they are the canonical source, a required seed/import path, or a derived artifact first.
- Do not insert into Supabase or execute SQL as part of this repository task.
- Report structural validation separately from academic review. Passing JSON/schema checks is not proof that every domain answer has been independently certified.
