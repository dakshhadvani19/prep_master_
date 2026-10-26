import { describe, expect, it } from 'vitest';
import { examPrompts } from '../src/data/examPrompts';
import {
    getExamTypesForSubject,
    getSubjectExamInfo,
    normalizeDepartmentalFlag,
} from '../src/utils/subjectExamPolicy';

describe('subject-specific exam availability', () => {
    it('offers three exams to non-departmental subjects', () => {
        expect(getExamTypesForSubject(false)).toEqual(['mid-1', 'mid-2', 'final']);
    });

    it('offers only Mid-1 and Mid-2 to departmental subjects', () => {
        expect(getExamTypesForSubject(true)).toEqual(['mid-1', 'mid-2']);
    });

    it('treats a missing/non-true flag as non-departmental and accepts the database true value', () => {
        expect(normalizeDepartmentalFlag(false)).toBe(false);
        expect(normalizeDepartmentalFlag(undefined)).toBe(false);
        expect(normalizeDepartmentalFlag('true')).toBe(true);
    });

    it('uses a 30-question objective blueprint for departmental Mid-1', () => {
        const info = getSubjectExamInfo('mid-1', true);
        expect(info.type).toBe('objective');
        expect(info.totalMarks).toBe(30);
        expect(info.timeMinutes).toBe(45);
    });

    it('does not change non-departmental Mid-1 or common Mid-2 format', () => {
        expect(getSubjectExamInfo('mid-1', false)).toEqual(examPrompts['mid-1']);
        const departmentalMid2 = getSubjectExamInfo('mid-2', true);
        expect(departmentalMid2.type).toBe('objective');
        expect(departmentalMid2.totalMarks).toBe(30);
        expect(departmentalMid2.timeMinutes).toBe(45);
        expect(getSubjectExamInfo('final', true)).toBeUndefined();
    });
});
