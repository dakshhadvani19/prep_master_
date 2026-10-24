/**
 * examValidation.js — Validation of AI-generated exam output before it reaches
 * the student. Strips internal review metadata from MCQ questions.
 *
 * Rules (from FINAL_PROMPT_TEMPLATE.md / examPrompts.js):
 * - Mid-1 theory: exactly two 1-mark questions; remaining 28 marks in 4/8-mark questions; total 30 marks.
 * - Mid-2 MCQ: exactly 30 questions; four distinct options; exactly one correct answer (index 0-3).
 * - ESE theory: exactly two 1-mark questions, one 2-mark question; remaining 56 marks in 4/8-mark questions; total 60 marks.
 * - No duplicate or near-duplicate stems.
 * - Coverage spans in-scope chapters.
 */

/**
 * Similarity threshold for near-duplicate detection (Jaccard on word sets).
 */
const DUPLICATE_SIMILARITY_THRESHOLD = 0.75;

function normalizeText(t) {
    return String(t || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
}

function jaccard(a, b) {
    const sa = new Set(normalizeText(a));
    const sb = new Set(normalizeText(b));
    if (sa.size === 0 || sb.size === 0) return 0;
    const inter = new Set([...sa].filter((x) => sb.has(x)));
    const union = new Set([...sa, ...sb]);
    return inter.size / union.size;
}

/**
 * Validation result shape.
 * @typedef {object} ValidationResult
 * @property {boolean} valid
 * @property {string[]} errors
 * @property {string[]} warnings
 * @property {object} stats { questionCount, totalMarks, mcqCount, theoryCount }
 */

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
    const seenStems = [];
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
                const distinct = new Set(q.options.map((o) => String(o).trim()));
                if (distinct.size !== 4) errors.push(`mcq_${q.id}: non_distinct_options`);
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
                stats.totalMarks += q.marks;
                if (q.marks === 1) stats.oneMarkCount++;
                if (q.marks === 2) stats.twoMarkCount++;
                if (q.marks === 4 || q.marks === 8) stats.fourOrEightMarkTotal += q.marks;
                if (config.type === 'subjective' && ![1, 2, 4, 8].includes(q.marks)) {
                    errors.push(`subjective_${q.id}: marks_must_be_1_2_4_or_8`);
                }
            }
        }

        // Duplicate detection
        const stem = q.text || '';
        const isDup = seenStems.some((s) => jaccard(stem, s) > DUPLICATE_SIMILARITY_THRESHOLD);
        if (isDup) errors.push(`duplicate_question_${q.id}`);
        seenStems.push(stem);
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
        }
    }
    return { valid: errors.length === 0, errors, warnings: [], stats: { questionCount: questions.length } };
}
