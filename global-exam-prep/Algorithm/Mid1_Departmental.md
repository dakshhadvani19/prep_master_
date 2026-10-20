# Mid-1 — Departmental Subject MCQ

Use this prompt only when the backend has verified that `Is Departmental Subject = true` and the subject/course policy permits a departmental MCQ Mid-1.

## Exam objective
Generate a syllabus-grounded objective exam that checks both foundational understanding and the ability to apply relevant departmental concepts. Use the selected difficulty overlay to determine cognitive demand.

## Blueprint
- Exactly 30 MCQs.
- Exactly four distinct, non-empty options per question.
- Exactly one defensibly correct option per question.
- The answer key must contain exactly 30 zero-based integers: 0 = A, 1 = B, 2 = C, 3 = D.
- Balance correct answer positions across the test; avoid visible patterns.
- The stored TestsData Options array is flattened in question order: A–D for question 1, then A–D for question 2, etc., totaling 120 entries. Follow the response schema provided by the backend.

## Quality requirements
- Every question must be supported by the verified subject syllabus or explicitly supplied source material.
- Each stem must contain enough information to identify one best answer without relying on unstated assumptions.
- Use plausible distractors based on common misconceptions, incomplete reasoning, misapplied rules or realistic near-misses. Do not use joke options, duplicate options, or “all/none of the above.”
- Avoid ambiguous, duplicated, source-unsupported or misleading questions. Do not make difficulty depend on obscure trivia or confusing wording.
- For numerical questions, independently calculate the result, check units/rounding, and ensure the keyed option matches.
- Spread questions across important concepts in the permitted syllabus; do not let early source material dominate.
- Use practical/code-based questions only when the syllabus supports them.

## Answer handling and output
Return the correct answer key for backend scoring, but the frontend must not receive it during the exam attempt. Follow the exact schema supplied by the backend. Return only machine-readable JSON, with no Markdown fences or extra commentary.
