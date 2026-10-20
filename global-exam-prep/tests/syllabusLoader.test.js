/**
 * Tests for syllabusLoader.js — loads syllabus records from static dataset.
 * Uses mocked fetch since the test environment doesn't serve /syllabus/.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    loadSyllabusIndex,
    findSyllabusBySubjectCode,
    loadSyllabusRecord,
    resolveSyllabus,
    validateSyllabusRecord,
} from '../src/utils/syllabusLoader';

const mockIndex = {
    generatedAt: '2026-10-20T00:00:00.000Z',
    totalFiles: 10,
    totalSubjects: 3,
    duplicateGroups: 0,
    errors: [],
    subjects: {
        '01CE0104': {
            subjectCode: '01CE0104',
            subjectName: 'Object Oriented Programming',
            department: 'B.Tech',
            courseOrBranch: 'CSE',
            semester: null,
            status: 'ready',
            path: '/syllabus/B_Tech/CSE/01CE0104_Object_Oriented_Programming.json',
            sourceFile: 'B_Tech/CSE/01CE0104_Object_Oriented_Programming.json',
            isPractical: false,
            hasChapters: true,
            chapterCount: 5,
        },
        '01CE0105': {
            subjectCode: '01CE0105',
            subjectName: 'Data Structures',
            department: 'B.Tech',
            courseOrBranch: 'CSE',
            semester: null,
            status: 'ready',
            path: '/syllabus/B_Tech/CSE/01CE0105_Data_Structures.json',
            sourceFile: 'B_Tech/CSE/01CE0105_Data_Structures.json',
            isPractical: false,
            hasChapters: true,
            chapterCount: 6,
        },
        'DUP001': [
            {
                subjectCode: 'DUP001',
                subjectName: 'Duplicate Subject',
                department: 'B.Tech',
                courseOrBranch: 'CSE',
                semester: null,
                status: 'ready',
                path: '/syllabus/B_Tech/CSE/DUP001_CSE.json',
                sourceFile: 'B_Tech/CSE/DUP001_CSE.json',
                isPractical: false,
                hasChapters: true,
                chapterCount: 4,
            },
            {
                subjectCode: 'DUP001',
                subjectName: 'Duplicate Subject',
                department: 'Diploma',
                courseOrBranch: 'Civil',
                semester: null,
                status: 'ready',
                path: '/syllabus/Diploma/Civil/DUP001_Civil.json',
                sourceFile: 'Diploma/Civil/DUP001_Civil.json',
                isPractical: false,
                hasChapters: true,
                chapterCount: 4,
            },
        ],
    },
};

const mockRecord = {
    subject: {
        subject_code: '01CE0104',
        name: 'Object Oriented Programming',
        department: 'B.Tech',
    },
    chapters: [
        { chapter_name: 'Chapter 1', content: 'Content for chapter 1. ' },
        { chapter_name: 'Chapter 2', content: 'Content for chapter 2. ' },
    ],
};

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.resetModules();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('syllabusLoader', () => {
    describe('loadSyllabusIndex', () => {
        it('returns parsed index from fetch', async () => {
            const { loadSyllabusIndex: lsi } = await import('../src/utils/syllabusLoader');
            fetch.mockResolvedValueOnce({ ok: true, json: async () => mockIndex });
            const idx = await lsi();
            expect(idx.totalSubjects).toBe(3);
            expect(idx.subjects['01CE0104'].subjectName).toBe('Object Oriented Programming');
        });

        it('returns empty index on fetch failure', async () => {
            const { loadSyllabusIndex: lsi } = await import('../src/utils/syllabusLoader');
            fetch.mockRejectedValueOnce(new Error('Network error'));
            const idx = await lsi();
            expect(idx.totalSubjects).toBe(0);
            expect(idx.errors.some((e) => String(e).includes('Network error'))).toBe(true);
        });
    });

    describe('findSyllabusBySubjectCode', () => {
        it('returns single entry for unique subject code', async () => {
            const { findSyllabusBySubjectCode: fsb, loadSyllabusIndex: lsi } = await import('../src/utils/syllabusLoader');
            fetch.mockResolvedValueOnce({ ok: true, json: async () => mockIndex });
            await lsi(); // populate cache

            const entries = await fsb('01ce0104'); // lowercase
            expect(entries).toHaveLength(1);
            expect(entries[0].subjectCode).toBe('01CE0104');
        });

        it('returns array for duplicate subject codes', async () => {
            const { findSyllabusBySubjectCode: fsb, loadSyllabusIndex: lsi } = await import('../src/utils/syllabusLoader');
            fetch.mockResolvedValueOnce({ ok: true, json: async () => mockIndex });
            await lsi();

            const entries = await fsb('DUP001');
            expect(Array.isArray(entries)).toBe(true);
            expect(entries).toHaveLength(2);
        });

        it('returns null for unknown subject code', async () => {
            const { findSyllabusBySubjectCode: fsb, loadSyllabusIndex: lsi } = await import('../src/utils/syllabusLoader');
            fetch.mockResolvedValueOnce({ ok: true, json: async () => mockIndex });
            await lsi();

            const entries = await fsb('UNKNOWN');
            expect(entries).toBeNull();
        });
    });

    describe('loadSyllabusRecord', () => {
        it('fetches and parses a syllabus record', async () => {
            const { loadSyllabusRecord: lsr } = await import('../src/utils/syllabusLoader');
            fetch.mockResolvedValueOnce({ ok: true, json: async () => mockRecord });
            const record = await lsr('/syllabus/B_Tech/CSE/01CE0104_Object_Oriented_Programming.json');
            expect(record.subject.subject_code).toBe('01CE0104');
            expect(record.chapters).toHaveLength(2);
        });

        it('throws on fetch failure', async () => {
            const { loadSyllabusRecord: lsr } = await import('../src/utils/syllabusLoader');
            fetch.mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' });
            await expect(lsr('/syllabus/missing.json')).rejects.toThrow();
        });
    });

    describe('resolveSyllabus', () => {
        it('resolves subject code to entry and record', async () => {
            const { resolveSyllabus } = await import('../src/utils/syllabusLoader');
            fetch.mockResolvedValueOnce({ ok: true, json: async () => mockIndex });
            fetch.mockResolvedValueOnce({ ok: true, json: async () => mockRecord });

            const result = await resolveSyllabus('01CE0104');
            expect(result).not.toBeNull();
            expect(result.entry.subjectCode).toBe('01CE0104');
            expect(result.record.subject.subject_code).toBe('01CE0104');
        });

        it('returns null when subject not found', async () => {
            const { resolveSyllabus } = await import('../src/utils/syllabusLoader');
            fetch.mockResolvedValueOnce({ ok: true, json: async () => mockIndex });

            const result = await resolveSyllabus('UNKNOWN');
            expect(result).toBeNull();
        });

        it('filters by department when specified', async () => {
            const { resolveSyllabus } = await import('../src/utils/syllabusLoader');
            fetch.mockResolvedValueOnce({ ok: true, json: async () => mockIndex });
            fetch.mockResolvedValueOnce({ ok: true, json: async () => mockRecord });

            const result = await resolveSyllabus('DUP001', { department: 'Diploma' });
            expect(result.entry.department).toBe('Diploma');
            expect(result.entry.courseOrBranch).toBe('Civil');
        });

        it('prefers theory (non-practical) entries', async () => {
            const indexWithPractical = {
                ...mockIndex,
                subjects: {
                    ...mockIndex.subjects,
                    '01CE0104': [
                        mockIndex.subjects['01CE0104'],
                        {
                            subjectCode: '01CE0104',
                            subjectName: 'OOP Practicals',
                            department: 'B.Tech',
                            courseOrBranch: 'CSE',
                            semester: null,
                            status: 'ready',
                            path: '/syllabus/B_Tech/CSE/01CE0104_practicals.json',
                            sourceFile: 'B_Tech/CSE/01CE0104_practicals.json',
                            isPractical: true,
                            hasChapters: false,
                            chapterCount: 0,
                        },
                    ],
                },
            };
            const { resolveSyllabus } = await import('../src/utils/syllabusLoader');
            fetch.mockResolvedValueOnce({ ok: true, json: async () => indexWithPractical });
            fetch.mockResolvedValueOnce({ ok: true, json: async () => mockRecord });

            const result = await resolveSyllabus('01CE0104', { preferTheory: true });
            expect(result.entry.isPractical).toBe(false);
        });
    });

    describe('validateSyllabusRecord', () => {
        it('accepts valid record', () => {
            const result = validateSyllabusRecord(mockRecord);
            expect(result.valid).toBe(true);
        });

        it('rejects null record', () => {
            const result = validateSyllabusRecord(null);
            expect(result.valid).toBe(false);
            expect(result.reason).toBe('invalid_syllabus_record');
        });

        it('rejects missing subject_code', () => {
            const result = validateSyllabusRecord({ chapters: [] });
            expect(result.valid).toBe(false);
            expect(result.reason).toBe('missing_subject_code');
        });

        it('rejects missing chapters', () => {
            const result = validateSyllabusRecord({ subject: { subject_code: 'X' } });
            expect(result.valid).toBe(false);
            expect(result.reason).toBe('missing_chapters');
        });

        it('rejects incomplete chapter content', () => {
            const result = validateSyllabusRecord({
                subject: { subject_code: 'X' },
                chapters: [{ chapter_name: 'Ch1', content: '' }],
            });
            expect(result.valid).toBe(false);
            expect(result.reason).toBe('incomplete_chapter_content');
        });

        it('accepts record whose chapter content is an array of strings', () => {
            const result = validateSyllabusRecord({
                subject: { subject_code: '09CE3301' },
                chapters: [
                    { chapter_name: 'Ch1', content: ['para one', 'para two'] },
                    { chapter_name: 'Ch2', content: 'single string content' },
                ],
            });
            expect(result.valid).toBe(true);
        });

        it('rejects record whose chapter content is an empty array', () => {
            const result = validateSyllabusRecord({
                subject: { subject_code: 'X' },
                chapters: [{ chapter_name: 'Ch1', content: [] }],
            });
            expect(result.valid).toBe(false);
            expect(result.reason).toBe('incomplete_chapter_content');
        });
    });
});

/**
 * codeMap resolution: legacy/internal source id -> official syllabus code.
 */
import { describe as d2, it as i2, expect as e2 } from 'vitest';
import codeMap from '../src/data/syllabusCodeMap.json';

d2('syllabusCodeMap', () => {
    i2('maps legacy id 09ce2301 to official code 09CE3301 (Object Oriented Programming With C++)', () => {
        e2(codeMap.map['09ce2301'].officialCode).toBe('09CE3301');
        e2(codeMap.map['09ce2301'].subjectName).toBe('Object Oriented Programming With C++');
    });

    i2('does not invent mappings for unknown legacy ids', () => {
        e2(codeMap.map['DOES_NOT_EXIST']).toBeUndefined();
    });
});

