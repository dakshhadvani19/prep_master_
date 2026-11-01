import { Buffer } from 'node:buffer';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
    MIME_BY_EXTENSION,
    QUESTION_BANK_CSV_HEADERS,
    UploadValidationError,
    validateCourseUpload,
    validateUploadMetadata,
} from '../api/_lib/admin-course-upload-validation.js';


function makeMinimalPdf(text) {
    const stream = 'BT /F1 12 Tf 20 100 Td (' + text + ') Tj ET';
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        '<< /Length ' + Buffer.byteLength(stream, 'binary') + ' >>\nstream\n' + stream + '\nendstream',
    ];
    let body = '%PDF-1.4\n';
    const offsets = [0];
    for (let i = 0; i < objects.length; i += 1) {
        offsets.push(Buffer.byteLength(body, 'binary'));
        body += (i + 1) + ' 0 obj\n' + objects[i] + '\nendobj\n';
    }
    const xrefOffset = Buffer.byteLength(body, 'binary');
    body += 'xref\n0 6\n0000000000 65535 f \n';
    for (let i = 1; i < offsets.length; i += 1) {
        body += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    }
    body += 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF';
    return Buffer.from(body, 'binary');
}

async function makeMinimalDocx(text) {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
    zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>' + text + '</w:t></w:r></w:p></w:body></w:document>');
    return zip.generateAsync({ type: 'nodebuffer' });
}

const validCsv = [
    QUESTION_BANK_CSV_HEADERS.join(','),
    'mcq,"Which data structure follows FIFO order?","Stack","Queue","Tree","Graph",B,,1,easy,',
    'theory,"Explain the difference between a stack and a queue.",,,,,,"A stack follows LIFO while a queue follows FIFO.",4,medium,"Define both ordering rules and give one example."',
].join('\n');

describe('admin course upload metadata validation', () => {
    it('normalizes PDF, DOCX and CSV MIME types from their extension', () => {
        expect(validateUploadMetadata({
            kind: 'syllabus',
            fileName: 'Semester 1 syllabus.pdf',
            mimeType: 'application/octet-stream',
            sizeBytes: 2048,
        })).toEqual({
            fileName: 'Semester 1 syllabus.pdf',
            extension: 'pdf',
            mimeType: MIME_BY_EXTENSION.pdf,
            sizeBytes: 2048,
        });
        expect(validateUploadMetadata({
            kind: 'question_bank',
            fileName: 'questions.csv',
            mimeType: 'application/vnd.ms-excel',
            sizeBytes: 100,
        }).mimeType).toBe('text/csv');
    });

    it('rejects unsupported extensions, zero-byte and oversized files', () => {
        expect(() => validateUploadMetadata({
            kind: 'syllabus', fileName: 'notes.csv', mimeType: 'text/csv', sizeBytes: 100,
        })).toThrow(/Syllabus files must be PDF or DOCX/);
        expect(() => validateUploadMetadata({
            kind: 'question_bank', fileName: 'questions.csv', mimeType: 'text/csv', sizeBytes: 0,
        })).toThrow(/larger than 0 bytes/);
        expect(() => validateUploadMetadata({
            kind: 'question_bank', fileName: 'questions.csv', mimeType: 'text/csv', sizeBytes: 20 * 1024 * 1024 + 1,
        })).toThrow(/20 MB/);
    });

    it('rejects extension and MIME mismatches and unsafe names', () => {
        expect(() => validateUploadMetadata({
            kind: 'question_bank', fileName: 'questions.pdf', mimeType: 'text/csv', sizeBytes: 100,
        })).toThrow(/extension and MIME type do not match/);
        expect(validateUploadMetadata({
            kind: 'question_bank', fileName: 'C:\\fakepath\\questions.csv', mimeType: 'text/csv', sizeBytes: 100,
        }).fileName).toBe('questions.csv');
    });
});

describe('question bank CSV validation', () => {
    const record = {
        kind: 'question_bank',
        file_extension: 'csv',
        mime_type: 'text/csv',
    };

    it('accepts a correctly shaped CSV with both MCQ and theory rows', async () => {
        const result = await validateCourseUpload(record, Buffer.from(validCsv, 'utf8'));
        expect(result.row_count).toBe(2);
        expect(result.validation_details.mcq_count).toBe(1);
        expect(result.validation_details.theory_count).toBe(1);
        expect(result.preview_text).toContain('Which data structure follows FIFO order?');
        expect(result.preview_text).toContain('Explain the difference between a stack and a queue.');
        expect(result.word_count).toBeGreaterThan(0);
    });

    it('rejects a wrong header order and incomplete MCQ options', async () => {
        const wrongHeaders = 'question,question_type\nExample,mcq';
        await expect(validateCourseUpload(record, Buffer.from(wrongHeaders)))
            .rejects.toThrow(/columns must match the template exactly/);

        const invalidRow = [
            QUESTION_BANK_CSV_HEADERS.join(','),
            'mcq,"Question?","One",,"Three","Four",A,,1,easy,',
        ].join('\n');
        await expect(validateCourseUpload(record, Buffer.from(invalidRow)))
            .rejects.toThrow(/need all four options/);
    });

    it('rejects duplicate questions and theory rows without a model answer', async () => {
        const duplicates = [
            QUESTION_BANK_CSV_HEADERS.join(','),
            'theory,"Repeated question",,,,,,"Answer one",2,easy,',
            'theory,"Repeated question",,,,,,"Answer two",2,easy,',
        ].join('\n');
        await expect(validateCourseUpload(record, Buffer.from(duplicates)))
            .rejects.toThrow(/duplicates an earlier row/);

        const noModelAnswer = [
            QUESTION_BANK_CSV_HEADERS.join(','),
            'theory,"Explain this topic.",,,,,,,4,medium,',
        ].join('\n');
        await expect(validateCourseUpload(record, Buffer.from(noModelAnswer)))
            .rejects.toThrow(/theory rows need a model_answer/);
    });

    it('rejects invalid UTF-8, empty files and question banks without content', async () => {
        await expect(validateCourseUpload(record, Buffer.alloc(0)))
            .rejects.toThrow(/empty/);
        await expect(validateCourseUpload(record, Buffer.from([0xff, 0xfe, 0xfd])))
            .rejects.toThrow(/UTF-8/);
        await expect(validateCourseUpload(record, Buffer.from(QUESTION_BANK_CSV_HEADERS.join(','))))
            .rejects.toThrow(/at least one question/);
    });

    it('enforces the 30,000-character extracted-text limit', async () => {
        const oversizedDocx = await makeMinimalDocx('a'.repeat(30_001));
        await expect(validateCourseUpload({
            kind: 'syllabus',
            file_extension: 'docx',
            mime_type: MIME_BY_EXTENSION.docx,
        }, oversizedDocx)).rejects.toThrow(/30,001 characters/);
    });

    it('rejects a CSV attached to a syllabus upload', async () => {
        await expect(validateCourseUpload({
            ...record,
            kind: 'syllabus',
        }, Buffer.from(validCsv))).rejects.toThrow(/Syllabus files must be PDF or DOCX/);
    });
});

describe('document validation guards', () => {
    it('extracts text previews from real text-based PDF and DOCX containers', async () => {
        const pdf = await validateCourseUpload({
            kind: 'syllabus', file_extension: 'pdf', mime_type: MIME_BY_EXTENSION.pdf,
        }, makeMinimalPdf('Hello syllabus extraction world'));
        expect(pdf.page_count).toBe(1);
        expect(pdf.preview_text).toContain('Hello syllabus extraction world');

        const docxBuffer = await makeMinimalDocx('DOCX syllabus extraction works');
        const docx = await validateCourseUpload({
            kind: 'syllabus', file_extension: 'docx', mime_type: MIME_BY_EXTENSION.docx,
        }, docxBuffer);
        expect(docx.preview_text).toContain('DOCX syllabus extraction works');
        expect(docx.word_count).toBe(4);
    });

    it('rejects a PDF with an invalid signature and a corrupt DOCX', async () => {
        await expect(validateCourseUpload({
            kind: 'syllabus',
            file_extension: 'pdf',
            mime_type: MIME_BY_EXTENSION.pdf,
        }, Buffer.from('not a PDF document'))).rejects.toThrow(/valid PDF header/);

        await expect(validateCourseUpload({
            kind: 'syllabus',
            file_extension: 'docx',
            mime_type: MIME_BY_EXTENSION.docx,
        }, Buffer.from('PK but not a zip archive'))).rejects.toThrow(/damaged or could not be read/);
    });

    it('requires the normalized MIME type to agree with the recorded extension', async () => {
        await expect(validateCourseUpload({
            kind: 'question_bank',
            file_extension: 'pdf',
            mime_type: 'text/csv',
        }, Buffer.from('%PDF-'))).rejects.toThrow(UploadValidationError);
    });
});

