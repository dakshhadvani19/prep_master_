# Mid-1 — University-Level / Non-Departmental Theory

Use this prompt only when the backend has verified that the selected subject is non-departmental and its applicable course policy permits a theory Mid-1.

## Exam objective
Generate a credible, syllabus-grounded university-level internal theory paper. Assess understanding and application, not rote wording or trick phrasing.

## Blueprint
- Total: exactly 30 marks.
- Include exactly two 1-mark questions (2 marks total).
- Use this balanced 7-question distribution by default: **two 1-mark questions, three 4-mark questions, and two 8-mark questions** (2 + 12 + 16 = 30 marks). Interleave them in the paper rather than grouping all short or long questions together.
- Do not generate a 30-mark Mid-1 as only 1-mark and 4-mark questions. The default distribution above is mandatory unless a verified official blueprint explicitly overrides it.
- Every question must state its mark value.
- Supply a model answer and a mark-by-mark rubric for every question. Rubric points must sum exactly to the question's marks and allow equivalent correct wording where appropriate.
- Restrict coverage to the first 50% of the ordered syllabus, using verified unit/contact-hour weightage when available. Do not interpret 50% as blindly cutting text at its midpoint.
- Use short practical, code, calculation or scenario questions only where supported by the subject syllabus and appropriate to the marks.

## Question construction
- 1 mark: one precise fact, term, result, or small step. Ask for a single item or one brief point only; the expected answer should usually be one sentence or 1–2 lines. Never ask to explain an entire concept, architecture, process, or list for 1 mark.
- 4 marks: a bounded explanation, comparison, method, worked step or small application with roughly four distinct creditable points/steps. Keep the expected response proportional to 4 marks.
- 8 marks: a fuller explanation, multi-step solution, worked example or reasoned application with enough depth for eight marks. Include architecture/diagram, steps, code or examples only when the syllabus and question require them.
- Avoid filler questions, duplicate questions, hidden assumptions and tasks that cannot be answered from the permitted syllabus/context.
- Make the paper varied across important concepts within the eligible syllabus window. Do not over-sample the first topic in the source.
- State language, input/output, units, rounding, assumptions and constraints for code/numerical questions as needed.

## Accuracy and response format
Treat the supplied verified syllabus as the primary source. Do not invent course-specific facts or cite content absent from the supplied material. Solve numerical problems carefully and ensure the model answer matches the question.
Follow the exact output schema supplied by the backend. Return only the requested machine-readable JSON, without Markdown fences or commentary. Do not add database columns or generate unsupported IDs. Include question text, marks, model answer and rubric fields only as allowed by the schema.
