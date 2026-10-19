> **Archive status (2026-10-19):** The semester banks now retain one representative test per subject/exam type (about 8.3% of the former test variants) to keep repository context compact for future Groq generation. These are examples only, not complete production banks or academically approved answer keys. See [the generation instructions](../../../../docs/EXAM_QUESTION_GENERATION_INSTRUCTIONS.md). Any inventory counts below describe the pre-compaction bank; use each semester's `manifest.json` for retained counts.

# Chemical Engineering — Compact Reference Question Archive

This folder contains the staged exam-question bank for all six semesters of Diploma Chemical Engineering (CourseId 46).

## Semester overview

| Semester | Subjects | Tests | MCQ tests | Theory tests | Subjects reusing existing banks |
|---:|---:|---:|---:|---:|---:|
| 1 | 8 | 252 | 132 | 120 | 5 |
| 2 | 7 | 216 | 120 | 96 | 4 |
| 3 | 5 | 168 | 72 | 96 | 1 |
| 4 | 6 | 192 | 96 | 96 | 1 |
| 5 | 8 | 252 | 132 | 120 | 2 |
| 6 | 4 | 132 | 60 | 72 | 2 |
| **Total** | **38** | **1,212** | **612** | **600** | **15** |

The aggregate inventory, subject metadata, and reuse audit are in [manifest.json](./manifest.json).

## Exam rules

- For `isDepartmentalSubject = false`: Mid 1 has four 8-mark theory questions with model answers and covers the first 50% of the ordered syllabus; Mid 2 has 30 MCQs; ESE has four 8-mark theory questions with model answers.
- For `isDepartmentalSubject = true`: Mid 1 and Mid 2 each have 30 MCQs; there is no ESE bank.
- Each available exam type has 12 variants: four Easy, four Medium, and four Hard.

## Same-name reuse rule

Before generating new questions, the source-bank check prioritizes normalized exact subject-name matches. It copies the existing `Questions`, `Options`, and `Answers` payloads verbatim while preserving the Chemical Engineering `TestId` values and exam metadata. Punctuation and spacing differences are ignored during name comparison.

The Semester 5–6 banks now correctly reuse these same-name subjects from Diploma Computer Engineering:
- Project-I: 24 variants.
- Summer Internship: 24 variants.
- Entrepreneurship Development: 36 variants.
- Project-II: 24 variants.

The source and target syllabi are not identical for all of these subjects. The requested name-match reuse rule takes priority, and the mismatch is recorded in the manifests for human review. These payloads were copied, not regenerated.

If an exact-name source exists but its departmental flag would force an incompatible exam format, the generator stops and flags the mismatch instead of silently generating replacement questions.

## Files

Each `Semester N/` directory contains:
- `exam-bank-v2.json`: full question payloads and a `test_index` mapping subject, semester, exam type, difficulty, and occurrence to each `TestId`.
- `manifest.json`: per-semester counts, exam rules, subjects, and reuse audit.
- `seed-all-v2.sql`: staged transactional INSERT statements for the existing `public."TestsData"` table.
- Some earlier-semester directories may also include review companions.

The repeatable content-generation logic and topic cue profile are `generation-engine.js` and `generation-profile.json`.

## Database status and limitations

The files target the existing `public."TestsData"` table with four columns: `TestId`, `Questions`, `Options`, and `Answers`. MCQ rows have 30 questions, 120 flattened option entries, and 30 zero-based answer indexes. Theory rows have four `[8 marks]` prompts, an empty options array, and four model answers.

**No SQL seed has been executed against Supabase as part of this work.** The files are staged exports; verify collisions before inserting. Generated content still requires academic review. The same-name subject payloads must be compared with Chemical Engineering's official syllabus before using them for formal assessment because syllabus differences are explicitly retained by the requested reuse policy.
