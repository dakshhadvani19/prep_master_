# Communication Skills-I — TestsData-ready bank

- CourseId 44; SubjectId 44091912010301; Semester 1.
- 12 tests × 10 MCQs = 120 questions. Tests 01–04 Easy, 05–08 Medium, 09–12 Hard.
- Test files use the four live columns in `public."TestsData"`; Options flatten A-D by question, Answers are zero-based.
- Manifest tracks difficulty/occurrence; answer-review.json is QA-only; seed.sql is transactional and has no ON CONFLICT.
- Source areas: reading techniques and comprehension; tenses, parts of speech, sentence types, subject–verb agreement, modals, active/passive; writing applications, emails and event reports; speaking, presentation preparation/body language/pronunciation, audience interaction and feedback.
- Structural validation: 12 IDs, four tests per difficulty, 10 Questions/40 Options/10 Answers per test, non-empty unique options, answer indexes 0–3, unique stems and signed BIGINT-safe IDs. Editorial answer-key and distractor review remains recommended before insertion.
