import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { QUESTION_BANK_CSV_HEADERS } from '../api/_lib/admin-course-upload-validation.js';
import { parseQuestionBankForReview } from '../api/_lib/question-bank-parser.js';

const record = { kind: 'question_bank', file_extension: 'csv', mime_type: 'text/csv' };

function csv(rows) {
    return Buffer.from([QUESTION_BANK_CSV_HEADERS.join(','), ...rows].join('\n'), 'utf8');
}

describe('question-bank Phase 3 parser', () => {
    it('normalizes MCQ answers to a zero-based option index and preserves CSV source rows', async () => {
        const questions = await parseQuestionBankForReview(record, csv([
            'mcq,"Which structure follows FIFO?","Stack","Queue","Tree","Graph",B,,1,easy,',
        ]));
        expect(questions).toHaveLength(1);
        expect(questions[0]).toMatchObject({
            question_type: 'mcq', correct_option_index: 1,
            validation_status: 'valid', source_location: { row: 2 },
        });
        expect(questions[0].options).toEqual(['Stack', 'Queue', 'Tree', 'Graph']);
    });

    it('creates a draft rubric for theory questions and flags it for admin review', async () => {
        const questions = await parseQuestionBankForReview(record, csv([
            'theory,"Explain FIFO and LIFO.",,,,,,"FIFO processes first-in items first; LIFO processes last-in items first.",4,medium,',
        ]));
        expect(questions[0]).toMatchObject({
            question_type: 'theory', validation_status: 'warning',
            rubric_generated: true, rubric_reviewed: false, source_location: { row: 2 },
        });
        expect(questions[0].rubric).toContain('Accuracy and correctness: 2.4 marks');
    });

    it('keeps invalid and duplicate questions visible as rejected items', async () => {
        const questions = await parseQuestionBankForReview(record, csv([
            'mcq,"Duplicate?","A","B","C","D",Z,,1,easy,',
            'mcq,"Duplicate?","A","B","C","D",A,,1,easy,',
        ]));
        expect(questions).toHaveLength(2);
        expect(questions[0].validation_status).toBe('rejected');
        expect(questions[0].validation_errors).toContain('Correct option is missing or ambiguous.');
        expect(questions[1].validation_errors).toContain('Duplicate question text.');
    });

    it('preserves DOCX paragraph source locations when detecting numbered sections', async () => {
        const zip = new JSZip();
        zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
        const paragraphs = [
            'Q1. Which collection follows FIFO?', 'A. Stack', 'B. Queue',
            'C. Tree', 'D. Graph', 'Answer: B', 'Marks: 1', 'Difficulty: easy',
        ].map(text => '<w:p><w:r><w:t>' + text + '</w:t></w:r></w:p>').join('');
        zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + paragraphs + '</w:body></w:document>');
        const buffer = await zip.generateAsync({ type: 'nodebuffer' });
        const questions = await parseQuestionBankForReview({ ...record, file_extension: 'docx' }, buffer);
        expect(questions[0]).toMatchObject({
            question_type: 'mcq', correct_option_index: 1,
            source_location: { paragraph: 1 }, validation_status: 'valid',
        });
    });
});
