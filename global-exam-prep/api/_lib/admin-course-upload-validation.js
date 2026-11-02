import { Buffer } from 'node:buffer';
import { parse } from 'csv-parse/sync';
import mammoth from 'mammoth';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_PAGES = 50;
export const MAX_DOCUMENT_CHARS = 30_000;
export const MAX_CSV_ROWS = 10_000;

export const MIME_BY_EXTENSION = Object.freeze({
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    csv: 'text/csv',
});

export const QUESTION_BANK_CSV_HEADERS = Object.freeze([
    'question_type', 'question', 'option_a', 'option_b', 'option_c',
    'option_d', 'correct_option', 'model_answer', 'marks', 'difficulty', 'rubric',
]);

export class UploadValidationError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = 'UploadValidationError';
        this.details = details;
    }
}

function wordCount(text) {
    const matches = String(text || '').match(/\S+/g);
    return matches ? matches.length : 0;
}

function assertSize(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new UploadValidationError('The uploaded file is empty.');
    }
    if (buffer.length > MAX_UPLOAD_BYTES) {
        throw new UploadValidationError('Files must be 20 MB or smaller.');
    }
}

function assertCharacterLimit(text) {
    const content = String(text || '').trim();
    if (!content) throw new UploadValidationError('No readable text was found in this file.');
    const characterCount = content.length;
    if (characterCount > MAX_DOCUMENT_CHARS) {
        throw new UploadValidationError(
            'The extracted document contains ' + characterCount.toLocaleString()
            + ' characters. The limit is ' + MAX_DOCUMENT_CHARS.toLocaleString() + '.',
            { character_count: characterCount, word_count: wordCount(content) },
        );
    }
    return wordCount(content);
}

async function extractPdf(buffer) {
    if (buffer.length < 5 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
        throw new UploadValidationError('This file does not contain a valid PDF header.');
    }

    // Initialize Node geometry globals before PDF.js evaluates its legacy bundle.
    const getDocument = await getPdfJsDocument();
    let pdf;
    try {
        const task = getDocument({
            data: new Uint8Array(buffer),
            useSystemFonts: true,
            isEvalSupported: false,
        });
        pdf = await task.promise;
        if (!Number.isInteger(pdf.numPages) || pdf.numPages < 1) {
            throw new UploadValidationError('The PDF has no readable pages.');
        }
        if (pdf.numPages > MAX_PDF_PAGES) {
            throw new UploadValidationError(
                'The PDF has ' + pdf.numPages + ' pages. The limit is ' + MAX_PDF_PAGES + '.',
                { page_count: pdf.numPages },
            );
        }

        const pageTexts = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
            const page = await pdf.getPage(pageNumber);
            const content = await page.getTextContent();
            pageTexts.push(content.items
                .filter(item => typeof item.str === 'string')
                .map(item => item.str)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim());
            page.cleanup?.();
        }
        return { text: pageTexts.join('\n\n').trim(), pageCount: pdf.numPages };
    } catch (error) {
        if (error instanceof UploadValidationError) throw error;
        throw new UploadValidationError('The PDF is damaged, encrypted, or could not be read. Export a fresh, text-readable PDF and try again.');
    } finally {
        if (pdf?.destroy) await pdf.destroy().catch(() => {});
    }
}

async function extractDocx(buffer) {
    if (buffer.length < 4 || buffer.subarray(0, 2).toString('hex') !== '504b') {
        throw new UploadValidationError('This file is not a valid DOCX document.');
    }
    try {
        const result = await mammoth.extractRawText({ buffer });
        const text = String(result.value || '').split(String.fromCharCode(0)).join('').trim();
        if (!text) throw new UploadValidationError('The DOCX contains no readable document text.');
        return { text, messages: (result.messages || []).map(item => item.type).slice(0, 20) };
    } catch (error) {
        if (error instanceof UploadValidationError) throw error;
        throw new UploadValidationError('The DOCX file is damaged or could not be read. Save it again as a .docx document and retry.');
    }
}

function parseQuestionBankCsv(buffer) {
    let source;
    try {
        source = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
        throw new UploadValidationError('The CSV must be saved as UTF-8 text.');
    }

    if (source.includes(String.fromCharCode(0))) {
        throw new UploadValidationError('The CSV contains binary or invalid text data.');
    }
    const firstNonSpace = source.trimStart().slice(0, 30).toLowerCase();
    if (firstNonSpace.startsWith('<!doctype html') || firstNonSpace.startsWith('<html')) {
        throw new UploadValidationError('The selected file is an HTML page, not a CSV question bank.');
    }

    let rows;
    try {
        rows = parse(source, {
            bom: true,
            skip_empty_lines: true,
            trim: true,
            relax_column_count: false,
            max_record_size: 100_000,
        });
    } catch {
        throw new UploadValidationError('The CSV has invalid quoting or inconsistent column counts. Use the provided template and retry.');
    }

    if (!Array.isArray(rows) || rows.length < 2) {
        throw new UploadValidationError('The CSV must contain its header row and at least one question.');
    }

    const headers = rows[0].map(value => String(value || '').trim().toLowerCase());
    if (headers.length !== QUESTION_BANK_CSV_HEADERS.length
        || headers.some((value, index) => value !== QUESTION_BANK_CSV_HEADERS[index])) {
        throw new UploadValidationError(
            'The CSV columns must match the template exactly: '
            + QUESTION_BANK_CSV_HEADERS.join(', ') + '.',
            { expected_headers: QUESTION_BANK_CSV_HEADERS },
        );
    }

    const records = rows.slice(1);
    if (records.length > MAX_CSV_ROWS) {
        throw new UploadValidationError(
            'The CSV contains ' + records.length.toLocaleString() + ' questions. The limit is '
            + MAX_CSV_ROWS.toLocaleString() + '.',
            { row_count: records.length },
        );
    }

    const seenQuestions = new Set();
    let mcqCount = 0;
    let theoryCount = 0;
    const preview = [];

    for (let index = 0; index < records.length; index += 1) {
        const rowNumber = index + 2;
        const values = records[index];
        const record = Object.fromEntries(QUESTION_BANK_CSV_HEADERS.map((header, column) => [
            header,
            String(values[column] ?? '').trim(),
        ]));

        if (record.question_type !== 'mcq' && record.question_type !== 'theory') {
            throw new UploadValidationError('Row ' + rowNumber + ': question_type must be mcq or theory.');
        }
        if (!record.question || record.question.length > 2000) {
            throw new UploadValidationError('Row ' + rowNumber + ': question is required and must be 2,000 characters or fewer.');
        }
        const normalizedQuestion = record.question.toLowerCase().replace(/\s+/g, ' ').trim();
        if (seenQuestions.has(normalizedQuestion)) {
            throw new UploadValidationError('Row ' + rowNumber + ': this question duplicates an earlier row.');
        }
        seenQuestions.add(normalizedQuestion);

        const marks = Number(record.marks);
        if (!record.marks || !Number.isFinite(marks) || marks <= 0 || marks > 100) {
            throw new UploadValidationError('Row ' + rowNumber + ': marks must be a number greater than 0 and no greater than 100.');
        }
        if (!['easy', 'medium', 'hard'].includes(record.difficulty.toLowerCase())) {
            throw new UploadValidationError('Row ' + rowNumber + ': difficulty must be easy, medium, or hard.');
        }
        if (record.model_answer.length > 8000 || record.rubric.length > 3000) {
            throw new UploadValidationError('Row ' + rowNumber + ': model_answer is limited to 8,000 characters and rubric to 3,000.');
        }

        if (record.question_type === 'mcq') {
            const options = [record.option_a, record.option_b, record.option_c, record.option_d];
            if (options.some(option => !option || option.length > 1000)) {
                throw new UploadValidationError('Row ' + rowNumber + ': MCQ questions need all four options (A–D), each 1,000 characters or fewer.');
            }
            if (!['A', 'B', 'C', 'D'].includes(record.correct_option.toUpperCase())) {
                throw new UploadValidationError('Row ' + rowNumber + ': correct_option must be A, B, C, or D.');
            }
            mcqCount += 1;
        } else {
            if (record.option_a || record.option_b || record.option_c || record.option_d || record.correct_option) {
                throw new UploadValidationError('Row ' + rowNumber + ': theory rows must leave option_a–option_d and correct_option blank.');
            }
            if (!record.model_answer) {
                throw new UploadValidationError('Row ' + rowNumber + ': theory rows need a model_answer.');
            }
            theoryCount += 1;
        }

        if (preview.length < 3) {
            preview.push(record.question_type.toUpperCase() + ' · ' + record.question + '\n'
                + (record.question_type === 'mcq'
                    ? 'A. ' + record.option_a + '  B. ' + record.option_b + '  C. ' + record.option_c + '  D. ' + record.option_d
                        + '\nAnswer: ' + record.correct_option.toUpperCase()
                    : 'Model answer: ' + record.model_answer.slice(0, 400)));
        }
    }

    const text = records.map(row => row.join(' ')).join('\n');
    return {
        text,
        rowCount: records.length,
        wordCount: wordCount(text),
        previewText: preview.join('\n\n'),
        details: {
            csv_headers: QUESTION_BANK_CSV_HEADERS,
            mcq_count: mcqCount,
            theory_count: theoryCount,
        },
    };
}

export async function validateCourseUpload(record, buffer) {
    assertSize(buffer);
    const extension = String(record.file_extension || '').toLowerCase();
    if (record.mime_type !== MIME_BY_EXTENSION[extension]) {
        throw new UploadValidationError('The file type does not match its recorded extension.');
    }
    if (record.kind === 'syllabus' && extension === 'csv') {
        throw new UploadValidationError('Syllabus files must be PDF or DOCX.');
    }

    if (extension === 'csv') {
        if (record.kind !== 'question_bank') {
            throw new UploadValidationError('CSV is accepted only for question-bank uploads.');
        }
        const parsed = parseQuestionBankCsv(buffer);
        if (parsed.text.length > MAX_DOCUMENT_CHARS) {
            throw new UploadValidationError(
                'The CSV contains ' + parsed.text.length.toLocaleString() + ' characters. The limit is '
                + MAX_DOCUMENT_CHARS.toLocaleString() + '.',
                {
                    character_count: parsed.text.length,
                    word_count: parsed.wordCount,
                    row_count: parsed.rowCount,
                },
            );
        }
        return {
            page_count: null,
            word_count: parsed.wordCount,
            row_count: parsed.rowCount,
            preview_text: parsed.previewText.slice(0, 4000),
            validation_details: parsed.details,
        };
    }

    const extracted = extension === 'pdf'
        ? await extractPdf(buffer)
        : await extractDocx(buffer);
    const count = assertCharacterLimit(extracted.text);
    return {
        page_count: extracted.pageCount ?? null,
        word_count: count,
        row_count: null,
        preview_text: extracted.text.slice(0, 4000),
        validation_details: extension === 'pdf'
            ? { extracted_text: true, page_count: extracted.pageCount }
            : { extracted_text: true, mammoth_messages: extracted.messages },
    };
}

export function validateUploadMetadata({ kind, fileName, mimeType, sizeBytes }) {
    const name = String(fileName || '').replace(/^.*[\\/]/, '').trim();
    if (!name || name.length > 180) {
        throw new UploadValidationError('Choose a file with a name between 1 and 180 characters.');
    }
    const extension = name.split('.').pop()?.toLowerCase() || '';
    const allowedExtensions = kind === 'syllabus' ? ['pdf', 'docx']
        : kind === 'question_bank' ? ['pdf', 'docx', 'csv'] : [];
    if (!allowedExtensions.includes(extension)) {
        throw new UploadValidationError(kind === 'syllabus'
            ? 'Syllabus files must be PDF or DOCX.'
            : 'Question banks must be PDF, DOCX, or CSV.');
    }
    const size = Number(sizeBytes);
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_UPLOAD_BYTES) {
        throw new UploadValidationError('Files must be larger than 0 bytes and no larger than 20 MB.');
    }

    const expectedMime = MIME_BY_EXTENSION[extension];
    const suppliedMime = String(mimeType || '').toLowerCase().trim();
    const compatibleMime = !suppliedMime
        || suppliedMime === 'application/octet-stream'
        || suppliedMime === expectedMime
        || (extension === 'csv' && suppliedMime === 'application/vnd.ms-excel');
    if (!compatibleMime) {
        throw new UploadValidationError('The selected file extension and MIME type do not match.');
    }
    return {
        fileName: name,
        extension,
        mimeType: expectedMime,
        sizeBytes: size,
    };
}

