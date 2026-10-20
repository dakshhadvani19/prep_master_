/**
 * Tests for contextFitter.js — scope selection, batching, coverage planning.
 */
import { describe, it, expect } from 'vitest';
import {
    selectScopeChapters,
    buildBatches,
    buildCoveragePlan,
    fitContext,
    MAX_SOURCE_CHARS,
    EXAM_CONFIG,
    normalizeExamType,
} from '../src/utils/contextFitter';

const makeRecord = (chapterCount) => ({
    chapters: Array.from({ length: chapterCount }, (_, i) => ({
        chapter_name: `Chapter ${i + 1}`,
        content: `Content for chapter ${i + 1}. ` + 'x'.repeat(500),
    })),
});

describe('contextFitter', () => {
    it('MAX_SOURCE_CHARS is 6000', () => {
        expect(MAX_SOURCE_CHARS).toBe(6000);
    });

    it('EXAM_CONFIG has mid1, mid2, ese', () => {
        expect(EXAM_CONFIG.mid1.type).toBe('subjective');
        expect(EXAM_CONFIG.mid1.totalMarks).toBe(30);
        expect(EXAM_CONFIG.mid2.type).toBe('objective');
        expect(EXAM_CONFIG.mid2.totalMarks).toBe(30);
        expect(EXAM_CONFIG.ese.type).toBe('subjective');
        expect(EXAM_CONFIG.ese.totalMarks).toBe(60);
    });


    it('normalizes the legacy route exam names used by ExamPortal', () => {
        expect(normalizeExamType('mid-1')).toBe('mid1');
        expect(normalizeExamType('mid-2')).toBe('mid2');
        expect(normalizeExamType('final')).toBe('ese');
        expect(fitContext(makeRecord(4), 'mid-1').config.totalMarks).toBe(30);
        expect(fitContext(makeRecord(4), 'mid-2').config.type).toBe('objective');
        expect(fitContext(makeRecord(4), 'final').config.totalMarks).toBe(60);
    });

    describe('selectScopeChapters', () => {
        it('mid1 returns first 50% of chapters', () => {
            const record = makeRecord(8);
            const indices = selectScopeChapters(record, 'mid1');
            expect(indices).toEqual([0, 1, 2, 3]);
        });

        it('mid1 with odd chapter count rounds to nearest', () => {
            const record = makeRecord(7);
            const indices = selectScopeChapters(record, 'mid1');
            expect(indices.length).toBe(4); // Math.round(7/2) = 4
        });

        it('ese returns all chapters', () => {
            const record = makeRecord(5);
            const indices = selectScopeChapters(record, 'ese');
            expect(indices).toEqual([0, 1, 2, 3, 4]);
        });

        it('mid2 returns all chapters when no mid2_scope', () => {
            const record = makeRecord(6);
            const indices = selectScopeChapters(record, 'mid2');
            expect(indices).toEqual([0, 1, 2, 3, 4, 5]);
        });

        it('mid2 uses mid2_scope when present', () => {
            const record = makeRecord(8);
            record.mid2_scope = ['Chapter 3', 'Chapter 5'];
            const indices = selectScopeChapters(record, 'mid2');
            expect(indices).toEqual([2, 4]);
        });

        it('empty chapters returns empty array', () => {
            const indices = selectScopeChapters({ chapters: [] }, 'mid1');
            expect(indices).toEqual([]);
        });
    });

    describe('buildBatches', () => {
        it('fits small content in one batch', () => {
            const record = makeRecord(3);
            const batches = buildBatches(record, [0, 1, 2]);
            expect(batches.length).toBe(1);
            expect(batches[0].chapterIndices).toEqual([0, 1, 2]);
        });

        it('splits at chapter boundaries', () => {
            // Each chapter ~510 chars, 6 chapters ~3060 chars total
            // With MAX_SOURCE_CHARS = 6000, all should fit in one batch
            const record = makeRecord(6);
            const batches = buildBatches(record, [0, 1, 2, 3, 4, 5]);
            expect(batches.length).toBe(1);
        });

        it('never splits a chapter mid-content', () => {
            const record = makeRecord(10);
            const batches = buildBatches(record, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
            // All chapters should be whole within batches
            const allIndices = batches.flatMap((b) => b.chapterIndices);
            expect(allIndices.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        });
    });

    describe('buildCoveragePlan', () => {
        it('builds plan with in-scope chapters and batches', () => {
            const record = makeRecord(4);
            const chapterIndices = [0, 1];
            const batches = buildBatches(record, chapterIndices);
            const plan = buildCoveragePlan(record, 'mid1', chapterIndices, batches);
            expect(plan.examType).toBe('mid1');
            expect(plan.totalMarks).toBe(30);
            expect(plan.inScopeChapters).toHaveLength(2);
            expect(plan.batches).toHaveLength(1);
            expect(plan.markDistribution.oneMarkCount).toBe(2);
        });
    });

    describe('fitContext', () => {
        it('returns chapterIndices, batches, coveragePlan, config for mid1', () => {
            const record = makeRecord(8);
            const result = fitContext(record, 'mid1');
            expect(result.chapterIndices).toEqual([0, 1, 2, 3]);
            expect(result.batches.length).toBeGreaterThan(0);
            expect(result.coveragePlan.examType).toBe('mid1');
            expect(result.config.totalMarks).toBe(30);
        });

        it('returns chapterIndices, batches, coveragePlan, config for mid2', () => {
            const record = makeRecord(6);
            const result = fitContext(record, 'mid2');
            expect(result.chapterIndices).toEqual([0, 1, 2, 3, 4, 5]);
            expect(result.config.totalMarks).toBe(30);
            expect(result.config.type).toBe('objective');
        });

        it('returns chapterIndices, batches, coveragePlan, config for ese', () => {
            const record = makeRecord(10);
            const result = fitContext(record, 'ese');
            expect(result.chapterIndices).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
            expect(result.config.totalMarks).toBe(60);
            expect(result.config.type).toBe('subjective');
        });

        it('throws when no chapters in scope', () => {
            expect(() => fitContext({ chapters: [] }, 'mid1')).toThrow();
        });

        it('throws for unknown exam type', () => {
            const record = makeRecord(4);
            expect(() => fitContext(record, 'unknown')).toThrow();
        });
    });
});
