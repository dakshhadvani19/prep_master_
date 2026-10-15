# Diploma Computer Engineering — Semester 1 Test Bank

This folder contains the complete Semester 1 test bank for all **8 active subjects** currently listed in Supabase for CourseId 44.

## Bank size

| Measure | Count |
|---|---:|
| Subjects | 8 |
| Tests per subject | 12 |
| Easy / Medium / Hard tests per subject | 4 / 4 / 4 |
| Questions per test | 10 |
| Total tests | 96 |
| Total MCQs | 960 |
| Total option entries | 3,840 |
| Total answer-key entries | 960 |

## Files and insertion

- `seed-all.sql`: inserts all 96 tests into the existing `public."TestsData"` table in a single transaction. It does not change the database schema and does not overwrite colliding TestIds.
- `manifest.json`: subject list, SubjectIds, sources, TestId rule, database mapping and counts.
- Each subject folder contains 12 test-row JSON files under `tests/`, a `manifest.json`, `answer-review.json` and an individual `seed.sql`.
- Every test-row JSON has only the four live columns: `TestId`, `Questions`, `Options`, `Answers`.

## Data mapping

`Questions` contains one JSON string per question. `Options` contains four JSON string entries per question, flattened question-by-question in A, B, C, D order. `Answers` contains the zero-based correct-option index for each question: 0=A, 1=B, 2=C, 3=D. For question number n, its choices occupy indexes `4 × (n−1)` through `4 × n−1`.

Each test has 10 questions, 40 options and 10 answer keys. Correct-answer positions are balanced at two or three appearances per letter A–D per test, with option order and answer keys remapped together.

## Before production insert

The live `TestsData` table was checked and is currently empty; none of these rows has been inserted. The planned TestIds were checked for collisions and are unique across all 96 planned rows. Run another collision check immediately before executing the SQL. **Structural validation and key balance do not substitute for full subject-matter review**: read each subject's `answer-review.json`, particularly calculations, legal details and distractor plausibility, before production use.

## Subjects

- [Basics of Web Designing](./Basics of Web Designing/README.md) — SubjectId `44000935310201`, code `09CE3102`; [source syllabus](https://www.marwadiuniversity.ac.in/wp-content/uploads/2026/05/09CE3102_BWD.pdf)
- [Bharatiya Knowledge System](./Bharatiya Knowledge System/README.md) — SubjectId `44009911010101`, code `09IK0101`; [source syllabus](https://www.marwadiuniversity.ac.in/wp-content/uploads/2026/05/9IK0101_BKS.pdf)
- [Communication Skills-I](./Communication Skills-I/README.md) — SubjectId `44091912010301`, code `09SL0103`; [source syllabus](https://www.marwadiuniversity.ac.in/wp-content/uploads/2025/04/CS-1.pdf)
- [Computer Fundamental Skill](./Computer Fundamental Skill/README.md) — SubjectId `44000935210101`, code `09CE2101`; [source syllabus](https://www.marwadiuniversity.ac.in/wp-content/uploads/2025/04/CFS.pdf)
- [Computer Hardware Skill](./Computer Hardware Skill/README.md) — SubjectId `44000935210301`, code `09CE2103`; [source syllabus](https://www.marwadiuniversity.ac.in/wp-content/uploads/2025/04/CHS.pdf)
- [Engineering Drawing](./Engineering Drawing/README.md) — SubjectId `44009135110101`, code `09ME1101`; [source syllabus](https://www.marwadiuniversity.ac.in/wp-content/uploads/2025/04/ED-1.pdf)
- [Indian Constitution](./Indian Constitution/README.md) — SubjectId `44009121010101`, code `09AU0101`; [source syllabus](https://www.marwadiuniversity.ac.in/wp-content/uploads/2026/05/09AU0101_IC.pdf)
- [Mathematics-I](./Mathematics-I/README.md) — SubjectId `44009131210101`, code `09MA2101`; [source syllabus](https://www.marwadiuniversity.ac.in/wp-content/uploads/2025/04/MATH-1.pdf)
