# Diploma EE/Civil Question-Bank Generation Algorithm

**Scope:** Diploma Electrical Engineering and Diploma Civil Engineering, Semesters 1–6.  
**Repository-only:** Do not execute SQL or modify Supabase.  
**Required instructions:** Read `docs/EXAM_QUESTION_GENERATION_INSTRUCTIONS.md`, `docs/QUESTION_GENERATION_RULES.md`, `docs/EXAM_FORMAT_AND_MARKING_RULES.md`, and `docs/primary_key_rules.md`.

## 1. Resolve source and exam eligibility
1. Load the matching syllabus JSON from `Syllabus/syllabus_txt/Diploma/Electrical_Engineering/` or `Syllabus/syllabus_txt/Diploma/Civil_Engineering/`.
2. Resolve course, semester, subject ID/code/title, ordered units, and `IsDepartmentalSubject` from authoritative mappings/metadata. Never infer these from a name.
3. Skip project, internship, and other non-examinable subjects.
4. If mapping, syllabus, or exam policy is missing/conflicting, record the issue and skip the subject rather than inventing data.
5. Normally, departmental subjects allow Mid 1 MCQ and Mid 2 MCQ; non-departmental subjects allow Mid 1 theory, Mid 2 MCQ, and ESE theory. Follow authoritative policy if it differs.

## 2. Source-grounded generation
1. Extract topics, learning outcomes, formulas, methods, constraints, and contact hours from the verified source.
2. Build a coverage map before writing questions. Use official unit weightage where available; otherwise label the blueprint provisional.
3. Search the compact sample banks for examples. Diploma Computer Engineering, Chemical Engineering, and ICT banks have been reduced to one representative test per subject/exam type (about 8.3% of former variants). These are payload/style examples only, not complete banks or academically approved answer keys.
4. Reuse a question only after verifying its actual content, answer, subject/syllabus fit, exam format, and mark value. Never reuse solely because subject names match.
5. Generate exactly the exam format and marks specified in `docs/EXAM_QUESTION_GENERATION_INSTRUCTIONS.md`.
6. Independently check answers, numerical work, and short code examples. Run structural validation before accepting the result.

## 3. Difficulty and variation
- Easy: direct understanding or one-step application.
- Medium: application, comparison, interpretation, short calculation, code tracing, or small debugging task.
- Hard: multi-step reasoning, constraints, debugging, cross-topic integration, or comparing plausible approaches while remaining fair at diploma level.
- Vary topics, cognitive skills, contexts, values, and answer positions. Avoid duplicates and superficial rewording. Difficulty must not depend on ambiguity or missing information.

## 4. Payload and TestId rules
- Follow `docs/primary_key_rules.md`; check every existing bank/index before assigning IDs. Never overwrite or repurpose a TestId.
- Keep the `exam-bank-v2.json` contract: every `test_index` entry maps to exactly one `rows` payload and vice versa.
- MCQ: exactly 30 stems, 120 flattened option strings, and 30 zero-based answer indexes (0–3).
- Theory: mark labels and one model answer per question; options remain empty in the current TestsData structure.
- Keep syllabus/source attribution, scope, exam type, difficulty, and reuse metadata synchronized across JSON, manifest, and seed SQL.

## 5. Validation gate
1. JSON parses and every index/payload maps one-to-one.
2. TestIds are unique and compliant.
3. MCQ counts/options/indexes are exact; each question has one defensible answer.
4. Numerical items are independently recomputed with units and rounding checked.
5. Theory marks total exactly 30 for Mid 1 or 60 for ESE under an explicitly approved blueprint. Two 1-mark questions plus only 4-/8-mark questions cannot total 60; see the instruction file and do not silently bypass this conflict.
6. Mid 1 theory uses only the first 50% of ordered syllabus; subject and allowed exam metadata are correct.
7. No blank content, duplicate options, repeated stems, placeholders, or answer-position patterns.
8. Seed SQL matches the retained TestIds and payloads exactly.
9. Report structural validation separately from academic review. Automated checks are not academic certification.

## 6. Cleanup and persistence boundaries
- Checked-in CE/Chemical/ICT banks are compact reference archives, not full production banks. Do not regenerate removed variants unless a full bank is explicitly requested.
- Keep canonical sample JSON, matching manifests, and seed SQL synchronized.
- Do not delete canonical samples or import paths because they look redundant.
- Before any later database insertion, check ID collisions, validate the intended payload, insert transactionally, and verify row counts and payloads. This algorithm never writes to Supabase.
