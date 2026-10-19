# PrepMaster Exam Formats and Marking Rules

**Status:** Current generation specification  
**Purpose:** The canonical rules for generating exam questions at runtime and for retaining small reference samples in this repository.  
**Scope:** Diploma and other mapped courses, subject to each course's verified syllabus, departmental status, and exam types.

## 1. General generation requirements

- Resolve the active course, semester, subject ID, exact subject name, departmental flag, and authoritative syllabus before generating questions.
- Do not assume an exam type exists for every subject. Read the live `Subjects.isDepartmentalSubject` value and use the applicable policy:
  - **Departmental subject:** Mid 1 and Mid 2 are MCQ exams; no ESE unless the course policy explicitly says otherwise.
  - **Non-departmental subject:** Mid 1 and ESE are theory exams; Mid 2 is MCQ.
  - If the actual course/subject policy differs, stop and flag the exception rather than silently changing the format.
- Generate only the chosen difficulty and requested exam; do not generate every possible variant pre-emptively.
- Follow the complete relevant syllabus. Mid 1 may only use the first 50% of the ordered syllabus (respecting unit/contact-hour weighting when available). ESE may cover the full syllabus.
- Include examples, calculations, practical scenarios, or code-writing/debugging questions only when supported by the subject syllabus.
- Use the current TestsData export contract: `TestId`, `Questions`, `Options`, and `Answers`. Keep course/subject/semester/exam type/difficulty/format/marking metadata in the canonical reference JSON or companion metadata, not as unsupported TestsData columns.
- Never trust a generated answer key without validation. Validate syntax, schema, answer-key range, duplicates, syllabus alignment, and the single-defensible-answer condition before presenting or saving a generated exam.

## 2. MCQ exam format — Mid 2 and departmental Mid 1

- Exactly **30 MCQs** per exam.
- Exactly **4 options per question**; the TestsData `Options` payload is flattened in question order (A–D for question 1, then A–D for question 2, and so on), for **120 option entries**.
- Exactly **one correct option** per question.
- Store the answer key as a zero-based integer: `0 = A`, `1 = B`, `2 = C`, `3 = D`. One answer-key entry per question (30 total).
- Balance answer positions across a complete exam; do not use a predictable pattern.
- The answer key and explanations must not be shown during the timed attempt. Reveal appropriate review information after submission.

## 3. Theory exam format

Theory tests contain short-answer and extended-answer questions. Questions must explicitly state their mark value; model answers and marking guidance must match that value.

### Mid 1 — 30 marks total

- Include exactly **two 1-mark questions** (2 marks total).
- Use 4-mark and 8-mark questions for the remaining 28 marks.
- Allowed combinations for the remaining questions include:
  - seven 4-mark questions; or
  - five 4-mark questions and one 8-mark question; or
  - three 4-mark questions and two 8-mark questions; or
  - one 4-mark question and three 8-mark questions.
- In each case, the two 1-mark questions plus the selected 4-/8-mark questions must total exactly **30 marks**.
- Cover only the first 50% of the ordered syllabus, using the verified Mid 1 scope for that subject.

### ESE — 60 marks total, when ESE exists

- Include exactly **two 1-mark questions** (2 marks total).
- Important arithmetic constraint: after two 1-mark questions, the remaining 58 marks cannot be made using only 4- and 8-mark questions, because both are multiples of 4.
- To reach exactly 60 marks while keeping two 1-mark questions, this specification therefore requires **one 2-mark question**, plus 4-/8-mark questions totalling 56 marks. The 56 marks may be any valid combination of 4- and 8-mark questions (for example, seven 8-mark questions; or nine 4-mark questions plus two 8-mark questions).
- If the university's official ESE blueprint forbids 2-mark questions, treat that as a configuration conflict and ask for an approved alternative before generating; do not silently emit an exam with the wrong total.
- ESE may cover the full relevant syllabus unless an authoritative blueprint specifies a narrower scope.

### Theory question construction and model answers

- A 1-mark question should assess one precise fact, term, result, or a single small step. Supply a concise expected answer.
- A 4-mark question should have a bounded explanation, method, comparison, worked step, or small application. Its marking guide should identify distinct creditable points/steps adding to four marks.
- An 8-mark question should require a fuller explanation, a multi-step solution, a worked example, or a reasoned application. Its marking guide should identify creditable points/steps adding to eight marks.
- Model answers are guidance, not a requirement for one exact wording. Accept equivalent technically correct responses where appropriate.
- Do not use filler questions merely to achieve the total. If the syllabus does not support a required combination, flag the blueprint conflict for that subject.

## 4. Coding-capable subjects

For subjects whose verified syllabus includes programming, scripting, SQL, markup, algorithms, or similar practical content, a theory paper may include code-related questions when appropriate to the marks and syllabus, including:

- write a short program or function for a stated task;
- trace code and determine output;
- find and fix a bug;
- complete a missing code segment;
- explain an algorithm, query, code segment, or design choice.

Every code question must specify the language/format and any relevant input, output, constraints, or assumptions. The expected answer or rubric must award marks for correct logic and required functionality; do not make the question depend on unstated environment details. Do not add coding questions to subjects whose syllabus does not support them.

## 5. Difficulty and quality

- **Easy:** one main concept or direct application; clear stem and credible near-miss alternatives for MCQs.
- **Medium:** meaningful application or interpretation; the stem must contain the information needed to determine the answer.
- **Hard:** multiple meaningful reasoning demands, constraints, calculations, debugging, or trade-offs where supported by the topic. Length and obscure wording alone do not make a question hard.
- Avoid ambiguous questions, duplicated stems/options, unsupported factual claims, implausible distractors, answer-position bias, and repeated templates.
- Keep internal answer rationales/QA evidence separate from student-facing content unless the review interface explicitly supports it.

## 6. Runtime generation and persistence

1. Search Supabase for an existing compatible exam using the actual active subject mapping, exam type, format, and difficulty metadata available to the application.
2. If a suitable saved test is available and not previously attempted by the student, use it. If no suitable unattempted test is available, generate a new test.
3. Validate the generated output against this document and the live `TestsData` schema before saving it.
4. Use the repository's `TestId` rules and check collisions against the live table immediately before insertion. Do not overwrite an existing TestId.
5. Store student responses and results in `TestAttempts`; do not use browser-local storage for persistent attempt selection or history.
6. For TestRooms, accept MCQ tests only, with the agreed native 2D answer grid aligned to participant order and question order.

## 7. Reference-sample policy for this repository

The files under `Questions/TestsData` are not a full production question bank. Retain only a small set of representative examples for future schema/generation reference (roughly 10% or fewer of the generated variants), including examples of:

- MCQs with four options and zero-based answer indices;
- theory questions with 1-, 4-, and 8-mark rubrics;
- Mid 1 first-half syllabus scope;
- ESE/full-syllabus theory structure where ESE exists;
- code-writing, code-tracing, or debugging in a syllabus-supported programming subject;
- difficulty metadata, subject/exam mapping, and any known reuse/QA caveats.

Mark retained question content as **reference samples, not an approved production bank** unless each test has actually passed subject-matter review. Do not describe structural JSON checks as academic approval. Do not retain bulk generated tests only to make old file counts appear complete; update manifests, indexes, and staged SQL to match the retained sample set. Keep one coherent source of truth and avoid duplicated full question payloads.
