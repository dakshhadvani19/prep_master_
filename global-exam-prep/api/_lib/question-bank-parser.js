import { Buffer } from 'node:buffer';
import { parse } from 'csv-parse/sync';
import mammoth from 'mammoth';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { QUESTION_BANK_CSV_HEADERS } from './admin-course-upload-validation.js';

const clean = value => String(value || '').replace(/\s+/g, ' ').trim();

function draftRubric(marks) {
    const n = Number(marks);
    if (!Number.isFinite(n) || n <= 0) return '';
    const a = Math.round(n * 0.6 * 100) / 100;
    const b = Math.round(n * 0.25 * 100) / 100;
    const c = Math.round((n - a - b) * 100) / 100;
    return 'Generated draft — review before publishing:\nAccuracy and correctness: ' + a
        + ' marks\nCompleteness and relevant points: ' + b + ' marks\nClarity and organization: ' + c + ' marks';
}

function optionIndex(answer, options) {
    const raw = clean(answer).replace(/^option\s*/i, '');
    const letter = raw.match(/^\(?([A-D])\)?[.)]?$/i);
    if (letter) return letter[1].toUpperCase().charCodeAt(0) - 65;
    const matches = options.map((value, index) => clean(value).toLowerCase() === raw.toLowerCase() ? index : -1)
        .filter(index => index >= 0);
    return matches.length === 1 ? matches[0] : null;
}

function normalizeQuestion(raw, source, order, seen) {
    const errors = [];
    const text = clean(raw.question_text);
    const type = raw.question_type === 'mcq' ? 'mcq' : 'theory';
    const options = type === 'mcq' && Array.isArray(raw.options) ? raw.options.map(clean) : [];
    if (!text) errors.push('Question text is missing.');
    const key = text.toLowerCase();
    if (key && seen.has(key)) errors.push('Duplicate question text.');
    if (key) seen.add(key);
    if (type === 'mcq') {
        if (options.length !== 4 || options.some(value => !value)) errors.push('MCQ requires exactly four non-empty options.');
        if (!Number.isInteger(raw.correct_option_index) || raw.correct_option_index < 0 || raw.correct_option_index > 3) {
            errors.push('Correct option is missing or ambiguous.');
        }
    } else if (!clean(raw.model_answer)) errors.push('Theory model answer is missing.');
    const marks = Number(raw.marks);
    if (!Number.isFinite(marks) || marks <= 0) errors.push('Marks must be greater than zero.');
    const difficulty = ['easy', 'medium', 'hard'].includes(String(raw.difficulty || '').toLowerCase())
        ? String(raw.difficulty).toLowerCase() : '';
    if (!difficulty) errors.push('Difficulty must be easy, medium, or hard.');
    let rubric = clean(raw.rubric);
    const generated = type === 'theory' && !rubric && Number.isFinite(marks) && marks > 0;
    if (generated) rubric = draftRubric(marks);
    return {
        sort_order: order,
        question_type: type,
        question_text: text || '[Edit this item: question boundary could not be identified.]',
        options,
        correct_option_index: type === 'mcq' ? raw.correct_option_index : null,
        model_answer: clean(raw.model_answer),
        marks: Number.isFinite(marks) && marks > 0 ? marks : null,
        difficulty,
        rubric,
        rubric_generated: generated,
        rubric_reviewed: false,
        source_location: source || {},
        validation_status: errors.length ? 'rejected' : generated ? 'warning' : 'valid',
        validation_errors: errors,
        include_in_publish: true,
    };
}

function parseNumberedSections(pages) {
    const lines = [];
    for (const page of pages) {
        for (const line of String(page.text || '').split(/\r?\n/)) {
            const text = clean(line);
            if (text) lines.push({ text, source: page.source });
        }
    }
    const sections = [];
    let current = null;
    for (const line of lines) {
        const start = line.text.match(/^(?:question\s*)?q?\s*(\d{1,4})\s*[).:-]\s*(.+)$/i);
        if (start) {
            if (current) sections.push(current);
            current = { first: start[2], lines: [], source: line.source };
        } else if (current) current.lines.push(line.text);
    }
    if (current) sections.push(current);
    if (!sections.length) {
        const sourceText = lines.map(item => item.text).join(' ');
        return [{ first: sourceText.slice(0, 4000), lines: [], source: lines[0]?.source || {}, unstructured: true }];
    }

    const seen = new Set();
    return sections.map((section, i) => {
        const questionParts = [];
        const options = [];
        let answer = '', modelAnswer = '', marks = '', difficulty = '', rubric = '';
        for (const line of [section.first, ...section.lines]) {
            const opt = line.match(/^(?:\(?([A-D])\)?[.)]|option\s+([A-D])\s*[:.)])\s*(.+)$/i);
            if (opt) { options.push(opt[3]); continue; }
            let m = line.match(/^(?:correct\s+answer|answer|ans)\s*[:-]\s*(.*)$/i);
            if (m) { answer = m[1]; continue; }
            m = line.match(/^(?:model\s+answer|suggested\s+answer|solution)\s*[:-]\s*(.*)$/i);
            if (m) { modelAnswer = m[1]; continue; }
            m = line.match(/^(?:marks?|m)\s*[:-]\s*(\d+(?:\.\d+)?)$/i);
            if (m) { marks = m[1]; continue; }
            m = line.match(/^difficulty\s*[:-]\s*(easy|medium|hard)$/i);
            if (m) { difficulty = m[1].toLowerCase(); continue; }
            m = line.match(/^rubric\s*[:-]\s*(.*)$/i);
            if (m) { rubric = m[1]; continue; }
            questionParts.push(line);
        }
        const type = options.length ? 'mcq' : 'theory';
        const item = normalizeQuestion({
            question_type: type,
            question_text: questionParts.join(' ').slice(0, 4000),
            options: options.slice(0, 4),
            correct_option_index: type === 'mcq' ? optionIndex(answer, options) : null,
            model_answer: modelAnswer || (type === 'theory' ? answer : ''),
            marks, difficulty, rubric,
        }, section.source, i + 1, seen);
        if (options.length && options.length !== 4) {
            item.validation_errors.push('Found ' + options.length + ' options; expected four.');
            item.validation_status = 'rejected';
        }
        if (section.unstructured) {
            item.validation_errors.push('Question boundary not detected. Use one numbered question per section.');
            item.validation_status = 'rejected';
        }
        return item;
    });
}

export async function parseQuestionBankForReview(record, buffer) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Original source file is empty.');
    let questions;
    if (record.file_extension === 'csv') {
        const source = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        const rows = parse(source, { bom: true, skip_empty_lines: true, trim: true });
        const headers = rows[0].map(value => String(value || '').trim().toLowerCase());
        if (headers.length !== QUESTION_BANK_CSV_HEADERS.length
            || headers.some((value, i) => value !== QUESTION_BANK_CSV_HEADERS[i])) {
            throw new Error('CSV headers do not match the accepted template.');
        }
        const seen = new Set();
        questions = rows.slice(1).map((row, i) => {
            const r = Object.fromEntries(QUESTION_BANK_CSV_HEADERS.map((header, index) => [header, String(row[index] ?? '').trim()]));
            const options = [r.option_a, r.option_b, r.option_c, r.option_d];
            return normalizeQuestion({
                question_type: r.question_type,
                question_text: r.question,
                options,
                correct_option_index: r.question_type === 'mcq' ? optionIndex(r.correct_option, options) : null,
                model_answer: r.model_answer,
                marks: r.marks,
                difficulty: r.difficulty,
                rubric: r.rubric,
            }, { row: i + 2 }, i + 1, seen);
        });
    } else if (record.file_extension === 'pdf') {
        const getDocument = await getPdfJsDocument();
        const pdf = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false }).promise;
        if (pdf.numPages > 50) { await pdf.destroy(); throw new Error('PDF exceeds 50 pages.'); }
        const pages = [];
        for (let n = 1; n <= pdf.numPages; n += 1) {
            const page = await pdf.getPage(n);
            const content = await page.getTextContent();
            const linesByY = new Map();
            for (const item of content.items) {
                if (typeof item.str !== 'string' || !item.str.trim()) continue;
                const y = Math.round(Number(item.transform?.[5] || 0));
                if (!linesByY.has(y)) linesByY.set(y, []);
                linesByY.get(y).push(item);
            }
            const text = [...linesByY.entries()]
                .sort((a, b) => b[0] - a[0])
                .map(([, items]) => items.sort((a, b) => Number(a.transform?.[4] || 0) - Number(b.transform?.[4] || 0))
                    .map(item => item.str).join(' '))
                .join('\n');
            pages.push({ text, source: { page: n } });
        }
        await pdf.destroy();
        questions = parseNumberedSections(pages);
    } else if (record.file_extension === 'docx') {
        const result = await mammoth.extractRawText({ buffer });
        questions = parseNumberedSections(String(result.value || '').split(/\r?\n/).map((text, i) => ({
            text, source: { paragraph: i + 1 },
        })));
    } else throw new Error('Unsupported question-bank file type.');
    if (!questions.length) throw new Error('No question items could be extracted.');
    return questions;
}
