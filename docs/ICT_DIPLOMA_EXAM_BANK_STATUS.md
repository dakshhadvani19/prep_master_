# ICT Diploma Exam Bank — Generation Status

**Status date:** 2026-10-18  
**Course:** Diploma Information and Communication Technology  
**CourseId:** `49`  
**Canonical location:** `Questions/TestsData/Diploma/Information and Communication Technology/`

## Scope and result

The active ICT catalog currently contains 43 subjects in Semesters 1, 2, 4, 5, and 6. Semester 3 has no active ICT subjects in the current catalog, so no Semester 3 question bank was created.

| Semester | Active catalog subjects | Subjects with banks | Exam-type banks | Tests | Exact-name reused subjects | Excluded projects |
|---|---:|---:|---:|---:|---:|---|
| 1 | 5 | 4 | 11 | 132 | 2 | — |
| 2 | 6 | 6 | 15 | 180 | 3 | — |
| 3 | 0 | 0 | 0 | 0 | 0 | — |
| 4 | 6 | 6 | 15 | 180 | 1 | — |
| 5 | 14 | 13 | 38 | 456 | 0 | Project I |
| 6 | 12 | 11 | 33 | 396 | 0 | Project-II |
| **Total** | **43** | **40** | **112** | **1,344** | **6** | **2 subjects** |

Every available exam type has 12 difficulty variants: four Easy, four Medium, and four Hard. Across the banks, the current payload counts are 17,280 MCQ question entries and 3,072 theory question entries. MCQ options are flattened four-per-question; answer indexes are zero-based.

## Duplicate policy and verification

The following six exact-name duplicate subjects reuse their existing question, option, and answer payloads; new questions were not generated for these subjects:

| ICT subject | Source |
|---|---|
| Applied Physics | Diploma Computer Engineering, Semester 2 |
| Mathematics-I | Diploma Computer Engineering, Semester 1 |
| Computer Programming | Diploma Computer Engineering, Semester 2 |
| Mathematics II | Diploma Computer Engineering, Semester 2 |
| Environment Conservation & Disaster Management | Diploma Chemical Engineering, Semester 2 |
| Web Technology | Diploma Computer Engineering, Semester 4 |

Payload equality was checked against the source banks for all reused test rows: **192 of 192 test payloads matched exactly**.

## Explicit exclusions and exception

- **Project I** (SubjectId `49009320050401`) and **Project-II** (SubjectId `49009320060201`) have no exam banks, test rows, or subject-level exam files.
- **Communication Skills-I** (SubjectId `49091912110101`) is not generated. A same-name source exists in Diploma Computer Engineering, but its `isDepartmentalSubject=false` flag provides theory Mid 1/ESE plus MCQ Mid 2; ICT has `isDepartmentalSubject=true`, which calls for MCQ Mid 1/Mid 2 and no ESE. To avoid creating replacement questions or silently mixing incompatible exam formats, this subject is blocked and recorded in the Semester 1 manifest for review.

## Structural validation performed

- The expected exam-file set matches the semester manifests: 11, 15, 15, 38, and 33 subject-level exam descriptor files for Semesters 1, 2, 4, 5, and 6 respectively.
- All 1,344 test metadata records have unique TestIds within their semester bank; each semester's row count matches its `test_index`.
- MCQ rows pass shape validation: 30 questions, 120 flattened options, and 30 answer indexes in the range 0–3.
- Theory rows pass shape validation: four prompts marked `[8 marks]`, an empty options array, and four model-answer strings.
- No project-specific folders or exam descriptor files were found.
- `seed-all-v2.sql` is staged output only. **No exam rows were inserted into Supabase** by this generation work.

## Content-quality limitation

This is a **generated draft bank, not an academically approved release**. Structural checks do not prove subject accuracy. A sample review of newly generated items found generic template phrasing and model-answer scaffolding, so question wording, distractor plausibility, answer correctness, theory model answers, difficulty separation, syllabus coverage, and duplicates still need subject-expert QA. The syllabus extraction itself also flags some subjects for manual contents review. Do not treat newly generated content as production-ready until those checks pass.

The bank generator and manifests retain the source mapping, format, difficulty, and review metadata needed for that follow-up.
