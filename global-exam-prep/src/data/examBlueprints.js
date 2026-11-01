/**
 * Canonical exam blueprints shared by generation, validation, and UI metadata.
 * Theory markSequence is the required question order, not just a total/count hint.
 */
export const EXAM_BLUEPRINTS = {
    mid1: {
        type: 'subjective',
        totalMarks: 30,
        timeMinutes: 60,
        scopeRule: 'first_50_percent_chapters',
        questionCount: 7,
        markSequence: [1, 1, 4, 8, 4, 8, 4],
        markDistribution: { oneMarkCount: 2, fourOrEightMarkTotal: 28 },
        questionTypes: ['subjective'],
    },
    mid2: {
        type: 'objective',
        totalMarks: 30,
        timeMinutes: 45,
        scopeRule: 'verified_mid2_scope',
        questionCount: 30,
        markDistribution: { mcqCount: 30 },
        questionTypes: ['mcq'],
    },
    ese: {
        type: 'subjective',
        totalMarks: 60,
        timeMinutes: 180,
        scopeRule: 'full_syllabus',
        questionCount: 13,
        markSequence: [1, 1, 2, 4, 8, 4, 8, 4, 8, 4, 8, 4, 4],
        markDistribution: { oneMarkCount: 2, twoMarkCount: 1, fourOrEightMarkTotal: 56 },
        questionTypes: ['subjective'],
    },
};
