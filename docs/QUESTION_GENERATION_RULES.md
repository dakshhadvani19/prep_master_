# PrepMaster Question Generation Rules

**Purpose:** Define a repeatable quality standard for exam-oriented MCQ and theory generation. These are generation and review rules, not a claim that the current generator already enforces every rule.

**Scope reviewed:** Current question-generation flow in `global-exam-prep/src/utils/geminiQuestions.js`, templates in `global-exam-prep/src/data/universitySyllabus.js`, exam integration in `global-exam-prep/src/pages/ExamPortal.jsx`, and current project notes. Update this document if the question schema, exam blueprint, or source-of-truth rules change.

## 1. Core objective

Generate questions that measure whether a student understands and can use the syllabus—not merely whether the student recognizes a memorized sentence. Questions should resemble credible university, diploma, degree, and competitive-exam questions at the correct level.

Every question must be:

1. **Syllabus-aligned:** Tests a concept or learning outcome supported by the verified source for the selected subject.
2. **Exam-valid:** Has a clear task, appropriate difficulty, and one defensible expected answer for a single-answer MCQ.
3. **Substantive:** Tests knowledge, interpretation, application, calculation, diagnosis, comparison, or judgment—not wording tricks alone.
4. **Fair:** Distractors can be tempting, but the stem and conditions must make the best answer determinable.
5. **Verifiable:** The answer key and rationale can be checked against subject material, calculations, rules, or a supplied scenario.
6. **Non-duplicative:** Does not repeat an existing question in lightly reworded form within the same test.
7. **Appropriately challenging:** Difficulty comes from the concept, reasoning steps, application, constraints, and distractors—not missing information or ambiguous grammar.

A question may be challenging or intentionally misconception-sensitive, but it must never be confusing because it is poorly written.

## 2. Source-of-truth and syllabus grounding

### 2.1 Allowed knowledge

- Use the selected subject's verified syllabus, textbook/PDF content, notes, approved question bank, or clearly supplied scenario as the primary basis.
- Use general domain knowledge to formulate a clear explanation or realistic example only when it does not contradict the provided material and the fact is reliable for that subject.
- Keep external assumptions out of questions that claim to assess only the supplied source. If the test is explicitly source-comprehension based, answers must be judged from that source.
- Do not fabricate definitions, laws, formulas, algorithm properties, historical facts, standards, course-specific claims, or syllabus coverage.
- Do not assume that a syllabus file named for a subject actually matches the selected subject. Validate the course, subject ID/code, title, semester, and source mapping first.
- When source content is uncertain, conflicting, truncated, or too low-quality to support a question, skip that content or flag it for review. Do not fill the gap with an invented fact.

### 2.2 Topic coverage before generation

First build an internal topic/learning-outcome map from the available source:

- Identify units, important concepts, stated outcomes, formulas, methods, examples, and constraints.
- Estimate importance using the course outcome, source emphasis, any verified official exam blueprint/unit weightage, recurrence in approved material, and prerequisite value.
- When an official university/board blueprint or unit weightage is available, use it as the **main distribution anchor**, not as an inflexible exact quota. Small deviations are acceptable for variation, question quality, source coverage, and test length; avoid large deviations that make the set feel unlike the actual exam.
- When no official weightage is available, use a balanced, explicitly labelled provisional blueprint. Never describe an invented distribution as official.
- Cover the important concepts across the full relevant material. Do not generate most of a test from whichever topic happens to appear first in the text.
- Allocate questions across distinct topics and learning outcomes. Do not over-sample one easy concept just because it is easy for the model to phrase.

**Source-window warning:** The current `geminiQuestions.js` implementation truncates input after 6,000 characters. If source material is longer, do not treat only the visible beginning as the complete syllabus. The future generation workflow should chunk or summarize the source with traceable topic coverage, or state the limitation and avoid making “not mentioned” questions from text that was never supplied to the model.

## 3. MCQ rules

### 3.1 Required baseline format

- Default to **four distinct options (A–D) and exactly one best answer**.
- The current frontend expects `options` as four strings and `answer` as a zero-based integer: `0=A`, `1=B`, `2=C`, `3=D`.
- Do not silently change this payload format during later implementation without updating the generator, exam UI, scoring, validation, and tests together.
- Each option must be plausible and relevant to the stem. Avoid duplicate options, obvious joke options, empty options, placeholder text, and choices that differ only in superficial wording.
- The stem must ask one specific question or set one well-defined task. Include necessary assumptions, units, rounding requirements, input conditions, diagrams/data descriptions, and version/standard information where relevant.
- A competent student should be able to understand the task before reading the options (the “cover the options” test).
- For numerical MCQs, independently solve the problem, verify units and rounding, and confirm the keyed option matches the computed result exactly within the stated tolerance.

### 3.2 Use sophisticated distractors without making the item ambiguous

Wrong answers should represent recognizable errors in understanding. Select distractor types that fit the topic:

1. **Common misconception:** A frequent but incorrect belief, rule, formula, or interpretation.
2. **Partially correct / incomplete:** A statement that is true in a narrower context but fails a condition in the actual stem, leaves out a required step, or does not fully answer the question.
3. **Near-miss:** A similar concept, operation, formula, syntax, or method that would work under different conditions.
4. **Wrong step or calculation:** A plausible result from a sign error, unit conversion error, off-by-one error, incorrect formula, or invalid intermediate step.
5. **Misapplied rule:** A legitimate rule applied outside its assumptions or in the wrong order.
6. **True but irrelevant:** A fact from the same subject that does not answer the actual question.
7. **Boundary/edge-case failure:** An answer that overlooks an explicitly relevant limit, precondition, exception, or special case.
8. **Source mismatch:** A statement that sounds reasonable but conflicts with, or is not supported by, the bounded source specified by the question.

Use distractors that a student with a real, diagnosable misconception might select. Do not construct distractors by merely adding random technical words or making all wrong options absurd.

**Partial truth rule:** A partially correct option is acceptable only when it is clearly insufficient or incorrect under the exact conditions in the question. If two options could reasonably be defended as correct, rewrite the stem or options. Do not depend on unstated examiner intent to separate them.

**“Confusing” rule:** Create productive cognitive difficulty by comparing similar concepts, conditions, exceptions, assumptions, or outcomes. Never rely on unclear grammar, double negatives, hidden assumptions, irrelevant verbosity, misleading punctuation, or an underspecified scenario.

### 3.3 Surface-plausible, off-topic distractors and negative stems

The requested extra confusion technique is primarily an **option-writing technique**, not the same thing as a question asking “which fact is not mentioned?”

- **Surface-plausible off-topic distractor:** In a carefully selected MCQ, one distractor may be technically unrelated to the exact concept being tested while sounding superficially relevant because it shares vocabulary, a neighbouring topic, a familiar method, or the scenario's context. It should briefly tempt a student who reads too quickly or confuses adjacent concepts, then be clearly irrelevant to the actual task when examined carefully.
- Use this technique **selectively**, not as a mandatory option in every MCQ. Prefer three meaningful, topic-grounded distractors and add one superficially relevant but non-responsive distractor where it improves the question. Avoid a completely random or absurd option: it makes the answer obvious rather than testing understanding.
- The stem must contain enough context to show why the off-topic option does not answer the question. Never make the answer depend on hidden examiner intent, wordplay, or a vague relationship between concepts.
- **Partially correct distractor:** May be true in another context or incomplete for the exact task, but it must fail a clearly stated condition.
- **Not true / incorrect:** Ask which statement conflicts with verified facts or the supplied conditions; the keyed choice must be demonstrably incorrect in that context.
- **Except / NOT:** Use negative stems sparingly, make the negative word unmistakable (for example, uppercase `NOT`), and avoid stacking negatives.
- **Source-not-mentioned question:** This is a separate format. Use it only when the task explicitly concerns a specified, complete source. Input truncation, retrieval failure, or a model's lack of knowledge must never be treated as evidence that the source does not mention something.

The objective is productive exam-like discrimination, not confusion caused by unclear writing. A student who carefully applies the concepts and reads the stem should be able to determine one best answer.

### 3.4 “All of the above”, “none of the above”, and multi-select

- Prefer four substantive, independent options over “all of the above” or “none of the above”.
- Avoid “all of the above” when one option's truth or falsity gives away the answer, and avoid “none of the above” when the exam expects a specific factual answer or numerical result.
- If the real assessment requires select-all-that-apply questions, define that as a different item type with an explicit scoring and answer representation. Do not encode multiple correct answers into the current single-index MCQ format.
- If a deliberately designed combination option (for example, “A and C only”) is essential, ensure the individual statements are unambiguous and that exactly one combination is correct. Use sparingly.

### 3.5 Option-writing and answer-key integrity

- Keep options grammatically parallel and similar in specificity and approximate length; avoid making the correct option conspicuously longer or more precise.
- Randomize the position of the correct option across a complete test. Do not create an easily detectable answer pattern or repeatedly use the same index.
- Keep distractors mutually distinguishable. Avoid overlapping ranges, equivalent wording, two options that are both valid implementations, or choices that could be true under different reasonable interpretations of the stem.
- Avoid unsupported absolute language such as “always” or “never” unless it is genuinely part of the rule being tested.
- Avoid clues from grammar, article usage, singular/plural mismatch, repeated stem wording, formatting, or option length.
- Validate the correct answer independently before accepting the question. A model-supplied answer index is not evidence that its answer is correct.
- For every accepted MCQ, generate or internally derive an explanation for why the keyed answer is correct and why each distractor is wrong under the stem's conditions. These explanations are quality-control data even if the exam UI does not show them yet.
- If more than one option is correct, no option is defensible, or the answer cannot be verified, reject and regenerate the item. Never quietly fix a failed item by assigning answer index zero.

## 4. Difficulty calibration

Difficulty describes the reasoning a question demands, not merely obscure vocabulary or a long stem. The selected level should be consistent across all questions in that test set, with reasonable variation within the level.

### Easy — foundational but still meaningful

- Focus on the most important concepts, core definitions, basic principles, key formulas, standard uses, and simple interpretation.
- Mostly test accurate understanding and one-step application; direct questions are acceptable when the knowledge is fundamental.
- Avoid excessively obvious options, trivial wording-only questions, and “giveaway” distractors.
- Include a few simple examples or short scenarios so “easy” does not mean pure rote recall throughout.
- Distractors can represent basic misconceptions but should not require advanced assumptions.

Suggested planning mix when no official blueprint exists: about 40% core understanding, 40% one-step application, and 20% basic scenario/interpretation. Adjust to the subject and official learning outcomes.

### Medium — application, near-misses, and discrimination

- Require the student to apply a concept, choose a method, interpret results, compare closely related ideas, or follow two linked reasoning steps.
- Use credible misconception-based and partially correct distractors. Make the condition that distinguishes the best answer explicit.
- Include short practical situations, data interpretation, moderate calculations, code/output tracing, cause-and-effect, or “which conclusion follows?” questions where suitable.
- Test prerequisites only when they are needed to solve a subject-specific problem.
- Avoid making every item a complicated exception question; the student should be demonstrating understanding, not guessing the author's intention.

Suggested planning mix: about 15% essential concept checks, 45% application, 30% analysis/comparison, and up to 10% carefully designed edge-case or source-boundary items where relevant.

### Hard — layered reasoning, constraints, and edge cases

- Emphasize multi-step problems, unfamiliar but syllabus-valid scenarios, design choices, diagnosis, debugging, boundary conditions, competing constraints, and evaluation of plausible alternatives.
- Make distractors individually credible. The student should have to identify the decisive condition, invalid assumption, wrong method, hidden limitation stated in the prompt, or consequence of a choice.
- Combine concepts only when the syllabus supports the connection and the question gives any needed prerequisite facts.
- For numerical/technical items, require several meaningful reasoning steps or a non-obvious method selection—not arithmetic bulk alone.
- Include “most appropriate” or “best justified” questions only when the criteria for judging the options are stated.
- Hard questions may use partially true, out-of-scope, or subtly misapplied options, but one answer must still be clearly best under the given evidence.
- Do not increase difficulty by using obscure facts outside the syllabus, excessively long prose, missing data, or ambiguous wording.

Suggested planning mix: about 10% prerequisite concept checks, 30% multi-step application, 35% analysis/diagnosis, 20% evaluation/design, and up to 5% source-bounded or edge-case reasoning where appropriate. Subject and official exam requirements take precedence over these provisional proportions.

These percentages are planning guidance, not official exam weightage. If an official university/board blueprint is available, follow that instead.

## 5. Theory / subjective question rules

### 5.1 Assess a task, not just a topic

A theory question should give the student a clear intellectual task and scope. Avoid merely appending “Explain in detail” to every concept. Vary question forms based on the discipline and course outcomes:

- **Explain / illustrate:** Explain a mechanism, principle, or concept and support it with an accurate example, diagram, or interpretation.
- **Apply / calculate:** Apply a specified rule or formula to a concrete case, dataset, circuit, program, process, or business situation.
- **Implement / construct:** Write an algorithm, pseudocode, code, SQL, workflow, circuit/process design, or procedural solution when appropriate for the subject.
- **Differentiate / compare:** Compare items using explicit dimensions such as assumptions, behavior, complexity, cost, accuracy, use cases, limitations, or outcomes. Avoid questions where a list of unrelated facts would suffice.
- **Analyze / trace:** Trace a process, infer why an outcome occurred, interpret output/data, decompose a system, or establish cause and effect.
- **Debug / diagnose:** Find the error in a short code snippet, calculation, configuration, process, design, or scenario; explain why it is wrong and show a correction.
- **Evaluate / justify:** Evaluate alternatives against stated criteria and justify the conclusion with evidence, trade-offs, constraints, or calculations.
- **Design / propose:** Design a solution to a realistic problem, state assumptions, show major steps, and explain why the solution meets requirements.
- **Optimize / improve:** Identify a bottleneck or weakness, propose an improvement, and reason about its effect, cost, limitations, and side effects.
- **Interpret / recommend:** Read supplied data, a diagram description, a case, results, or a log; reach a conclusion and recommend a justified next action.

Use command verbs deliberately. “Evaluate” must invite a reasoned judgment; “implement” must require a working method or procedure; “differentiate” must ask for dimensions of comparison. Do not use a higher-level verb for a recall-only task.

### 5.2 Cognitive taxonomy

Map questions to the appropriate level of Bloom's revised taxonomy and the subject's course outcomes (COs), when those outcomes are available:

1. **Remember:** Recall facts, terms, or steps. Primarily appropriate for foundational easy checks.
2. **Understand:** Explain meaning, summarize a process, classify an example, or interpret a concept.
3. **Apply:** Use knowledge in a specific case, execute a method, calculate, or implement a known process.
4. **Analyze:** Break down a problem, compare evidence, trace behavior, find causes, or identify a failure.
5. **Evaluate:** Judge alternatives against criteria, verify a claim, critique a solution, or justify a decision.
6. **Create:** Design, construct, propose, or synthesize a valid solution within the subject's requirements.

Medium questions should generally require Apply and include some Analyze. Hard theory questions should emphasize Analyze, Evaluate, and Create when suitable for the course outcomes. Do not artificially force Create/Evaluate into a topic whose outcomes are foundational or procedural. Taxonomy labels are not a substitute for a well-formed, assessable question.

### 5.3 Practical and real-life relevance

- Prefer realistic applications that professionals or students may actually encounter: troubleshooting, selecting a method/tool, reading a result, meeting requirements, balancing constraints, interpreting measurements, debugging, or explaining a real system.
- Use the context because it improves assessment, not merely to decorate a question with a story.
- Provide enough data, definitions, constraints, units, diagrams, starter code, or assumptions to solve the problem.
- Keep the scenario faithful to what a learner at that course level is expected to know. Explain any unfamiliar domain detail needed for the task.
- For abstract subjects, practical relevance may mean applying a proof technique, interpreting a mathematical model, comparing theories, or identifying the correct reasoning—not inventing an artificial business scenario.
- For programming/IT topics, include code/output tracing, bug fixing, algorithm choice, complexity, database queries, architecture trade-offs, security constraints, and realistic failure cases when supported by the syllabus.
- For engineering topics, use units, tolerances, assumptions, physical conditions, design limits, fault diagnosis, and calculation verification as relevant.
- For science/pharmacy/health topics, keep claims within reliable source material and course level; do not invent clinical recommendations or safety-critical values.
- For management, commerce, law, arts, or social sciences, use appropriate case analysis, evidence interpretation, competing arguments, application of frameworks, and justified recommendations.

### 5.4 Marks, expected scope, and answerability

- The mark value must match the amount and depth of work requested. A 7-mark question should not require an entire project; a 14-mark question should not be answerable with one definition.
- For a multi-part prompt, make part labels and mark allocations explicit where the exam blueprint requires them.
- Include all assumptions needed to produce a fair answer. If a real-world problem lacks a necessary fact, either provide it or explicitly ask students to identify the missing information.
- Internally define the expected answer elements or scoring rubric for each theory item: relevant concepts, key steps, calculations/diagrams/code where required, justification, and acceptable alternatives.
- Require a reasoned justification for recommendations or design choices. Do not score purely on matching a single phrase if equivalent valid methods exist.
- Use the subject's official assessment pattern for marks and time when available. Do not assume the current application's default mark values are official for every course.

## 6. Build a coherent test, not just a bag of questions

Before generating a test, create an internal exam blueprint with:

- Resolved course/subject and verified source.
- Exam type and chosen difficulty.
- Target question count and total marks/time where applicable.
- Topic/unit coverage and importance.
- Question types and cognitive levels.
- Repetition restrictions and any official blueprint requirements.

Within the test:

- Cover multiple important concepts rather than repeatedly asking the same one in different words.
- Vary the skill being assessed (recall, application, calculation, interpretation, comparison, diagnosis, evaluation) according to difficulty and syllabus.
- Keep every question independently understandable unless the test explicitly defines a shared case/stimulus and makes that dependency clear.
- Do not reuse an identical stem with swapped names/numbers as a separate question unless assessing a deliberate variant is the stated goal.
- Do not make a later question reveal the answer to an earlier question.
- Ensure the total marks and number of questions agree with the exam's configured rules.
- Make each new generated test meaningfully distinct from other tests for the same subject where a question bank/reuse history is available.

## 7. Required review and rejection pipeline

Every generated test should pass the following stages before it is presented to a student.

### Gate A — Source and coverage

- Correct active subject resolved.
- Source matches course, subject code/title, and semester where applicable.
- Major relevant topics are covered.
- No claims depend on content absent from the validated source.
- Any input truncation or extraction warning is handled explicitly.

### Gate B — Shape and consistency

For current MCQs:
- Exactly four non-empty, distinct option strings.
- `answer` is an integer in range 0–3.
- Exactly one option is defensibly correct.
- Options correspond to the actual key; no option shuffling without updating the answer index.
- All referenced units, data, code, values, and conditions are included.

For current theory questions:
- The prompt is complete and assessable.
- Marks are present and appropriate to scope.
- Any multi-part request is clearly structured.
- The prompt does not inadvertently ask for the answer itself when the test mode expects the student to respond.

### Gate C — Content validity

- Independently verify the keyed answer and calculations.
- Explain internally why each distractor fails.
- Check definitions, units, code syntax/behavior, formula conditions, exceptions, and assumptions.
- Confirm one-best-answer validity; regenerate if two answers are plausible under the written stem.
- If a source-bounded “not mentioned” question is deliberately included, verify absence against the complete specified source rather than an artifact of clipping/retrieval failure. For off-topic distractors, verify that the option is non-responsive to the stem but superficially plausible—not randomly absurd.

### Gate D — Quality, difficulty, and fairness

- Stem is clear and free of irrelevant detail.
- No grammatical, length, formatting, or answer-position clue reveals the key.
- Distractors are plausible and diagnostically useful.
- Difficulty matches the selected level.
- Question measures the intended course outcome rather than reading trickery.
- No duplicate or near-duplicate item in the same test.
- Scenario, code, calculation, and asked output are consistent.

### Gate E — Final set quality

- Topic coverage and cognitive mix meet the blueprint.
- Easy/medium/hard labels have an observable reason.
- MCQ answer positions are not patterned.
- Questions do not contradict one another or reveal other answers.
- The final count and marks are correct.

**Reject rather than patch:** If an item fails validation, regenerate or discard it. Do not fill missing choices with generic options such as “True”, “False”, “None of the above”, or “All of the above” just to reach four choices. Do not silently default a missing/invalid answer index to option A. The current implementation contains fallback behavior of this kind; the rules here specify the desired quality standard, not a claim that this behavior has already been changed.

## 8. Suggested internal QA metadata

Even if the student-facing JSON remains unchanged, the generation pipeline should eventually retain enough internal information to validate questions. Consider these fields in an internal draft/review representation:

- `topic` or `unit`
- `course_outcome` / `cognitive_level`
- `difficulty`
- `question_style` (for example, misconception, calculation, source-bounded, scenario, debugging)
- `source_anchor` or concise evidence showing which provided content supports the question
- `correct_answer_rationale`
- `distractor_rationales` for MCQs
- `expected_answer_points` / `marking_rubric` for theory
- `validation_status` and any review flag

Treat these as proposed internal QA metadata; they are **not** currently guaranteed by the frontend contract and should not be added to persisted student-facing data until the data structure and consumer code are reviewed.

## 9. Current implementation gaps to remember

The code review found that the current AI prompt already asks for four MCQ options and a zero-based answer index, and theory prompts return open-ended questions. However, it does not yet enforce the full standard described here:

- The prompt's difficulty descriptions are broad and do not fully specify easy/medium/hard behavior.
- Topic coverage and cognitive-level blueprinting are not explicitly enforced.
- Answer keys and each distractor are not independently verified before display.
- Invalid/missing MCQ options may be filled with generic fallback choices; invalid answer indices may default to zero.
- Questions do not currently carry a full source anchor or internal rationale in the normalized return object.
- Theory marks are currently assigned by simple count-based logic, not a validated per-question rubric.
- The 6,000-character source limit risks incomplete coverage for longer material unless upstream code prepares suitable chunks.

Do not assume these gaps are fixed by adding this document. When implementation begins, update prompts, validation, error/retry behavior, tests, and any affected data contract together. Preserve the current exam routes and unrelated protected features.

## 10. Confirmed policy decisions (2026-10-13)

The project owner has confirmed the following target policies. They are requirements for future implementation; the current generator/review UI does not yet enforce all of them.

### 10.1 Answer explanations: review mode only, no database dependency for now

- Do **not** reveal answers, explanations, or marking rubrics during the timed attempt.
- After submission, show the correct MCQ answer with a concise explanation in the existing exam-review flow.
- For each MCQ, retain the verified correct answer and its rationale; retain a brief rationale for each distractor where generated and validated. These explanations are also part of the internal quality-check process, even if only the correct-answer explanation is shown to the student initially.
- For subjective questions, generate a structured marking rubric / expected-answer points so the question can support later manual or AI-assisted evaluation. Do not present a rubric as an automatically awarded score unless an evaluation feature is implemented and validated.
- A database table is **not required for this initial version**. The current app stores exam history in browser-local storage through `src/utils/examHistoryStorage.js`, and `ReviewPage.jsx` reads that snapshot. The future implementation can carry explanation/rubric metadata with the question object during the attempt, then include it in the existing local history snapshot on submission.
- This approach supports review in the same browser/profile while the local history remains available. It does **not** provide cross-device sync or server-side backup; clearing browser storage, using another browser/device, or losing the local record can remove the explanation along with the review record. The current history store also limits retained records. If durable/cross-device history becomes a requirement, design a Supabase schema later rather than quietly adding a database dependency now.
- Do not add fake or generic explanations to fill missing metadata. If an explanation or rubric is required but generation/validation fails, regenerate the item or exclude the unsupported metadata/question.

### 10.2 Official exam blueprint: preserve the real-exam feel

- Use verified university/board patterns and unit weightages as the main anchor when available, but allow modest deviations so generated sets have useful topic variety and do not become mechanically repetitive.
- Do not diverge so much that the distribution of units, question types, difficulty, or cognitive demand stops resembling the target examination.
- When the source provides no official blueprint, use a provisional distribution and do not label it official. The suggested percentage mixes earlier in this document are starting heuristics, not fixed requirements.

### 10.3 Confusing options: include a selective, superficially relevant off-topic distractor

- The owner's “not mentioned” clarification means a distractor option that is not actually responsive to the question but initially looks plausible—not necessarily a stem asking what a source does not mention.
- Apply this selectively, especially where it tests quick reading or confusion between neighbouring concepts. Avoid random, absurd, or obviously unrelated choices.
- The option must be clearly non-responsive under the exact stem, so there remains only one defensible correct answer. Keep this distinct from “partially correct,” “not true,” and source-bounded “not mentioned” question formats.

### 10.4 Theory marking rubrics

- Include a structured marking rubric / key expected answer points for every generated subjective question as target internal metadata.
- Rubrics should scale to the marks and task verb (for example, explain, implement, differentiate, analyze, evaluate, design). Include valid steps, evidence/calculations/code/diagrams where relevant, and acceptable alternatives where appropriate.
- Store the rubric in the same browser-local history snapshot for review in the initial version if it is needed after submission; no database write is needed for this phase.
- Keep the rubric hidden while the timed exam is active. Showing it or a model answer is a post-submission review behavior, not an in-exam hint.

Do not claim the confirmed behavior is live until implementation, validation, and relevant tests are completed.
