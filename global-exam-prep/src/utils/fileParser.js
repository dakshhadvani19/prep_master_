import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import JSZip from 'jszip';

// Use local worker bundled by Vite (avoids CDN version mismatch issues)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

/**
 * Extract plain text from a PDF ArrayBuffer using PDF.js
 */
export async function extractPdfText(arrayBuffer) {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(' ');
        pages.push(pageText);
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
    const MAX_BYTES = 10 * 1024 * 1024; // 10 MB limit

    if (file.size > MAX_BYTES) {
        throw new Error(`File "${file.name}" is too large (max 10 MB). Please upload a smaller file.`);
    }

    if (ext === 'pdf') {
        const buf = await file.arrayBuffer();
        return await extractPdfText(buf);
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
