/**
 * examValidation.js — Validation of AI-generated exam output before it reaches
 * the student. Strips internal review metadata from MCQ questions.
 *
 * Rules (from FINAL_PROMPT_TEMPLATE.md / examPrompts.js):
 * - Mid-1 theory: mark sequence [1, 1, 4, 8, 4, 8, 4], total 30M.
 * - Mid-2 MCQ: exactly 30 questions; four distinct options; exactly one correct answer (index 0-3).
 * - ESE theory: mark sequence [1, 1, 2, 4, 8, 4, 8, 4, 8, 4, 8, 4, 4], total 60M.
 * - Coverage spans in-scope chapters. Semantic quality and duplication are instructed in the generation prompt,
 *   not used as hard rejection gates.
 */

/**
 * Validation result shape.
 * @typedef {object} ValidationResult
 * @property {boolean} valid
 * @property {string[]} errors
 * @property {string[]} warnings
 * @property {object} stats { questionCount, totalMarks, mcqCount, theoryCount }
 */

const THEORY_ANSWER_FORMATS = new Set(['points', 'comparison', 'worked_solution', 'code', 'diagram']);
const MAX_RUBRIC_ITEMS_BY_MARKS = { 1: 1, 2: 2, 4: 6, 8: 12 };

/**
 * Validate the model answer and its mark-by-mark rubric for one theory question.
 * This shared contract is used both immediately after Groq generation and again
 * when the complete exam is validated before it is saved.
 */
export function validateTheoryAnswerPayload(question) {
    const errors = [];
    const id = question?.id || 'unknown';
    const marks = question?.marks;

    if (!Number.isInteger(marks) || ![1, 2, 4, 8].includes(marks)) {
        errors.push(`subjective_${id}:invalid_theory_marks_for_rubric`);
    }
    if (typeof question?.answer !== 'string' || !question.answer.trim()) {
        errors.push(`subjective_${id}:missing_model_answer`);
    } else if (question.answer.length > 6000) {
        errors.push(`subjective_${id}:model_answer_too_long`);
    }
    if (!THEORY_ANSWER_FORMATS.has(question?.answerFormat)) {
        errors.push(`subjective_${id}:invalid_answer_format`);
    }

    const rubric = question?.rubric;
    if (!Array.isArray(rubric) || rubric.length < 1) {
        errors.push(`subjective_${id}:missing_marking_rubric`);
        return { valid: false, errors };
    }

    const maxItems = MAX_RUBRIC_ITEMS_BY_MARKS[marks] ?? 12;
    if (rubric.length > maxItems) {
        errors.push(`subjective_${id}:rubric_exceeds_${maxItems}_criteria`);
    }

    let rubricTotal = 0;
    rubric.forEach((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            errors.push(`subjective_${id}:rubric_item_${index + 1}_invalid`);
            return;
        }
        if (typeof item.criterion !== 'string' || !item.criterion.trim()) {
            errors.push(`subjective_${id}:rubric_item_${index + 1}_missing_criterion`);
        }
        if (typeof item.marks !== 'number' || !Number.isFinite(item.marks) || item.marks <= 0
            || Math.abs(item.marks * 2 - Math.round(item.marks * 2)) > 1e-9) {
            errors.push(`subjective_${id}:rubric_item_${index + 1}_invalid_mark_allocation`);
        } else {
            rubricTotal += item.marks;
        }
        if (!Array.isArray(item.keyPoints) || item.keyPoints.length < 1 || item.keyPoints.length > 4
            || item.keyPoints.some(point => typeof point !== 'string' || !point.trim())) {
            errors.push(`subjective_${id}:rubric_item_${index + 1}_invalid_key_points`);
        }
        if (item.acceptedAlternatives !== undefined && (
            !Array.isArray(item.acceptedAlternatives)
            || item.acceptedAlternatives.length > 4
            || item.acceptedAlternatives.some(value => typeof value !== 'string' || !value.trim())
        )) {
            errors.push(`subjective_${id}:rubric_item_${index + 1}_invalid_accepted_alternatives`);
        }
    });

    if (Number.isInteger(marks) && Math.abs(rubricTotal - marks) > 1e-9) {
        errors.push(`subjective_${id}:rubric_total_${rubricTotal}_does_not_equal_${marks}`);
    }

    // A comparison row earns one mark only when both sides express a valid,
    // corresponding difference. An 8M comparison therefore has eight paired rows.
    if (question?.answerFormat === 'comparison') {
        if (![2, 4, 8].includes(marks) || rubric.length !== marks) {
            errors.push(`subjective_${id}:comparison_requires_one_row_per_mark`);
        }
        rubric.forEach((item, index) => {
            if (item?.marks !== 1 || !Array.isArray(item?.keyPoints) || item.keyPoints.length !== 2) {
                errors.push(`subjective_${id}:comparison_row_${index + 1}_must_score_one_mark_for_two_sides`);
            }
        });
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Validate a complete generated exam (all batches combined).
 *
 * @param {Array} questions — raw generated questions
 * @param {object} config — EXAM_CONFIG entry for the exam type
 * @param {object} coveragePlan — from contextFitter
 * @returns {ValidationResult}
 */
export function validateExam(questions, config, coveragePlan) {
    const errors = [];
    const warnings = [];

    if (!Array.isArray(questions)) {
        return { valid: false, errors: ['questions_not_array'], warnings, stats: {} };
    }

    const stats = {
        questionCount: questions.length,
        totalMarks: 0,
        mcqCount: 0,
        theoryCount: 0,
        oneMarkCount: 0,
        twoMarkCount: 0,
        fourOrEightMarkTotal: 0,
    };

    // --- Count & type checks ---
    const expectedCount = config.questionCount || config.markDistribution.mcqCount || null;
    if (expectedCount && questions.length !== expectedCount) {
        errors.push(`expected_${expectedCount}_questions_got_${questions.length}`);
    }

    // --- Per-question validation ---
    for (const q of questions) {
        if (!q || typeof q !== 'object') {
            errors.push('invalid_question_object');
            continue;
        }
        if (!q.id || typeof q.id !== 'string') errors.push('missing_question_id');
        if (!q.text || typeof q.text !== 'string') errors.push('missing_question_text');
        if (!q.type) errors.push('missing_question_type');
        if (!q.difficulty) errors.push('missing_difficulty');

        if (q.type === 'mcq') {
            stats.mcqCount++;
            if (!Array.isArray(q.options) || q.options.length !== 4) {
                errors.push(`mcq_${q.id}: expected_4_options_got_${q.options ? q.options.length : 0}`);
            } else {
                // Option plausibility/distinctness is left to generation instructions;
                // keep only the minimum shape required to render selectable choices.
                const emptyOpt = q.options.some((o) => !o || String(o).trim().length === 0);
                if (emptyOpt) errors.push(`mcq_${q.id}: empty_option`);
            }
            if (typeof q.answer !== 'number' || q.answer < 0 || q.answer > 3) {
                errors.push(`mcq_${q.id}: invalid_answer_index`);
            }
            // Review metadata is optional. The generation prompt omits it to save tokens;
            // stripReviewMetadata still removes it when older/generated records contain it.
        } else if (q.type === 'subjective') {
            stats.theoryCount++;
            if (typeof q.marks !== 'number' || q.marks <= 0) {
                errors.push(`subjective_${q.id}: invalid_marks`);
            } else {
                const answerValidation = validateTheoryAnswerPayload(q);
                errors.push(...answerValidation.errors);
                stats.totalMarks += q.marks;
                if (q.marks === 1) stats.oneMarkCount++;
                if (q.marks === 2) stats.twoMarkCount++;
                if (q.marks === 4 || q.marks === 8) stats.fourOrEightMarkTotal += q.marks;
                if (config.type === 'subjective' && ![1, 2, 4, 8].includes(q.marks)) {
                    errors.push(`subjective_${q.id}: marks_must_be_1_2_4_or_8`);
                }
            }
        }

    }

    // Enforce the exact question-by-question mark sequence for theory papers.
    // This prevents a paper from having the right total while placing short questions later.
    if (Array.isArray(config.markSequence)) {
        if (config.markSequence.length !== questions.length) {
            errors.push(`expected_mark_sequence_length_${config.markSequence.length}_got_${questions.length}`);
        }
        config.markSequence.forEach((expectedMarks, index) => {
            const question = questions[index];
            if (!question) return;
            if (question.type !== 'subjective') {
                errors.push(`question_${index + 1}:expected_subjective_question`);
            } else if (question.marks !== expectedMarks) {
                errors.push(`question_${index + 1}:expected_${expectedMarks}_marks_got_${question.marks}`);
            }
        });
    }

    // --- Marks blueprint checks ---
    if (config.markDistribution.oneMarkCount !== undefined) {
        const expectedOneMark = config.markDistribution.oneMarkCount;
        if (stats.oneMarkCount !== expectedOneMark) {
            errors.push(`expected_${expectedOneMark}_one_mark_questions_got_${stats.oneMarkCount}`);
        }
    }
    if (config.markDistribution.twoMarkCount !== undefined) {
        const expectedTwoMark = config.markDistribution.twoMarkCount;
        if (stats.twoMarkCount !== expectedTwoMark) {
            errors.push(`expected_${expectedTwoMark}_two_mark_questions_got_${stats.twoMarkCount}`);
        }
    }
    if (config.markDistribution.fourOrEightMarkTotal !== undefined && stats.fourOrEightMarkTotal !== config.markDistribution.fourOrEightMarkTotal) {
        errors.push(`expected_4_or_8_mark_total_${config.markDistribution.fourOrEightMarkTotal}_got_${stats.fourOrEightMarkTotal}`);
    }
    if (config.totalMarks !== undefined && stats.totalMarks > 0) {
        if (stats.totalMarks !== config.totalMarks) {
            errors.push(`expected_${config.totalMarks}_total_marks_got_${stats.totalMarks}`);
        }
    }

    // --- Coverage check (warning only, not hard fail) ---
    if (coveragePlan && coveragePlan.inScopeChapters && coveragePlan.inScopeChapters.length > 0) {
        const coveredNames = new Set(
            questions
                .filter((q) => q.text)
                .map((q) => q.text)
                .flatMap((t) => coveragePlan.inScopeChapters
                    .filter((c) => t.toLowerCase().includes(c.name.toLowerCase()))
                    .map((c) => c.name)
                )
        );
        if (coveredNames.size < coveragePlan.inScopeChapters.length) {
            warnings.push('coverage_incomplete');
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        stats,
    };
}

/**
 * Strip internal review metadata from MCQ questions before sending to the
 * student. Returns a new array (does not mutate input).
 */
export function stripReviewMetadata(questions) {
    return questions.map((q) => {
        if (q.type === 'mcq') {
            const { review, ...rest } = q;
            return rest;
        }
        return q;
    });
}

/**
 * Validate a single batch output (used during per-batch generation).
 * @param {Array} questions
 * @param {number} expectedCount
 * @returns {ValidationResult}
 */
export function validateBatch(questions, expectedCount) {
    const errors = [];
    if (!Array.isArray(questions)) return { valid: false, errors: ['batch_not_array'], warnings: [], stats: {} };
    if (questions.length !== expectedCount) {
        errors.push(`expected_${expectedCount}_batch_questions_got_${questions.length}`);
    }
    for (const q of questions) {
        if (!q || typeof q !== 'object') {
            errors.push('invalid_question_object');
            continue;
        }
        if (!q.text || typeof q.text !== 'string') errors.push('missing_question_text');
        if (q.type === 'mcq') {
            if (!Array.isArray(q.options) || q.options.length !== 4) {
                errors.push(`mcq_${q.id}: expected_4_options`);
            }
            if (typeof q.answer !== 'number' || q.answer < 0 || q.answer > 3) {
                errors.push(`mcq_${q.id}: invalid_answer_index`);
            }
        } else if (q.type === 'subjective') {
            if (typeof q.marks !== 'number' || q.marks <= 0) {
                errors.push(`subjective_${q.id}: invalid_marks`);
            }
            const answerValidation = validateTheoryAnswerPayload(q);
            errors.push(...answerValidation.errors);
        }
    }
    return { valid: errors.length === 0, errors, warnings: [], stats: { questionCount: questions.length } };
}
