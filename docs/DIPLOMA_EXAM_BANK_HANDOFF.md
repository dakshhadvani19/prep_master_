# Diploma Electrical & Civil Engineering Exam-Bank Handoff

_Last updated: 2026-10-19 (Asia/Kolkata)_

## Scope
- Repository: `dakshhadvani19/prep_master_`
- Courses: Diploma Electrical Engineering and Diploma Civil Engineering, Semesters 1–6.
- Exclude project, internship, and other subjects explicitly marked non-examinable.
- Repository-only workflow: do not execute SQL or modify Supabase.

## Current repository state
Syllabus files exist under:
- `Syllabus/syllabus_txt/Diploma/Electrical_Engineering/semester_1.json` through `semester_6.json`
- `Syllabus/syllabus_txt/Diploma/Civil_Engineering/semester_1.json` through `semester_6.json`

No canonical question-bank files were found under the EE/Civil question-bank folders at the last inventory. Do not report those banks as complete until files are actually created and validated.

## Required instructions — read in this order
1. `docs/EXAM_QUESTION_GENERATION_INSTRUCTIONS.md`: main reusable Groq prompt context and exam blueprint.
2. `docs/QUESTION_GENERATION_RULES.md`: source grounding, question quality, and distractor rules.
3. `docs/EXAM_FORMAT_AND_MARKING_RULES.md`: marks and marking requirements.
4. `docs/primary_key_rules.md`: stable TestId and collision rules.
5. `docs/DIPLOMA_EE_CIVIL_QUESTION_GENERATION_ALGORITHM.md`: generation and validation sequence.

## Exam rules
- Departmental subject: Mid 1 and Mid 2 MCQ, each exactly 30 questions × 1 mark = 30 marks.
- Non-departmental subject: normally Mid 1 theory, Mid 2 MCQ, ESE theory, unless authoritative subject policy differs.
- Mid 1 theory: exactly two 1-mark questions; remaining 28 marks use 4- and 8-mark questions. Valid combinations for the remaining marks: 7×4; 5×4 + 1×8; 3×4 + 2×8; or 1×4 + 3×8.
- ESE theory: two 1-mark questions plus only 4-/8-mark questions cannot total 60. Explicitly resolve/approve a blueprint exception; recommended option is one 2-mark question plus 4-/8-mark questions totaling 56.
- Programming subjects may use short basic-to-intermediate code writing, output tracing, debugging, SQL tasks, architecture, differentiation, applications, and design reasoning. Do not demand long/full application implementations.

## Compact sample-bank status
Diploma Computer Engineering, Chemical Engineering, and ICT sample banks were reduced to one representative test per subject/exam type (about 8.3% of former test variants). Their JSON banks, manifests, and seed SQL were synchronized. These examples are not complete production banks and have not thereby become academically certified.

## Quality and safety
- Verify actual source content and syllabus alignment before reuse; a matching subject name is insufficient.
- Keep structural validation separate from academic review.
- Preserve matching sample JSON, manifest, and seed SQL as a set.
- Do not insert into Supabase as part of this workflow.
