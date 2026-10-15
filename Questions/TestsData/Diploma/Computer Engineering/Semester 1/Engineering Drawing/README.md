# Engineering Drawing — TestsData-ready bank

- CourseId 44; SubjectId 44009135110101; Semester 1; subject code 09ME1101.
- 12 tests × 10 MCQs = 120 questions. Tests 01–04 Easy, 05–08 Medium, 09–12 Hard.
- All JSON rows contain TestId, Questions, Options, Answers; options are flattened A-D and answers are zero-based.
- Manifest maps difficulty/occurrence; answer-review.json is QA-only; seed.sql is transactional without ON CONFLICT.
- Source topics: BIS drawing practices, line types/dimensions/RF/scales, conic construction, cycloid/epicycloid/hypocycloid, involutes/spirals/tangents/normals, point/line/plane projection, first/third-angle orthographic and sectional views, auxiliary-plane method, isometric scales/views.
- Structural checks passed: 12 IDs, 4 tests per difficulty, 10 Questions/40 Options/10 Answers per row, unique non-empty options, answer indices 0–3, unique stems and BIGINT-safe IDs. Manual review of technical conventions and numeric keys is recommended before insertion.
