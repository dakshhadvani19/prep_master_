# PrepMaster Theory Question Generation Guide

**Purpose:** A reusable, model-ready specification for Groq (or another LLM) to generate realistic college examination theory papers. This document complements `docs/QUESTION_GENERATION_RULES.md` and `docs/EXAM_FORMAT_AND_MARKING_RULES.md`; it does not override authoritative subject metadata, syllabus sources, the database contract, or official exam blueprints.

## 1. Resolve the exam before writing questions

Before generation, establish:
- Course/department, semester, exact subject title and canonical SubjectId.
- The live `Subjects.isDepartmentalSubject` value and whether the requested exam type is permitted.
- The authoritative syllabus and its ordered units/topics, contact hours/weightage, and any official exam blueprint.
- Exam type (Mid 1 theory or ESE theory), total marks, difficulty, language, and any approved institution-specific exceptions.
- Whether the subject is programming/practical-capable based on the syllabus.

If a required source is missing, mappings conflict, the subject is non-examinable, or the blueprint cannot be satisfied, stop and report the exact missing/conflicting information. Never invent a syllabus, exam type, weightage, or policy.

## 2. Fixed paper structure

### MCQ exams (for completeness)
- Exactly 30 questions, each worth 1 mark (30 marks total).
- Four options per question; exactly one defensible correct answer.
- Canonical export: 30 question strings, 120 flattened option strings in A–D order, and 30 zero-based answer indexes (0=A, 1=B, 2=C, 3=D).

### Theory Mid 1 — 30 marks
- Exactly two 1-mark questions (2 marks).
- The remaining 28 marks must be composed of 4-mark and 8-mark questions.
- Valid structures include: 7 × 4-mark questions; 5 × 4-mark + 1 × 8-mark; 3 × 4-mark + 2 × 8-mark; or 1 × 4-mark + 3 × 8-mark.
- Use only the first 50% of the ordered syllabus, applying verified unit/contact-hour weighting when available.
- Total must equal exactly 30 marks. Do not add unmarked subparts or silently change a question's marks.

### Theory ESE — 60 marks
- Exactly two 1-mark questions (2 marks).
- Include one 2-mark question to resolve the arithmetic constraint, unless an official approved blueprint explicitly specifies another valid structure.
- The remaining 56 marks must use 4-mark and 8-mark questions. Examples: 7 × 8-mark; or 9 × 4-mark + 2 × 8-mark.
- Cover the full relevant syllabus unless an authoritative blueprint narrows it.
- If the official blueprint forbids a 2-mark question, flag the conflict and ask for an approved alternative; do not output a paper with the wrong total.

## 3. What good college theory questions should test

Choose question styles according to the subject and syllabus. Build a balanced paper, not a paper made from one repeated template.

- **Core concepts and definitions:** precise terms, purpose, principles, components, assumptions and limitations.
- **Explain/describe:** explain a mechanism, process, workflow, architecture or sequence in a bounded scope.
- **Differentiate/compare:** compare named concepts using relevant dimensions; avoid vague “write differences” prompts without enough scope.
- **Architecture and diagrams:** draw and label a relevant architecture, block diagram, flowchart, ER/UML/network diagram or system layout, then explain the important parts and data/control flow. Ask for diagrams only when the syllabus supports them.
- **Applications and case studies:** select a suitable method/technology for a concrete scenario and justify the choice using stated requirements.
- **Advantages, disadvantages and limitations:** require subject-specific points, not generic filler.
- **Procedures and algorithms:** give ordered steps, pseudocode, trace tables, complexity or intermediate results when relevant.
- **Numericals and derivations:** state all data, units, assumptions, rounding and expected result format. Independently verify calculations.
- **Testing, debugging and troubleshooting:** identify a fault from supplied evidence, explain the cause, and propose a justified correction.
- **Design and reasoning:** ask students to select or design a small solution under explicit constraints and explain trade-offs.
- **Security, reliability, performance, ethics or safety:** include only where relevant to the syllabus and level.

Avoid asking the same fact several times with slightly different wording. Cover distinct syllabus outcomes and mix recall with understanding, application and reasoning.

## 4. Coding-capable subjects

When the verified syllabus includes programming, SQL, scripting, markup, algorithms or practical implementation, include a reasonable mix of code-based theory questions. These should resemble college practicals and written examinations—not lengthy projects.

Suitable forms:
- Write a short program, function, SQL query or code fragment for a clearly specified task.
- Predict output or trace a short snippet.
- Find and correct a bug; explain why the original code fails.
- Complete a missing statement or algorithm step.
- Explain a code segment, data structure, API, design decision or algorithm.
- Implement a small syllabus-relevant operation using standard language features.
- Draw/explain a system or software architecture and show how components interact.

Coding-question requirements:
- State the language, input, expected output, constraints and relevant assumptions.
- Keep implementation bounded: normally a short function or focused snippet, suitable for the stated marks and a college exam.
- Do not request a complete application, large project, extensive boilerplate or environment-dependent setup in a 4- or 8-mark question.
- Use only APIs, language features and concepts consistent with the course level/syllabus.
- Supply a correct reference solution and a partial-credit rubric. Award credit for correct logic and required functionality, not only exact formatting.
- If output is requested, execute or carefully trace it independently. Check edge cases and syntax.
- Never force code questions into a non-programming subject.

## 5. Marks, answer length and marking rubrics

Every theory question must show its mark value in the question string, for example `[4 marks]` or `[8 marks]`. Model answers belong in the corresponding `Answers` entry.

- **1 mark:** one precise fact, term, purpose or small result. Answer in one concise point.
- **2 marks:** two distinct creditable points, or a short correct result plus its essential reason.
- **4 marks:** a bounded explanation, comparison, small diagram, worked step, short code task or application. Rubric points must add to exactly four.
- **8 marks:** a fuller explanation, labelled diagram plus explanation, multi-step numerical/algorithm, short implementation, or reasoned scenario. Rubric points must add to exactly eight.

For each answer/rubric:
- State the expected key points, steps, labels, formula/substitution/result, code behavior or other evidence that earns credit.
- Allocate marks explicitly; the subtotals must equal the question's stated marks.
- Accept technically correct equivalent wording and valid alternative approaches.
- Do not award marks for repetition, irrelevant content or unsupported claims.
- Keep the answer proportional to the marks; do not demand an essay or a long code implementation for a small-mark question.
- Include units, intermediate steps, diagram labels or code explanation where needed for credit.

## 6. Quality and difficulty

- **Easy:** direct understanding or one straightforward application.
- **Medium:** explain, compare, interpret, or apply a concept with meaningful reasoning.
- **Hard:** integrate multiple syllabus concepts, analyze a non-trivial scenario, debug, design under constraints, or justify trade-offs.
- Difficulty must come from the required knowledge and reasoning, not ambiguous language, obscure trivia, or excessive length.
- Use clear command verbs and define the scope. A student should know exactly what deliverable is expected.
- Do not duplicate a question within a paper or create superficial paraphrases across variants.
- Avoid unsupported facts, unstated assumptions, misleading premises, overly broad prompts and subjective questions without criteria.
- Keep Mid 1 strictly within its verified first-half scope.
- Distribute questions across syllabus topics according to official weightage where available; otherwise use a balanced provisional distribution and do not call it official.

## 7. Required generation workflow

1. **Resolve context:** validate subject, SubjectId, exam eligibility, syllabus source and requested paper.
2. **Map syllabus:** list units/topics/outcomes and relevant weightage before drafting.
3. **Plan marks:** create a blueprint whose question counts and marks sum exactly to the required total.
4. **Allocate coverage:** map each planned question to one primary topic/outcome; add secondary topics only where integration is meaningful.
5. **Draft questions:** vary command verbs and question types while staying within syllabus and course level.
6. **Write model answers:** produce concise, technically correct answers with per-question marking points and mark allocations.
7. **Independently verify:** check code, calculations, diagrams/labels, terminology, assumptions, and factual claims against source material.
8. **Run structural checks:** validate number of questions, marks, format, answer count, options, and metadata.
9. **Check duplication and coverage:** remove near-duplicates and ensure major syllabus outcomes are represented.
10. **Report uncertainty:** list missing syllabus material, unresolved blueprint conflicts and items requiring subject-expert review. Never conceal uncertainty.

## 8. Canonical repository payload contract

Use the existing `exam-bank-v2.json` plus `test_index` metadata contract and preserve all required source, course, subject, semester, exam type, difficulty, format and syllabus-scope metadata.

- Each test row retains the supported `TestId`, `Questions`, `Options`, and `Answers` fields.
- Theory: `Questions` contains the marked question strings; `Options` is an empty array; `Answers` contains one matching model-answer/rubric string per question.
- MCQ: 30 questions, 120 flattened options, 30 zero-based answer indexes.
- Keep metadata in the canonical index/manifest, not in unsupported database columns.
- Check all existing banks and indexes before assigning TestIds. Never reuse an ID for different content.
- Do not overwrite canonical banks or remove source/seed artifacts until the replacement is validated and the retention scope is explicit.
- Structural validation does not equal academic certification. Report these separately.

## 9. Recommended model output before saving

For theory, draft an internal review table with:
- Question number and marks
- Primary syllabus topic and any secondary topic
- Cognitive task (recall, explain, compare, apply, analyze, design, code, debug)
- Question text
- Model answer
- Mark-by-mark rubric
- Source/topic evidence
- Validation notes

Then serialize into the repository's canonical schema only after all checks pass. Do not place hidden reasoning or internal chain-of-thought in the output; provide concise verification notes and evidence instead.
