# Computer Fundamental Skill — TestsData-ready bank

- CourseId 44; SubjectId 44000935210101; Semester 1.
- 12 tests × 10 MCQs = 120 questions. Tests 01–04 Easy, 05–08 Medium, 09–12 Hard.
- Each test JSON has exactly `TestId`, `Questions`, `Options`, and `Answers` for `public."TestsData"`.
- `Questions` has one JSON string per question; `Options` has 4 flattened JSON strings per question in A-B-C-D order; `Answers` has zero-based correct-option indices (0=A, 1=B, 2=C, 3=D).
- `manifest.json` maps difficulty/occurrence since the DB does not store them as columns. `answer-review.json` is QA-only. `seed.sql` inserts all 12 rows in one transaction without ON CONFLICT.
- Source: official Semester 1 practical syllabus (computer components/OS/files, Word, Excel, PowerPoint, HTML, email, browser/search and Digital India/e-governance portals).
- Structural checks performed: 12 IDs, 4 tests/difficulty, 10 questions/40 options/10 answers per row, unique non-empty choices, valid answer indices, unique stems and BIGINT-safe IDs. Database rows have not been inserted. Review rationales and distractor plausibility before production use.
