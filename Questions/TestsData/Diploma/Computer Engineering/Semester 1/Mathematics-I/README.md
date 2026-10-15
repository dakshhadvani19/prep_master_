# Mathematics-I — TestsData-ready bank

- CourseId 44; SubjectId 44009131210101; Semester 1.
- 12 tests × 10 MCQs = 120 questions. Tests 01–04 are Easy, 05–08 Medium, 09–12 Hard.
- Each test JSON has exactly the live table's four columns: `TestId`, `Questions`, `Options`, `Answers`.
- Questions has one JSON string per item; Options contains A,B,C,D flattened in question order (four entries per question); Answers contains the zero-based correct-option index per question (0=A, 1=B, 2=C, 3=D). For question n, its options are at indices 4(n−1) through 4n−1.
- manifest.json maps difficulty and occurrence, since TestsData has no SubjectId/difficulty column. IDs follow docs/primary_key_rules.md.
- answer-review.json is review-only; never insert it. seed.sql is an all-row transaction and has no ON CONFLICT clause, so duplicate IDs must be investigated.
- Source scope: the official Semester 1 syllabus for number sets and indices, HCF/LCM of integers/fractions/decimals, polynomials and identities, 2D area/perimeter, 3D surface area/volume, trigonometric ratios, angles, unit-circle and multiple-angle identities.

Structural validation: 12 unique IDs, 4 tests per difficulty, 10 questions/40 options/10 answers per test, unique non-empty options, valid answer indexes, unique question stems and BIGINT-safe IDs. The live database has not been changed. Human mathematical review is recommended before insertion.
