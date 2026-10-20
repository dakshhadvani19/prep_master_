/**
 * syllabusLoader.js — Load syllabus records from the static dataset served at
 * /syllabus/<department>/<course>/<subject>.json
 *
 * All files were copied from all_departments_syllabus/ into
 * global-exam-prep/public/syllabus/ and indexed in
 * global-exam-prep/public/syllabus/index.json by subject code.
 *
 * The frontend fetches records over HTTP at build/runtime — no secrets, no
 * answer keys, no Groq keys client-side.
 */

import codeMap from '../data/syllabusCodeMap.json';

const INDEX_URL = '/syllabus/index.json';

let _indexCache = null;

/**
 * Fetch the full subject-code -> file info index.
 * Falls back to an empty index if the file is unavailable (offline).
 */
export async function loadSyllabusIndex() {
    if (_indexCache) return _indexCache;
    try {
        const res = await fetch(INDEX_URL, { cache: 'no-store' });
        if (!res.ok) {
            _indexCache = { subjects: {}, totalSubjects: 0, totalFiles: 0, errors: ['index_unavailable'] };
            return _indexCache;
        }
        _indexCache = await res.json();
        return _indexCache;
    } catch (err) {
        _indexCache = { subjects: {}, totalSubjects: 0, totalFiles: 0, errors: [String(err)] };
        return _indexCache;
    }
}

/**
 * Look up syllabus entry(ies) by subject code (case-insensitive).
 * Returns an array of matching entries (subjects can appear under multiple
 * departments/branches with the same code).
 *
 * @param {string} subjectCode e.g. "01CE0104" or "01ce0104"
 * @returns {Promise<Array<{subjectCode, subjectName, department, courseOrBranch, semester, status, path, isPractical, hasChapters, chapterCount}> | null>}
 */
export async function findSyllabusBySubjectCode(subjectCode) {
    const idx = await loadSyllabusIndex();
    const key = String(subjectCode).toUpperCase();
    const entry = idx.subjects?.[key];
    if (!entry) return null;
    return Array.isArray(entry) ? entry : [entry];
}

/**
 * Fetch a single syllabus JSON record by its public URL path.
 * @param {string} path e.g. "/syllabus/B_Tech/CSE_Artificial_Intelligence/01AI0101_Differential_Calculus.json"
 * @returns {Promise<object>} parsed syllabus JSON
 */
export async function loadSyllabusRecord(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load syllabus record: ${res.status} ${res.statusText}`);
    return await res.json();
}

/**
 * Resolve a syllabus record by subject code, preferring a non-practical
 * theory subject when multiple entries share the code. Optionally filter by
 * department or course/branch.
 *
 * @param {string} subjectCode
 * @param {object} opts { department?, courseOrBranch?, preferTheory? }
 * @returns {Promise<{entry, record} | null>}
 */
export async function resolveSyllabus(subjectCode, opts = {}) {
    let entries = await findSyllabusBySubjectCode(subjectCode);
    const { department, courseOrBranch, subjectName, preferTheory = true } = opts;

    // Step 2: explicit internal-ID -> official syllabus code mapping.
    // The application's sourceSubjectId (legacy id from the subject-ID bridge)
    // often differs from the official syllabus subject code (e.g. "09ce2301"
    // vs "09CE3301"). Resolve it deterministically via the generated map.
    if ((!entries || entries.length === 0)) {
        const mapped = codeMap.map?.[String(subjectCode).toLowerCase()];
        if (mapped && mapped.officialCode) {
            entries = await findSyllabusBySubjectCode(mapped.officialCode);
        }
    }

    // Legacy catalog IDs may differ from the official syllabus code. If the
    // code has no indexed record, fall back only to an exact normalized title
    // match, then use department/course to disambiguate duplicates.
    if ((!entries || entries.length === 0) && subjectName) {
        const idx = await loadSyllabusIndex();
        const normalize = (value) => String(value || '').toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ').trim();
        const wantedName = normalize(subjectName);
        entries = Object.values(idx.subjects || {}).flatMap((value) =>
            Array.isArray(value) ? value : [value]
        ).filter((entry) => normalize(entry.subjectName) === wantedName);
    }
    if (!entries || entries.length === 0) return null;

    let candidates = entries.filter((e) => e.status === 'ready');

    if (department) {
        candidates = candidates.filter((e) => e.department === department);
    }
    if (courseOrBranch) {
        candidates = candidates.filter((e) => e.courseOrBranch === courseOrBranch);
    }

    if (candidates.length === 0) {
        // Fall back to all entries if filters were too strict
        candidates = entries.filter((e) => e.status === 'ready');
    }
    if (candidates.length === 0) return null;

    if (preferTheory) {
        const theory = candidates.find((e) => !e.isPractical && e.hasChapters);
        if (theory) {
            const record = await loadSyllabusRecord(theory.path);
            return { entry: theory, record };
        }
    }

    const entry = candidates[0];
    const record = await loadSyllabusRecord(entry.path);
    return { entry, record };
}

/**
 * Normalize chapter content to a string. Some syllabus records store content
 * as an array of paragraph strings rather than a single string.
 */
function contentToString(content) {
    if (content == null) return '';
    if (Array.isArray(content)) return content.map(String).filter(Boolean).join('\n');
    return String(content);
}

/**
 * Validate that a loaded syllabus record is usable for exam generation.
 * Returns { valid: boolean, reason?: string }.
 */
export function validateSyllabusRecord(record) {
    if (!record || typeof record !== 'object') {
        return { valid: false, reason: 'invalid_syllabus_record' };
    }
    const subject = record.subject || {};
    if (!subject.subject_code) {
        return { valid: false, reason: 'missing_subject_code' };
    }
    if (!Array.isArray(record.chapters) || record.chapters.length === 0) {
        return { valid: false, reason: 'missing_chapters' };
    }
    const badChapters = record.chapters.filter(
        (c) => !c || !c.chapter_name || contentToString(c.content).trim().length === 0
    );
    if (badChapters.length > 0) {
        return { valid: false, reason: 'incomplete_chapter_content' };
    }
    return { valid: true };
}
