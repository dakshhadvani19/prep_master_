# Bharatiya Knowledge System — TestsData-ready bank

- CourseId 44; SubjectId 44009911010101; Semester 1.
- 12 tests × 10 MCQs = 120 questions: Tests 01–04 Easy, 05–08 Medium, 09–12 Hard.
- Each test JSON matches the four live `public."TestsData"` columns. Options flatten to A-D per question; Answers are zero-based indices.
- Manifest maps TestId to occurrence and difficulty; answer-review.json is QA-only; seed.sql inserts the rows transactionally without ON CONFLICT.
- Source topics: four Vedas; Vedangas/Caturdaśa-Vidyāsthāna; Purāṇas and Itihāsa; language sciences/Sanskrit and NLP; number system, units, mathematics, astronomy/calendar; metallurgy, textiles/dyeing, water management, ecology, transportation, Vastu/architecture; Ashramas, Purusharthas, Karma/rebirth and Moksha.
- Validation performed: 12 IDs, four tests per difficulty, 10 Questions / 40 Options / 10 Answers per row, unique non-empty options, valid answer indexes, unique stems, signed BIGINT range. Correct-answer explanations included. Historical claims still require a final factual and distractor-quality review before database insertion.
