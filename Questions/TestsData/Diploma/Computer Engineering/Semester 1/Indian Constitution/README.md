# Indian Constitution — TestsData-ready bank

- CourseId 44; SubjectId 44009121010101; Semester 1; subject code 09AU0101.
- 12 tests × 10 MCQs = 120 questions. Tests 01–04 Easy, 05–08 Medium, 09–12 Hard.
- Each test JSON contains the four live TestsData columns exactly. Options are flattened A-D per question; Answers use zero-based indices.
- Manifest maps subject, difficulty and source coverage. answer-review.json is QA-only. seed.sql is transactional and has no ON CONFLICT.
- Source coverage: constitutionalism, Constitution-making, Preamble, basic structure, Fundamental Rights/Articles 14, 19 and 21, Fundamental Duties/Article 51A, Directive Principles, Union and State executive/legislature, district administration, Municipal Corporation, Zila Panchayat, ECI and State Election Commission.
- Structural checks performed: 12 IDs, four tests per difficulty, 10 Questions/40 Options/10 Answers per test, four unique non-empty options, answer indices 0–3, unique stems, per-test answer-position distribution and signed BIGINT-safe IDs. Review legal details and distractor quality before inserting into production.
