import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import JSZip from 'jszip';

// Keep the page limit explicit so UI and tests can use the same policy.
export const MAX_PDF_PAGES = 50;
export const MAX_UPLOAD_FILE_BYTES = 10 * 1024 * 1024;

// Use local worker bundled by Vite (avoids CDN version mismatch issues)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

function toPdfReadError(error) {
    const message = String(error?.message || error || '');
    if (/password|encrypted|PasswordException/i.test(message) || error?.name === 'PasswordException') {
        return new Error('This PDF is password-protected or encrypted. Remove its password and upload it again.');
    }
    if (/invalid pdf|missing pdf|formaterror|unexpected end|malformed/i.test(message) || error?.name === 'InvalidPDFException') {
        return new Error('This PDF is invalid or damaged and could not be read. Please try another PDF.');
    }
    return new Error('Could not read this PDF. It may be damaged, encrypted, or unsupported. Please try another PDF.');
}

/**
 * Extract plain text from a PDF ArrayBuffer using PDF.js.
 * Optional page limits and labels are enabled for study-material uploads only;
 * other callers (such as the admin syllabus uploader) retain legacy behavior.
 */
export async function extractPdfText(arrayBuffer, { maxPages = null, includePageLabels = false } = {}) {
    let pdf;
    try {
        pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    } catch (error) {
        throw toPdfReadError(error);
    }

    if (!Number.isInteger(pdf?.numPages) || pdf.numPages < 1) {
        throw new Error('This PDF does not contain any readable pages.');
    }

    if (Number.isInteger(maxPages) && maxPages > 0 && pdf.numPages > maxPages) {
        try {
            await pdf.destroy?.();
        } catch {
            // The page-count rejection is the important user-facing result.
        }
        throw new Error(`This PDF has ${pdf.numPages} pages. The maximum allowed is ${maxPages} pages per PDF.`);
    }

    const pages = [];
    try {
        for (let i = 1; i <= pdf.numPages; i += 1) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const pageText = (content?.items || [])
                .map(item => typeof item?.str === 'string' ? item.str : '')
                .filter(Boolean)
                .join(' ')
                .trim();
            pages.push(includePageLabels ? `[Page ${i}]\n${pageText}` : pageText);
        }
    } catch (error) {
        throw toPdfReadError(error);
    }

    return pages.join('\n\n');
}

/**
 * Extract plain text from a PPTX file (it's a ZIP of XML files)
 */
export async function extractPptxText(arrayBuffer) {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const slideFiles = Object.keys(zip.files).filter(
        name => name.startsWith('ppt/slides/slide') && name.endsWith('.xml')
    ).sort();

    const texts = [];
    for (const slideFile of slideFiles) {
        const xmlStr = await zip.files[slideFile].async('text');
        // Use DOM parser to extract all <a:t> text nodes
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlStr, 'text/xml');
        const textNodes = doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 't');
        const slideText = Array.from(textNodes).map(n => n.textContent).join(' ');
        if (slideText.trim()) texts.push(slideText);
    }
    return texts.join('\n\n');
}

/**
 * Extract plain text from a CSV file
 */
export function extractCsvText(text) {
    // Parse CSV into readable prose so AI can understand it as study material
    const lines = text.trim().split('\n');
    if (lines.length === 0) return '';
    const header = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    const rows = lines.slice(1).map(line => {
        const cells = line.split(',').map(c => c.replace(/"/g, '').trim());
        return header.map((h, i) => `${h}: ${cells[i] || ''}`).join(', ');
    });
    return `Columns: ${header.join(', ')}\n\n${rows.join('\n')}`;
}

/**
 * Master file text extractor — dispatches to the right parser
 */
export async function extractTextFromFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();

    if (file.size > MAX_UPLOAD_FILE_BYTES) {
        throw new Error(`File "${file.name}" is too large (max 10 MB). Please upload a smaller file.`);
    }

    if (ext === 'pdf') {
        const buf = await file.arrayBuffer();
        return await extractPdfText(buf, { maxPages: MAX_PDF_PAGES, includePageLabels: true });
    }

    if (ext === 'pptx') {
        const buf = await file.arrayBuffer();
        return await extractPptxText(buf);
    }

    if (ext === 'csv') {
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(extractCsvText(e.target.result));
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    if (ext === 'txt') {
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    throw new Error(`Unsupported file type ".${ext}". Please upload PDF, PPTX, CSV, or TXT files.`);
}
