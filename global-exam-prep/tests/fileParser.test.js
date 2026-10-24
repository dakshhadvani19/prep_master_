import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDocument } from 'pdfjs-dist';
import { extractPdfText, MAX_PDF_PAGES } from '../src/utils/fileParser';

vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: { workerSrc: null },
    getDocument: vi.fn(),
}));

const STUDY_PDF_OPTIONS = { maxPages: MAX_PDF_PAGES, includePageLabels: true };

function makePdf(numPages, { pageText = page => `Page content ${page}`, emptyPages = [] } = {}) {
    const getPage = vi.fn(async pageNumber => ({
        getTextContent: async () => ({
            items: emptyPages.includes(pageNumber) ? [] : [{ str: pageText(pageNumber) }],
        }),
    }));
    const destroy = vi.fn(async () => {});
    return {
        document: { numPages, getPage, destroy },
        getPage,
        destroy,
    };
}

describe('fileParser PDF extraction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('accepts a PDF with exactly 50 pages and preserves page labels/order', async () => {
        expect(MAX_PDF_PAGES).toBe(50);
        const pdf = makePdf(50);
        getDocument.mockReturnValue({ promise: Promise.resolve(pdf.document) });

        const text = await extractPdfText(new ArrayBuffer(8), STUDY_PDF_OPTIONS);

        expect(pdf.getPage).toHaveBeenCalledTimes(50);
        expect(text).toContain('[Page 1]\nPage content 1');
        expect(text).toContain('[Page 50]\nPage content 50');
        expect(text.indexOf('[Page 1]')).toBeLessThan(text.indexOf('[Page 2]'));
        expect(text.indexOf('[Page 49]')).toBeLessThan(text.indexOf('[Page 50]'));
    });

    it('rejects a 51-page PDF before extracting any page text', async () => {
        const pdf = makePdf(51);
        getDocument.mockReturnValue({ promise: Promise.resolve(pdf.document) });

        await expect(extractPdfText(new ArrayBuffer(8), STUDY_PDF_OPTIONS)).rejects.toThrow(/51 pages.*maximum allowed is 50/i);
        expect(pdf.getPage).not.toHaveBeenCalled();
        expect(pdf.destroy).toHaveBeenCalledTimes(1);
    });

    it('preserves an empty page without crashing', async () => {
        const pdf = makePdf(3, { emptyPages: [2] });
        getDocument.mockReturnValue({ promise: Promise.resolve(pdf.document) });

        const text = await extractPdfText(new ArrayBuffer(8), STUDY_PDF_OPTIONS);

        expect(text).toContain('[Page 2]\n');
        expect(text).toContain('[Page 3]\nPage content 3');
    });

    it('reports a clear error for password-protected PDFs', async () => {
        const error = new Error('No password given');
        error.name = 'PasswordException';
        getDocument.mockReturnValue({ promise: Promise.reject(error) });

        await expect(extractPdfText(new ArrayBuffer(8), STUDY_PDF_OPTIONS)).rejects.toThrow(/password-protected or encrypted/i);
    });

    it('reports a clear error for malformed PDFs', async () => {
        const error = new Error('Invalid PDF structure');
        error.name = 'InvalidPDFException';
        getDocument.mockReturnValue({ promise: Promise.reject(error) });

        await expect(extractPdfText(new ArrayBuffer(8), STUDY_PDF_OPTIONS)).rejects.toThrow(/invalid or damaged/i);
    });

    it('preserves legacy extraction behavior for other callers by default', async () => {
        const pdf = makePdf(2);
        getDocument.mockReturnValue({ promise: Promise.resolve(pdf.document) });

        const text = await extractPdfText(new ArrayBuffer(8));

        expect(text).toBe('Page content 1\\n\\nPage content 2');
        expect(text).not.toContain('[Page 1]');
    });
});
