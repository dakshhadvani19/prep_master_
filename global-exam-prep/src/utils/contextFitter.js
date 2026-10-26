/**
 * contextFitter.js — Syllabus scope selection, context batching, and coverage
 * planning under a 6,000-character model input cap.
 *
 * Contract documented in Algorithm/CONTEXT_FITTING_IMPLEMENTATION.md.
 *
 * Key rules:
 * - Split at chapter boundaries only — never mid-chapter.
 * - Never silently discard content; truncation is always explicit.
 * - Mid-1 theory: first 50% of chapters, 30 marks, two 1-mark + 4/8-mark rest.
 * - Mid-2 MCQ: verified Mid-2 scope, 30 questions, 4 options, 1 correct.
 * - ESE theory: full syllabus (or blueprint-narrowed), 60 marks, two 1-mark + one 2-mark + 4/8-mark rest.
 */

export const MAX_SOURCE_CHARS = 6000;

/**
 * Normalize chapter content to a string (some records store it as an array of
 * paragraph strings).
 */
export function contentToString(content) {
    if (content == null) return '';
    if (Array.isArray(content)) return content.map(String).filter(Boolean).join('\n');
    return String(content);
}

// Normalize legacy route params to canonical syllabus exam keys.
export function normalizeExamType(examType) {
    const key = String(examType || '').toLowerCase();
    if (['mid-1', 'mid1', 'midterm1', 'midterm-1'].includes(key)) return 'mid1';
    if (['mid-2', 'mid2', 'midterm2', 'midterm-2'].includes(key)) return 'mid2';
    if (['final', 'ese', 'end-semester', 'end_semester'].includes(key)) return 'ese';
    return key;
}

/**
 * Exam type configuration — marking blueprints and scope rules.
 */
export const EXAM_CONFIG = {
    mid1: {
        type: 'subjective',
        totalMarks: 30,
        timeMinutes: 60,
        scopeRule: 'first_50_percent_chapters',
        questionCount: 7,
        markSequence: [1, 4, 1, 8, 4, 8, 4],
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
        markSequence: [1, 4, 1, 8, 4, 2, 8, 4, 8, 4, 8, 4, 4],
        markDistribution: { oneMarkCount: 2, twoMarkCount: 1, fourOrEightMarkTotal: 56 },
        questionTypes: ['subjective'],
    },
};

/**
 * Select in-scope chapters based on exam type and syllabus record.
 *
 * @param {object} record — parsed syllabus JSON
 * @param {string} examType — 'mid1' | 'mid2' | 'ese'
 * @returns {number[]} zero-based chapter indices in scope
 */
export function selectScopeChapters(record, examType) {
    const chapters = Array.isArray(record.chapters) ? record.chapters : [];
    const total = chapters.length;
    if (total === 0) return [];

    const normalizedType = normalizeExamType(examType);
    const config = EXAM_CONFIG[normalizedType];
    if (!config) throw new Error(`Unknown exam type: ${examType}`);

    if (config.scopeRule === 'first_50_percent_chapters') {
        // Mid-1: first 50% of chapters, rounded to nearest whole chapter boundary
        const half = Math.round(total / 2);
        const count = Math.max(1, Math.min(half, total));
        return Array.from({ length: count }, (_, i) => i);
    }

    if (config.scopeRule === 'verified_mid2_scope') {
        // Mid-2: prefer explicitly declared Mid-2 chapters if present; otherwise full syllabus
        const mid2Chapters = record.mid2_scope || record.mid2_chapters;
        if (Array.isArray(mid2Chapters) && mid2Chapters.length > 0) {
            // mid2_scope may contain chapter names or indices; resolve to indices
            const indices = mid2Chapters
                .map((c, idx) => (typeof c === 'number' ? c : chapters.findIndex((ch) => ch.chapter_name === c)))
                .filter((i) => i >= 0 && i < total);
            if (indices.length > 0) return [...new Set(indices)].sort((a, b) => a - b);
        }
        return Array.from({ length: total }, (_, i) => i);
    }

    // full_syllabus (ESE default)
    return Array.from({ length: total }, (_, i) => i);
}

/**
 * Estimate the character budget available for source excerpts after reserving
 * space for system instructions, scope block, and output schema.
 */
function availableSourceChars() {
    // Leaves room for system prompt (~1200), scope/coverage (~600), schema (~400),
    // and generated output (~1500) within a conservative model window.
    return MAX_SOURCE_CHARS;
}

/**
 * Build batches of chapters that each fit within the source character budget.
 * Splits at chapter boundaries only.
 *
 * @param {object} record — parsed syllabus JSON
 * @param {number[]} chapterIndices — in-scope chapter indices
 * @param {number} maxChars — max chars per batch (default MAX_SOURCE_CHARS)
 * @returns {Array<{chapterIndices: number[], charCount: number}>}
 */
export function buildBatches(record, chapterIndices, maxChars = MAX_SOURCE_CHARS) {
    const chapters = Array.isArray(record.chapters) ? record.chapters : [];
    const batches = [];
    let current = [];
    let currentChars = 0;

    for (const ci of chapterIndices) {
        const ch = chapters[ci];
        if (!ch) continue;
        const chapterText = `${ch.chapter_name || ''}\n${contentToString(ch.content)}`;
        const chapterLen = chapterText.length;

        if (current.length === 0) {
            // Start a new batch with this chapter
            current = [ci];
            currentChars = chapterLen;
            continue;
        }

        if (currentChars + chapterLen > maxChars) {
            // Current batch is full — push it and start a new one
            batches.push({ chapterIndices: [...current], charCount: currentChars });
            current = [ci];
            currentChars = chapterLen;
        } else {
            current.push(ci);
            currentChars += chapterLen;
        }
    }

    // Push the final batch
    if (current.length > 0) {
        batches.push({ chapterIndices: [...current], charCount: currentChars });
    }

    return batches;
}

/**
 * Build a coverage plan allocating questions/marks across batches.
 *
 * @param {object} record — parsed syllabus JSON
 * @param {string} examType — 'mid1' | 'mid2' | 'ese'
 * @param {number[]} chapterIndices — in-scope chapter indices
 * @param {Array} batches — from buildBatches
 * @returns {object} coverage plan
 */
export function buildCoveragePlan(record, examType, chapterIndices, batches) {
    const normalizedType = normalizeExamType(examType);
    const config = EXAM_CONFIG[normalizedType];
    if (!config) throw new Error(`Unknown exam type: ${examType}`);
    const totalMarks = config.totalMarks;
    const totalChars = batches.reduce((sum, b) => sum + b.charCount, 0);

    const planBatches = batches.map((batch, bi) => {
        const proportion = totalChars > 0 ? batch.charCount / totalChars : 1 / batches.length;
        return {
            batchIndex: bi,
            chapters: batch.chapterIndices.map((ci) => ({
                index: ci,
                name: (record.chapters[ci] && record.chapters[ci].chapter_name) || `Chapter ${ci + 1}`,
            })),
            charCount: batch.charCount,
        };
    });

    return {
        examType: normalizedType,
        totalChapters: record.chapters ? record.chapters.length : 0,
        inScopeChapters: chapterIndices.map((ci) => ({
            index: ci,
            name: (record.chapters[ci] && record.chapters[ci].chapter_name) || `Chapter ${ci + 1}`,
        })),
        totalMarks,
        batches: planBatches,
        markDistribution: config.markDistribution,
        questionTypes: config.questionTypes,
    };
}

/**
 * Compose the source excerpt for a single batch, appending an explicit
 * truncation note when the batch exceeds the cap (should not happen since we
 * pre-split, but a single oversized chapter triggers it).
 *
 * @param {object} record — parsed syllabus JSON
 * @param {number[]} chapterIndices — chapters in this batch
 * @param {number} maxChars — max chars
 * @returns {string} excerpt text
 */
export function buildBatchExcerpt(record, chapterIndices, maxChars = MAX_SOURCE_CHARS) {
    const chapters = Array.isArray(record.chapters) ? record.chapters : [];
    const parts = [];

    for (const ci of chapterIndices) {
        const ch = chapters[ci];
        if (!ch) continue;
        const chapterText = `CHAPTER: ${ch.chapter_name || `Chapter ${ci + 1}`}\n${contentToString(ch.content)}\n`;
        parts.push(chapterText);
    }

    let excerpt = parts.join('\n---\n');

    if (excerpt.length > maxChars) {
        // Single chapter too large — truncate explicitly, never silently
        excerpt = excerpt.slice(0, maxChars);
        excerpt += `\n\n[NOTE: SOURCE EXCERPT TRUNCATED. Treat only the visible material as evidence; do not make claims about what omitted text does or does not contain.]`;
    }

    return excerpt;
}

/**
 * Build one balanced source context for a single full-paper MCQ request.
 * Every in-scope chapter gets a representative excerpt within the total character
 * budget, avoiding the previous first-batch-only loss of syllabus coverage.
 */
export function buildBalancedObjectiveSource(record, chapterIndices, prefix = '', maxChars = MAX_SOURCE_CHARS) {
    const chapters = Array.isArray(record?.chapters) ? record.chapters : [];
    const entries = [...new Set(chapterIndices || [])]
        .map((index) => {
            const chapter = chapters[index];
            if (!chapter) return null;
            return {
                name: String(chapter.chapter_name || `Chapter ${index + 1}`),
                content: contentToString(chapter.content).trim(),
            };
        })
        .filter(Boolean);

    const safeMaxChars = Math.max(1, Number(maxChars) || MAX_SOURCE_CHARS);
    const prefixText = String(prefix || '').slice(0, Math.min(safeMaxChars, Math.floor(safeMaxChars * 0.15)));
    const lead = prefixText ? `${prefixText}\n\n` : '';
    if (entries.length === 0) return lead.slice(0, safeMaxChars);

    const chapterHeadingsLength = entries.reduce((sum, entry) => sum + `CHAPTER: ${entry.name}\n`.length, 0);
    const separatorsLength = Math.max(0, entries.length - 1) * '\n---\n'.length;
    const availableContentChars = Math.max(0, safeMaxChars - lead.length - chapterHeadingsLength - separatorsLength);
    const baseBudget = Math.floor(availableContentChars / entries.length);
    let remainder = availableContentChars - baseBudget * entries.length;

    const excerpts = entries.map((entry) => {
        const budget = baseBudget + (remainder-- > 0 ? 1 : 0);
        if (entry.content.length <= budget) return entry.content;
        if (budget <= 32) return entry.content.slice(0, budget);

        // Preserve the start and end of each chapter with a marker for omitted middle content.
        const marker = '\n[…middle excerpt omitted…]\n';
        const retained = Math.max(0, budget - marker.length);
        const headLength = Math.ceil(retained * 0.6);
        const tailLength = retained - headLength;
        return `${entry.content.slice(0, headLength)}${marker}${tailLength ? entry.content.slice(-tailLength) : ''}`;
    });

    return `${lead}${entries.map((entry, index) => `CHAPTER: ${entry.name}\n${excerpts[index]}`).join('\n---\n')}`.slice(0, safeMaxChars);
}

/**
 * Full pipeline: select scope, build batches, build coverage plan.
 *
 * @param {object} record — parsed syllabus JSON
 * @param {string} examType — 'mid1' | 'mid2' | 'ese'
 * @returns {object} { chapterIndices, batches, coveragePlan, config }
 */
export function fitContext(record, examType, { isDepartmentalSubject = false } = {}) {
    const normalizedType = normalizeExamType(examType);
    const chapterIndices = selectScopeChapters(record, normalizedType);
    const isDepartmentalMid1 = isDepartmentalSubject === true && normalizedType === 'mid1';
    const config = isDepartmentalMid1
        ? {
            ...EXAM_CONFIG.mid1,
            type: 'objective',
            timeMinutes: 45,
            questionCount: 30,
            markSequence: undefined,
            markDistribution: { mcqCount: 30 },
            questionTypes: ['mcq'],
        }
        : EXAM_CONFIG[normalizedType];
    if (chapterIndices.length === 0) {
        throw new Error(`No in-scope chapters found for exam type ${examType}`);
    }
    const batches = buildBatches(record, chapterIndices);
    const coveragePlan = buildCoveragePlan(record, normalizedType, chapterIndices, batches);
    if (isDepartmentalMid1) {
        coveragePlan.markDistribution = config.markDistribution;
        coveragePlan.questionTypes = config.questionTypes;
    }
    return {
        chapterIndices,
        batches,
        coveragePlan,
        config,
    };
}
