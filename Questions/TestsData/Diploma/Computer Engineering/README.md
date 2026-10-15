# Diploma Computer Engineering — Semester 1–6 Exam Banks

This directory contains the exam-type-aware Semester 1 through Semester 6 test-bank exports for CourseId `44`.

## Semester banks

| Semester | Subjects | Test rows | MCQ test rows | Theory test rows | MCQs | Theory questions |
|---:|---:|---:|---:|---:|---:|---:|
| [1](./Semester%201/README.md) | 8 | 252 | 132 | 120 | 3,960 | 480 |
| [2](./Semester%202/README.md) | 7 | 228 | 108 | 120 | 3,240 | 480 |
| [3](./Semester%203/README.md) | 6 | 204 | 84 | 120 | 2,520 | 480 |
| [4](./Semester%204/README.md) | 6 | 192 | 96 | 96 | 2,880 | 384 |
| [5](./Semester%205/README.md) | 7 | 204 | 132 | 72 | 3,960 | 288 |
| [6](./Semester%206/README.md) | 5 | 156 | 84 | 72 | 2,520 | 288 |
| **Total** | **39** | **1,236** | **636** | **600** | **19,080** | **2,400** |

## Exam rules applied

- For `isDepartmentalSubject = false`: **Mid 1**, **Mid 2**, and **ESE** are generated. Mid 1 and ESE use four 8-mark questions with model answers; Mid 2 uses 30 MCQs.
- For `isDepartmentalSubject = true`: **Mid 1** and **Mid 2** are generated, each with 30 MCQs. ESE is not generated for these subjects.
- Each available exam type has 12 variants: four Easy, four Medium and four Hard.
- Mid 1 is limited to the first half of the ordered syllabus. The exact selected unit/topic scope is documented in each semester's manifest and JSON `test_index`.

## Canonical files in each semester folder

- `exam-bank-v2.json`: question rows plus subject, exam type, difficulty, source and syllabus-scope metadata.
- `seed-all-v2.sql`: staged insert transaction for `public."TestsData"`.
- `manifest.json` and `README.md`: counts, rules and links to the canonical files.

## Database and application notes

The current `public."TestsData"` table has only `TestId`, `Questions`, `Options` and `Answers`. Subject/exam/difficulty/format metadata is maintained in each JSON `test_index`, not in database columns.

MCQ rows contain 30 questions, 120 flattened A–D option strings and 30 zero-based answer indexes. Theory rows contain four question strings prefixed `[8 marks]`, an empty `Options` array and four model-answer strings in `Answers`. The application must branch on format before rendering or scoring the row.

At the last check, the live table contained zero rows. The 1,236 planned IDs are unique, with no collision against the live table. The SQL files are staged and **have not been executed**.

**Content-quality note:** the banks are draft practice material. Structural validation and balanced MCQ answer positions do not certify every factual answer, distractor, difficulty label or model answer. Complete subject-matter review and confirm that the application supports theory rows before production use.
