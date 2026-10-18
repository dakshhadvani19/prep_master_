# ICT Diploma Exam Bank — QA Summary

Snapshot: 2026-10-18. CourseId: 49 (`Diploma Information and Communication Technology`).

## Semester coverage

| Semester | Active catalog subjects | Banked subjects | Test rows | Exam-type banks | Handling |
|---:|---:|---:|---:|---:|---|
| 1 | 5 | 4 | 132 | 11 | `Communication Skills-I` blocked because the same-name source has a conflicting departmental flag; not regenerated |
| 2 | 6 | 6 | 180 | 15 | Three compatible same-name subjects reuse existing payloads |
| 3 | 0 | 0 | 0 | 0 | Explicitly empty; no active ICT subjects found |
| 4 | 6 | 6 | 180 | 15 | `Web Technology` payloads reused from Computer Engineering |
| 5 | 14 | 13 | 456 | 38 | `Project I` excluded entirely |
| 6 | 12 | 11 | 396 | 33 | `Project-II` excluded entirely |
| **Total** | **43** | **40** | **1,344** | **112** | **Two projects excluded; one duplicate-format conflict blocked** |

## Structural validation

- All 1,344 `TestsData` rows conform to the expected row shape: MCQ rows have 30 questions, 120 flattened options and 30 zero-based answers (0–3); theory rows have four questions, empty options and four model-answer strings.
- All 112 exam-type banks contain 12 variants (four Easy, four Medium, four Hard).
- 112 subject-level exam descriptor files are present for the generated banks; no required descriptor files are missing and no unexpected exam-type descriptors were found.
- 192 payloads across six same-name duplicate subject banks were compared against their source rows; Questions, Options and Answers matched exactly.
- No duplicate TestIds were found within generated banks.
- `Project I` and `Project-II` have no generated exam banks, test rows or per-subject exam descriptors.

## Important limitation

Structural checks do not constitute academic validation. New questions and theory model answers were generated with deterministic templates from extracted syllabus topics; they need human subject-matter review for correctness, clarity, plausible distractors, syllabus coverage, and difficulty. Some extracted syllabus PDFs were flagged for manual review, and an answer key being structurally valid does not prove it is academically correct.

`Communication Skills-I` remains blocked because ICT marks it departmental while the same-name Computer Engineering subject is non-departmental. Copying that source verbatim would introduce theory Mid 1/ESE exams contrary to ICT's current exam-format rule; creating new questions for it was intentionally avoided. Resolve the subject flag or approve an explicit reuse-format exception before adding it.

## Database safety

All SQL files are staged artifacts only. No Supabase data or schema changes were performed.
