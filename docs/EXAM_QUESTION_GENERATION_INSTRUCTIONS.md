# PrepMaster — Exam Question Generation Instructions for Groq

**Purpose:** Reusable source of truth for generating college-exam questions from a verified syllabus. Read with `docs/QUESTION_GENERATION_RULES.md`, `docs/EXAM_FORMAT_AND_MARKING_RULES.md`, and `docs/primary_key_rules.md`.

## 1. Required context and source discipline
- Require the exact course, semester, subject ID/code/title, official syllabus, ordered units, departmental-subject flag, and requested exam type.
- Build a topic/learning-outcome coverage map before writing questions. Use official weightage/contact hours when available; otherwise label the blueprint provisional.
- The syllabus/textbook/approved source is authoritative. Never invent topics, formulas, standards, API behavior, programming rules, or official weightage. Flag missing/conflicting evidence and skip unsupported content.
- Mid 1 theory covers only the first 50% of the ordered syllabus (weighted by contact hours if available). Mid 2 MCQ and ESE cover the full applicable syllabus unless an official blueprint differs.
- Departmental subjects normally have Mid 1 MCQ and Mid 2 MCQ only. Non-departmental subjects normally have Mid 1 theory, Mid 2 MCQ, and ESE theory. Follow authoritative subject policy, not assumptions from the subject name.
- Compact sample banks in this repository are style/payload examples only, not complete banks or academically approved answer keys.

## 2. MCQ exam blueprint
- Exactly **30 MCQs × 1 mark = 30 marks**.
- Exactly four distinct options (A–D), one defensible best answer, and 30 zero-based answer indexes (0=A, 1=B, 2=C, 3=D).
- Current TestsData payload: 30 question stems, 120 flattened option strings, 30 answer indexes.
- Balance syllabus topics and cognitive skills. Mix core understanding, application, interpretation, calculations, troubleshooting, and cross-topic reasoning where relevant.
- Distractors should model genuine misconceptions, incomplete truths, misapplied rules, wrong calculations, boundary-case errors, or relevant-but-nonresponsive concepts. Do not use absurd/random distractors.
- Include assumptions, units, input conditions, versions, and rounding rules whenever needed. No hidden assumptions, ambiguity, answer clues, repeated stems/options, or obvious answer-position patterns.
- Independently solve every item and verify the keyed option.

## 3. Theory exam marks

### Mid 1 theory — exactly 30 marks
- Generate exactly 7 questions in this order: `[1, 1, 4, 8, 4, 8, 4]`.
- Questions 1 and 2 are 1 mark each and must be answerable in one word or one concise sentence.
- The remaining questions are three 4-mark and two 8-mark questions (2 + 12 + 16 = 30).

### ESE theory — exactly 60 marks
- Generate exactly 13 questions in this order: `[1, 1, 2, 4, 8, 4, 8, 4, 8, 4, 8, 4, 4]`.
- Questions 1 and 2 are 1 mark each and must be answerable in one word or one concise sentence.
- Question 3 is 2 marks. It is necessary because the remaining 58 marks cannot be formed from only 4-mark and 8-mark questions.
- The remaining 56 marks are six 4-mark and four 8-mark questions (2 + 2 + 24 + 32 = 60).

### Model answers and marking
- Every theory prompt must display its mark value, such as `[1 mark]`, `[4 marks]`, or `[8 marks]`.
- Provide a model answer or marking points for every question. The points must sum to the item's marks.
- 1 mark: one precise fact/result/step, answerable in one word or one concise sentence. 2 marks: two compact creditable elements. 4 marks: a bounded explanation, comparison, method, or application. 8 marks: a fuller structured explanation or multi-step application with appropriate evidence/examples.
- Accept equivalent correct wording. Do not require one memorized sentence where multiple technically correct explanations exist.

## 4. Suitable theory question types
Select types based on the subject and syllabus; do not force every type into every exam.
1. Core concepts: define, explain purpose, describe working, or explain why a method is used.
2. Differentiate/compare: compare related concepts using explicit criteria.
3. Architecture/block diagrams: components, layers, responsibilities, interfaces, sequence, and data flow. Ask for labelled diagrams only when useful.
4. Applications/use cases: apply a concept to a realistic lab, college, or industry scenario and justify the choice.
5. Algorithm/procedure: ordered steps, pseudocode, flowchart, or method with key decisions.
6. Numerical/derivation: formula choice, steps, units, and final result using syllabus-level mathematics.
7. Advantages, limitations, and trade-offs tied to a concrete context.
8. Debugging/error analysis: identify an error, explain its cause, and correct it.
9. Output tracing/dry runs: predict output or state changes of a short program/algorithm.
10. Short code/practical task: write, complete, or correct a small program/function/class/query.
11. Code explanation/comparison: explain a snippet, compare implementations, select a data structure/API, or analyze complexity if taught.
12. Database/query tasks: short SQL queries, schema fragments, normalization examples, or transaction scenarios when in scope.
13. Small design/scenario analysis: choose components, state assumptions, and justify trade-offs without making it a full project.
14. Diagram/table/DFD/circuit/graph interpretation.
15. Cross-topic integration of two or three taught concepts where appropriate.

## 5. Programming and computer-science subjects
- Code questions are welcome when syllabus-relevant. Keep them **basic-to-intermediate, short, and comparable to college practical exercises**—not long implementations.
- Suitable tasks: write a loop/function, implement a small algorithm, fill missing lines, correct a bug, trace output, explain a short OOP snippet, write a simple SQL query, compare data structures/APIs, or identify a validation/security flaw.
- Do not ask for a full website, OS, multi-file application, production-ready architecture, or large CRUD system in one theory answer.
- 4 marks: one focused small task or a few clear steps. 8 marks: a richer but bounded function/algorithm/design plus explanation and relevant edge cases.
- State language/version, required signature/method, input/output, constraints, allowed libraries, and assumptions. Add sample input/output when useful.
- Model answers should include readable code, brief explanation, and a small test/expected output where appropriate. Check syntax and logic; do not mark mere style preferences as errors.
- Architecture questions should name the scope and ask about components, responsibilities, interfaces, sequence/data flow, constraints, or trade-offs—not just “draw architecture”.

## 6. Difficulty and quality
- Easy: direct understanding or one-step application.
- Medium: application, comparison, interpretation, short calculation, code tracing, or small debugging task.
- Hard: multi-step reasoning, constraints, debugging, integration, or comparing plausible approaches while remaining fair and within syllabus.
- Challenge should come from reasoning, not obscure facts, unclear grammar, trick wording, or missing information.
- Vary topics, verbs, scenarios, code/data values, and cognitive skills. Avoid duplicates and superficial rewording.
- Each MCQ must have one defensible answer; theory prompts need a transparent marking rubric. Partial-truth options are allowed only when the exact stem conditions make them unambiguously insufficient.

## 7. Generation and validation workflow
1. Validate course/semester/subject identity, source, allowed exam types, mark blueprint, and syllabus scope.
2. Extract topics/outcomes and allocate slots before drafting.
3. Draft questions and answers.
4. Independently verify facts, calculations, answer keys, and code behavior.
5. Check exact marks, question counts, option counts, answer indexes, syllabus coverage, duplicate content, and metadata.
6. Revise ambiguous/unsupported items; flag genuine unresolved subject-matter issues.
7. Keep `test_index`, rows, manifests, and seed SQL synchronized. Each TestId must be unique and comply with `docs/primary_key_rules.md`.
8. Report structural checks separately from academic review. Do not claim academic certification without qualified review.

## 8. Output contract
- MCQ: 30 questions, four options each, 30 zero-based answer indexes.
- Theory: labelled mark values, one model answer per question, exact approved total, and an empty options array in the current TestsData schema.
- Preserve syllabus/source attribution, scope, exam type, difficulty, and reuse metadata. Never overwrite or repurpose a TestId.
