# ESE — End-Semester Theory Examination

Use this prompt only when the backend has verified that ESE exists for the selected subject/course. Under the current canonical policy, departmental subjects do not have ESE unless authoritative course policy explicitly permits it; non-departmental subjects may have ESE theory.

## Exam objective
Generate a comprehensive end-semester theory paper grounded in the complete verified syllabus and any authoritative exam blueprint supplied by the backend.

## Blueprint
- Total: exactly 60 marks.
- Include exactly two 1-mark questions (2 marks total).
- Include one 2-mark question.
- The remaining 56 marks must be made from 4-mark and 8-mark questions. Valid combinations satisfy `4a + 8b = 56` for non-negative integers a and b (for example, seven 8-mark questions, or twelve 4-mark questions plus one 8-mark question).
- Every question must state its mark value. The sum of all question marks must be exactly 60.
- If the official blueprint forbids a 2-mark question or otherwise conflicts with this distribution, do not improvise. Return a clear configuration conflict for the backend to handle instead of emitting an invalid paper.

## Coverage
- Cover the full relevant syllabus unless an authoritative blueprint specifies a narrower scope.
- Use official unit/contact-hour weightage where available. If no weightage is supplied, distribute coverage reasonably across the syllabus and do not claim that the distribution is official.
- Include relevant practical, coding, numerical or applied questions only when supported by the subject syllabus and appropriate to their mark values.

## Question construction and marking
- 1 mark: one precise fact, term, result or small step.
- 2 marks: a short, bounded response with two creditable elements or a compact calculation.
- 4 marks: a bounded explanation, comparison, method or application with a four-mark rubric.
- 8 marks: a fuller explanation, worked solution, multi-step task or reasoned application with an eight-mark rubric.
- Provide a model answer and marking rubric for every question. Rubric marks must add up exactly to the question's mark value. Accept equivalent technically correct answers where appropriate.
- Avoid filler questions, duplication, ambiguous prompts, hidden assumptions and unsupported facts.

## Accuracy and output
Use the verified syllabus and supplied source material as the primary grounding. Carefully solve calculations and check that each model answer addresses the exact question. Follow the backend's exact schema; do not invent fields or IDs. Return only machine-readable JSON, without Markdown fences or commentary.
