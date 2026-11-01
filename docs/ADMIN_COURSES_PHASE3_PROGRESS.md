# Admin Courses â€” Phase 3 Progress

Last updated: 2026-11-01

Status: **Implemented; live Supabase migrations applied and verified**

## Delivered

- Added PDF, DOCX and CSV question-bank parsing with provenance: PDF page number, DOCX paragraph number, CSV row number.
- Parses numbered question sections into question text, MCQ options, answer key, theory model answer, marks, difficulty and rubric.
- Normalizes MCQ correct answers into zero-based option indices. Ambiguous/missing answers, invalid option counts, missing theory answers, duplicate text, invalid marks and invalid difficulty stay visible with per-item errors.
- Generates a draft marking rubric for theory items only when none is supplied. Generated drafts cannot publish until the administrator marks them reviewed.
- Adds a subject-specific exam mark check for complete 30-question MCQ sets. Expected marks are derived server-side from the verified subject/exam policy; any mismatch requires explicit admin acknowledgement. A partial final set is retained and labelled incomplete.
- Adds an editable admin review panel: source location, question text, options, correct answer, model answer, marks, difficulty, rubric, inclusion/exclusion and valid/rejected/warning counts.
- Adds a separate explicit publish action. Server and database checks block included invalid questions and unreviewed generated rubrics.
- Adds idempotent private canonical bank/question/set storage. MCQ questions are grouped into sets of 30; short remain¶»§q«^