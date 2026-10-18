# Diploma Exam-Bank Restructuring — ChatGPT Handoff

_Last updated: 2026-10-18 (Asia/Kolkata)_

## Why this document exists

This is the working handoff for continuing the Diploma Computer Engineering and Diploma Chemical Engineering question-bank task in a new ChatGPT conversation. Read this document before changing files. It records the user's exact target, the rules to preserve, what the current repository documentation confirms, what has not yet been verified, and the next steps.

## Repository and scope

- Repository: [dakshhadvani19/prep_master_](https://github.com/dakshhadvani19/prep_master_)
- Branch: `main`
- Working area: `Questions/TestsData/Diploma/`
- Courses in scope:
  - `Computer Engineering/` — CourseId `44`
  - `Chemical Engineering/` — CourseId `46`
- Semesters in scope: **Semesters 1–6 for both courses** (12 semester folders total).
- Current task is a **GitHub repository file-structure/documentation task**. The user explicitly said not to work on Supabase for this task.
- Repository convention: make changes directly on `main`; do not create a branch or PR unless the user asks.
- Do not execute SQL, change database data/schema, or treat staged SQL as permission to insert rows.

## User's desired final structure

For every active subject in every semester, the target is a subject-named directory with one JSON file for each exam type that subject is allowed to have:

```text
Questions/TestsData/Diploma/
├── Computer Engineering/
│   ├── Semester 1/
│   │   ├── <Subject Name>/
│   │   │   ├── Mid 1.json
│   │   │   ├── Mid 2.json
│   │   │   └── ESE.json        # only when Is Departmental Subject = false
│   │   └── ...
│   ├── Semester 2/
│   ├── Semester 3/
│   ├── Semester 4/
│   ├── Semester 5/
│   └── Semester 6/
└── Chemical Engineering/
    ├── Semester 1/
    ├── Semester 2/
    ├── Semester 3/
    ├── Semester 4/
    ├── Semester 5/
    └── Semester 6/
```

This tree illustrates the target, not a claim that it has already been fully created. Git does not preserve empty directories, so each directory must contain real files. Retain useful README/manifest files where they exist.

## Exam rules — do not reinterpret

The authoritative task rules from the user's prior instructions are:

| Subject flag | Exam files | Payload for each exam type |
|---|---|---|
| `Is Departmental Subject = false` | `Mid 1.json`, `Mid 2.json`, `ESE.json` | Mid 1: 12 theory variants; Mid 2: 12 MCQ variants; ESE: 12 theory variants |
| `Is Departmental Subject = true` | `Mid 1.json`, `Mid 2.json` only | 12 MCQ variants per exam type; no ESE file |

- Every available exam type has **12 variants**: four Easy, four Medium, and four Hard.
- **Mid 1 covers only the first 50% of the ordered subject syllabus.** Use the relevant semester bank's `manifest.json` and `test_index` scope metadata to preserve the intended half-syllabus cutoff; do not simply use the whole syllabus.
- Each MCQ variant contains 30 questions, four options per question (120 flattened option strings in the current canonical payload) and 30 zero-based answer indexes.
- Each theory variant contains four questions worth 8 marks each, model answers, and no MCQ options. The current canonical row representation uses `Options: []` and four entries in `Answers`; prompts may be prefixed with `[8 marks]`.
- Treat `Easy`, `Medium`, and `Hard` as metadata, not as extra files. Each exam file must hold all 12 variants for that exam type, not just one test.
- Prevent repeated or near-duplicate questions inside a variant and across copied/reused content where feasible. Validate answer keys and question/options/answer lengths.

## Existing canonical format and source files

The checked-in course-level READMEs say each semester currently has canonical v2 exports:

- `exam-bank-v2.json` — complete test payloads plus `test_index` metadata mapping tests to subject, semester, exam type, difficulty, format, syllabus scope, and occurrence.
- `seed-all-v2.sql` — staged transactional INSERT statements targeting the existing `public."TestsData"` shape.
- `manifest.json` — subject-level policies, test counts, mappings and audit notes.
- `README.md` — semester counts and handling notes.
- Some semester/subject directories also have their own README/review companions.

The planned per-subject exam files should be derived from these canonical banks and their `test_index` rather than regenerated blindly. Preserve the original question, options, answer, difficulty, syllabus-scope and subject mapping. Do not accidentally create divergent versions of the same test. If the target JSON shape is not obvious from nearby files, inspect an existing subject folder and the v2 schema before creating files; record any chosen schema in this handoff or the README.

## Verified status from checked-in course-level READMEs

These are the counts stated by the repository's current course-level README files. They are a checked-in snapshot, not a fresh database query.

### Diploma Computer Engineering — CourseId 44

Course root: [Questions/TestsData/Diploma/Computer Engineering](../Questions/TestsData/Diploma/Computer%20Engineering/README.md)

| Semester | Subjects | Test rows | MCQ rows | Theory rows |
|---:|---:|---:|---:|---:|
| 1 | 8 | 252 | 132 | 120 |
| 2 | 7 | 228 | 108 | 120 |
| 3 | 6 | 204 | 84 | 120 |
| 4 | 6 | 192 | 96 | 96 |
| 5 | 7 | 204 | 132 | 72 |
| 6 | 5 | 156 | 84 | 72 |
| **Total** | **39 subject occurrences** | **1,236** | **636** | **600** |

The README lists 19,080 MCQ questions and 2,400 theory questions across the canonical test rows. Semester 6 subject-directory READMEs were found for subjects including `.NET`, `Project-II`, and `Entrepreneurship Development`. That confirms subject-level folders exist in at least part of the current tree, not that every required exam JSON file exists.

### Diploma Chemical Engineering — CourseId 46

Course root: [Questions/TestsData/Diploma/Chemical Engineering](../Questions/TestsData/Diploma/Chemical%20Engineering/README.md)

| Semester | Subjects | Test rows | MCQ rows | Theory rows |
|---:|---:|---:|---:|---:|
| 1 | 8 | 252 | 132 | 120 |
| 2 | 7 | 216 | 120 | 96 |
| 3 | 5 | 168 | 72 | 96 |
| 4 | 6 | 192 | 96 | 96 |
| 5 | 8 | 252 | 132 | 120 |
| 6 | 4 | 132 | 60 | 72 |
| **Total** | **38 subject occurrences** | **1,212** | **612** | **600** |

The README reports 15 same-name subject-bank reuses. It specifically notes that Project-I, Summer Internship, Entrepreneurship Development, and Project-II appear in Chemical Engineering Semesters 5–6 with reused variants, and also warns that source and target syllabi are not identical for all reused subjects. Verify syllabus alignment and departmental/exam-format compatibility before reusing a subject bank for newly created files. Preserve or report known reuse/mismatch decisions; do not silently overwrite or regenerate copied content.

### Combined documented scope

- **77 subject-semester occurrences** across both courses.
- **2,448 canonical test rows/variants** according to the course-level README counts.
- These figures describe the existing v2 banks. They are not proof that the target subject-folder `Mid 1.json` / `Mid 2.json` / `ESE.json` layout is complete.

## Current status: be exact about what is done

At the time this handoff was written, the following was confirmed by GitHub file/search results:

1. Both course root READMEs exist and document all six semester banks.
2. The semester-level v2 READMEs, manifests, and canonical JSON/SQL workflow are already documented for the two courses.
3. Some subject-named folders/READMEs exist; for example, Computer Engineering Semester 6 has subject folders.
4. GitHub indexed search did **not** return exact matches for file names `Mid 1.json` or `ESE.json`. Search indexing can miss files by their path, so this is a warning rather than a definitive file-tree audit.
5. **The complete 12-semester inventory of the desired exam-specific subject JSON files has not yet been exhaustively verified. Do not tell the user the final structure is complete until you inspect every semester/subject folder and validate the files.**

## Required next actions for the next ChatGPT session

1. **Inventory before writing.** Inspect the actual GitHub tree for all six semesters under each course. Record each subject folder, its `Is Departmental Subject` flag as already captured in the checked-in manifest/source metadata, and whether `Mid 1.json`, `Mid 2.json`, and `ESE.json` exist.
2. Compare the inventory against the target:
   - Both flags require `Mid 1.json` and `Mid 2.json`.
   - Only non-departmental subjects require `ESE.json`.
   - Every file must contain exactly 12 variants, split 4 Easy / 4 Medium / 4 Hard.
3. For any missing exam file, extract the matching subject + exam type variants from the semester's `exam-bank-v2.json` by using `test_index`. Preserve exact payloads and their metadata. Do not copy a whole semester bank into a subject file.
4. Check names, ID mapping, semester, exam-type casing, format, test count, syllabus scope and answer lengths. A flag/file mismatch is a bug (especially an ESE file for a departmental subject).
5. Make filenames exactly `Mid 1.json`, `Mid 2.json`, and `ESE.json` as requested. Watch spaces and case. Do not use similarly named alternatives without the user's permission.
6. Update relevant subject/semester/course README and manifest references after creating the files. Avoid editing unrelated app code or SQL.
7. Search for repeated questions and validate all 12 variants per available exam type. Summarize missing/blocked items rather than falsely claiming full completion.
8. Verify changes on GitHub `main` and report the exact paths changed. No Supabase operation is part of this task.

## Constraints and safety rails

- **GitHub files only for this task; no Supabase queries or writes.**
- Do not execute `seed-all-v2.sql`. The course README says the SQL is staged and has not been executed.
- Do not modify course/subject catalogs or application code just to complete this file layout.
- Do not delete or overwrite canonical v2 source banks, seed files, manifests, README files, or audit companions while splitting the files.
- Follow `docs/QUESTION_GENERATION_RULES.md` for question quality, syllabus grounding, unambiguous MCQs and answer verification.
- Follow existing ID/collision rules in `docs/primary_key_rules.md` (if IDs or filenames are touched). Keep IDs stable; never invent a colliding ID.
- If the course README and individual manifest conflict, inspect the actual JSON and report the discrepancy instead of choosing a value silently.
- The repository is large. Use focused file/tree operations and concise results; don't re-read or rewrite unrelated application modules.

## Paste-ready instruction for a new ChatGPT chat

> Read `docs/DIPLOMA_EXAM_BANK_HANDOFF.md`, `docs/PREPMaster_CURRENT_STATUS.md`, and `docs/QUESTION_GENERATION_RULES.md` in `dakshhadvani19/prep_master_`. Continue the GitHub-only task: verify and complete the subject-folder exam JSON layout for Diploma Computer Engineering and Diploma Chemical Engineering, Semesters 1–6. First inventory all existing files on `main`; do not assume completion. Each subject folder needs `Mid 1.json` and `Mid 2.json`; add `ESE.json` only when `Is Departmental Subject = false`. Each available exam file must contain 12 variants (4 Easy, 4 Medium, 4 Hard). Mid 1 must cover only the first 50% of the ordered syllabus. Split the existing semester `exam-bank-v2.json` using `test_index`, preserve payloads and canonical source files, validate all counts and flag/file matches, update relevant documentation, and report verified paths. Do not query or change Supabase and do not execute SQL.
