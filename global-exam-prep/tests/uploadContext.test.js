import { describe, expect, it } from 'vitest';
import { countReadableTextChars, prepareUploadContext, UPLOAD_CONTEXT_MAX_CHARS, UPLOAD_MCQ_CONTEXT_MAX_CHARS } from '../src/utils/uploadContext';

function makePagedText(prefix, count, fillerLength = 900) {
    return Array.from({ length: count }, (_, index) => {
        const page = index + 1;
        return `[Page ${page}]\n${prefix}_PAGE_${page}_START ${'study-material '.repeat(Math.ceil(fillerLength / 15))} ${prefix}_PAGE_${page}_END`;
    }).join('\n\n');
}

describe('uploadContext', () => {
    it('uses a 30,000-character default upload budget', () => {
        expect(UPLOAD_CONTEXT_MAX_CHARS).toBe(12000);
        expect(UPLOAD_MCQ_CONTEXT_MAX_CHARS).toBe(9000);
    });

    it('preserves all extracted text when the upload fits within the budget', () => {
        const text = 'Chapter 1: Data structures.\n\nStacks and queues are linear data structures.';
        const result = prepareUploadContext([{ name: 'notes.txt', text }], 2000);

        expect(result.truncated).toBe(false);
        expect(result.text).toBe(`=== notes.txt ===\n${text}`);
        expect(result.text).toContain('Stacks and queues');
    });

    it('keeps an excerpt within budget and samples the first, middle, and last PDF pages', () => {
        const text = makePagedText('OPERATING_SYSTEMS', 40);
        const result = prepareUploadContext([{ name: 'os-notes.pdf', text }], 3000);

        expect(result.truncated).toBe(true);
        expect(result.text.length).toBeLessThanOrEqual(3000);
        expect(result.text).toContain('=== os-notes.pdf ===');
        expect(result.text).toContain('[Page 1]');
        expect(result.text).toContain('[Page 20]');
        expect(result.text).toContain('[Page 40]');
        expect(result.text).toContain('Some source text was omitted');
    });

    it('allocates context across multiple files instead of allowing the first file to consume it all', () => {
        const first = makePagedText('DATABASES', 20);
        const second = makePagedText('NETWORKING', 20);
        const result = prepareUploadContext([
            { name: 'database.pdf', text: first },
            { name: 'networking.pdf', text: second },
        ], 5000);

        expect(result.truncated).toBe(true);
        expect(result.text.length).toBeLessThanOrEqual(5000);
        expect(result.text).toContain('=== database.pdf ===');
        expect(result.text).toContain('=== networking.pdf ===');
        expect(result.text).toContain('[Page 10]');
        expect(result.text).toContain('DATABASES_PAGE_1_START');
        expect(result.text).toContain('NETWORKING_PAGE_20_END');
    });

    it('samples both beginning and end when an oversized non-PDF text file has no page labels', () => {
        const text = `DOCUMENT_START ${'long study text '.repeat(2500)} DOCUMENT_END`;
        const result = prepareUploadContext([{ name: 'long.txt', text }], 4000);

        expect(result.truncated).toBe(true);
        expect(result.text.length).toBeLessThanOrEqual(4000);
        expect(result.text).toContain('DOCUMENT_START');
        expect(result.text).toContain('DOCUMENT_END');
    });

    it('counts actual extracted text rather than page labels from scanned PDFs', () => {
        expect(countReadableTextChars([
            { name: 'scan.pdf', text: '[Page 1]\n\n[Page 2]\n' },
        ])).toBe(0);
        expect(countReadableTextChars([
            { name: 'notes.pdf', text: '[Page 1]\nActual readable content' },
        ])).toBe('Actual readable content'.length);
    });

    it('handles an empty file list without throwing', () => {
        const result = prepareUploadContext([]);
        expect(result.text).toBe('');
        expect(result.truncated).toBe(false);
        expect(result.originalChars).toBe(0);
    });
});
