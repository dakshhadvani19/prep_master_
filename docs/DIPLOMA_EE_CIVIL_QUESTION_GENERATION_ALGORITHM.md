# Diploma Electrical & Civil Engineering — Question-Bank Generation Algorithm

**Status:** Implementation specification; no questions are generated or inserted by this document alone.  
**Scope:** Diploma Electrical Engineering and Diploma Civil Engineering, Semesters 1–6.  
**Repository-only task:** Do not execute SQL or modify Supabase from this workflow.

## 1. Inputs and authoritative sources

For each course and semester, load the matching file from `Syllabus/syllabus_txt/Diploma/Electrical_Engineering/semester_N.json` or `Syllabus/syllabus_txt/Diploma/Civil_Engineering/semester_N.json`. Resolve each syllabus subject against the canonical course/subject mappings and live subject metadata when the runtime integration is implemented. Do not infer semester, subject ID, departmental status, or exam availability from names alone.

Required inputs:
- Exact course and semester.
- Subject ID and canonical subject name.
- `IsDepartmentalSubject` value from the authoritative subject record.
- Ordered syllabus units/topics and contact hours, when available.
- Existing canonical question banks and `test_index` metadata for eligible reuse.
- Rules in `docs/QUESTION_GENERATION_RULES.md` and `docs/EXAM_FORMAT_AND_MARKING_RULES.md`.

Skip project, internship, and other subjects explicitly marked as non-examinable. If the syllabus, subject mapping, or exam policy is missing or contradictory, record the issue and skip that subject rather than inventing data.

## 2. Determine allowed exam types

- **Departmental subject:** Mid 1 and Mid 2 are MCQ exams; do not create ESE unless an authoritative course-specific policy explicitly permits it.
- **Non-departmental subject:** Mid 1 and ESE are theory exams; Mid 2 is MCQ.
- Generate only exam types supported by the authoritative subject policy.

## 3. Variants and difficulty

For every allowed exam type, create six variants:
- 2 Easy
- 2 Medium
- 2 Hard

Difficulty must change the reasoning demand, not merely wording:
- **Easy:** direct syllabus knowledge or one-step application.
- **Medium:** application, comparison, interpretation, or a short calculation.
- **Hard:** multi-step reasoning, constrained scenarios, or choosing between plausible alternatives while remaining fair for diploma level.

Use deterministic unique `TestId` values according to `docs/primary_key_rules.md`. Before assigning an ID, check it against every existing canonical bank and metadata index in the repository. Never overwrite an existing test or reuse an ID for different content.

## 4. MCQ generation

Each MCQ variant must contain exactly 30 questions:
- 30 non-empty question stems.
- Exactly four non-empty options per question, flattened in question order (120 option strings total in the current `TestsData` payload).
- Exactly 30 answer indexes, each an integer from 0 to 3 (`0=A`, `1=B`, `2=C`, `3=D`).
- One defensible correct answer per question.
- No duplicate options within a question, no repeated question stems within a test, and no obvious answer-position pattern.

Cover the allowed syllabus scope across the test. Do not invent facts, formulas, standards, numerical assumptions, or unsupported subject content. For numerical MCQs, recompute the answer independently and ensure units and rounding are clear.

## 5. Theory generation and marks

Every theory question must display its mark value, and its model answer/marking points must fit that value.

### Mid 1 — exactly 30 marks

- Include exactly two 1-mark questions.
- The remaining 28 marks must use 4-mark and 8-mark questions.
- Valid combinations are: seven 4-mark questions; five 4-mark plus one 8-mark question; three 4-mark plus two 8-mark questions; or one 4-mark plus three 8-mark questions.
- Use a sensible mixture of 4- and 8-mark questions where possible; avoid repetitive question patterns.
- Mid 1 may use only the first 50% of the ordered syllabus, respecting contact-hour weighting when present.

### ESE — exactly 60 marks, only where allowed

- Include exactly two 1-mark questions.
- **Arithmetic conflict:** two 1-mark questions plus only 4- and 8-mark questions cannot total 60. Do not silently generate a 58-mark or 62-mark paper. Unless an authoritative blueprint supplies a different valid pattern, flag this conflict for approval before generating ESE. A possible approved resolution is to include one 2-mark question and make the remaining 56 marks from 4-/8-mark questions.
- ESE covers the full relevant syllabus unless the authoritative blueprint specifies otherwise.

### Model-answer requirements

- **1 mark:** one precise fact, term, result, or short step.
- **4 marks:** a bounded explanation, comparison, method, or application with marking points totalling four.
- **8 marks:** a fuller explanation or multi-step application/solution with marking points totalling eight.
- Accept equivalent correct wording. Do not require one memorized sentence where the concept can be expressed correctly in multiple ways.

## 6. Reuse policy

Before generating new content, search eligible existing banks and their `test_index` metadata for reusable questions. Reuse only when the subject, syllabus scope, exam format, mark value, and difficulty are appropriate. Preserve source attribution and the original answer/options. Do not copy a question merely because its subject title is similar; verify the actual concept and syllabus alignment.

Avoid duplicates:
1. Within each variant.
2. Across variants of the same subject and exam type.
3. Against any reused source bank where feasible.

A copied test must receive its own valid unique test identity if it is stored as a separate test record, while preserving source metadata.

## 7. Lightweight quality gate

Run automatic checks before accepting a generated or reused test:

1. JSON parses and matches the canonical `exam-bank-v2.json` schema.
2. Every `test_index` entry has exactly one payload row and vice versa.
3. Test IDs are unique and comply with `docs/primary_key_rules.md`.
4. MCQs meet the 30-question, 120-option, 30-answer-index contract.
5. Theory question marks sum exactly to 30 for Mid 1 or 60 for ESE; model-answer and marking-point counts match the question marks.
6. No blank stems/options/answers, repeated options within a question, or obvious repeated stems.
7. Answer indexes are valid; numerical answers are recalculated; each MCQ has one defensible answer.
8. Subject, course, semester, exam type, difficulty, and syllabus scope metadata match the intended test.
9. Excluded project/internship subjects and disallowed exam types are absent.

This is a **basic quality gate**, not a claim of expert academic certification. Flag uncertain domain facts or ambiguous questions for targeted manual review; do not block every test for stylistic preferences.

## 8. Persistence and cleanup boundaries

- This task only creates and validates repository files. Do not execute `seed-all-v2.sql` or write to Supabase.
- Keep canonical `exam-bank-v2.json`, `test_index`, manifests, and review notes as the auditable source of truth.
- Do not delete a seed file or question bank merely because it is redundant-looking. Remove generated/duplicate artifacts only after verifying that the canonical source and any required migration/import path remain intact.
- Before any later database insertion, validate the complete payload, check all TestIds against Supabase, insert in a transaction, verify inserted row counts and payloads, and only then consider removing redundant local artifacts.
