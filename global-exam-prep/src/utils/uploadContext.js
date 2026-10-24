/**
 * Upload-only source-context fitting. Built-in syllabus context remains governed
 * by contextFitter.js and geminiQuestions.js defaults.
 */
export const UPLOAD_CONTEXT_MAX_CHARS = 30000;
const MAX_GENERIC_SECTION_CHARS = 1200;
const TRUNCATION_NOTE = '[NOTE: This is a balanced excerpt from uploaded study material. Some source text was omitted to fit the context budget; only the supplied text is available when generating questions.]';

function chunkText(text, maxChars = MAX_GENERIC_SECTION_CHARS) {
    const chunks = [];
    let start = 0;

    while (start < text.length) {
        let end = Math.min(start + maxChars, text.length);
        if (end < text.length) {
            const window = text.slice(start, end);
            const boundary = Math.max(window.lastIndexOf('\n'), window.lastIndexOf(' '));
            if (boundary >= Math.floor(maxChars * 0.55)) end = start + boundary;
        }
        if (end <= start) end = Math.min(start + maxChars, text.length);
        chunks.push(text.slice(start, end).trim());
        start = end;
        while (start < text.length && /\s/.test(text[start])) start += 1;
    }

    return chunks.filter(Boolean);
}

function getTextSections(text) {
    const pagePattern = /\[Page\s+\d+\]/gi;
    const pageMatches = [...text.matchAll(pagePattern)];

    if (pageMatches.length > 0) {
        const sections = [];
        const preface = text.slice(0, pageMatches[0].index).trim();
        if (preface) sections.push({ label: '[Document preface]', text: preface });

        pageMatches.forEach((match, index) => {
            const bodyStart = match.index + match[0].length;
            const bodyEnd = index + 1 < pageMatches.length ? pageMatches[index + 1].index : text.length;
            sections.push({
                label: match[0],
                text: text.slice(bodyStart, bodyEnd).trim(),
            });
        });
        return sections;
    }

    const paragraphs = text.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);
    const chunks = (paragraphs.length ? paragraphs : [text])
        .flatMap(paragraph => chunkText(paragraph));
    return chunks.map((part, index) => ({ label: `[Section ${index + 1}]`, text: part }));
}

function allocateEvenly(capacities, budget) {
    const allocations = capacities.map(() => 0);
    let remaining = Math.max(0, Math.floor(budget));
    let active = capacities.map((capacity, index) => capacity > 0 ? index : -1).filter(index => index >= 0);

    while (remaining > 0 && active.length > 0) {
        const share = Math.floor(remaining / active.length);
        if (share < 1) {
            for (const index of active.slice(0, remaining)) allocations[index] += 1;
            remaining = 0;
            break;
        }

        let spent = 0;
        for (const index of active) {
            const extra = Math.min(capacities[index] - allocations[index], share);
            allocations[index] += extra;
            spent += extra;
        }
        if (spent === 0) break;
        remaining -= spent;
        active = active.filter(index => allocations[index] < capacities[index]);
    }

    return allocations;
}

function balancedExcerpt(text, budget) {
    if (text.length <= budget) return text;
    if (budget <= 0) return '';
    const marker = '\n[…middle excerpt omitted…]\n';
    if (budget <= marker.length + 2) return text.slice(0, budget);

    const available = budget - marker.length;
    const headLength = Math.ceil(available * 0.6);
    const tailLength = available - headLength;
    return `${text.slice(0, headLength)}${marker}${tailLength > 0 ? text.slice(-tailLength) : ''}`;
}

function sampleText(text, budget) {
    if (text.length <= budget) return text;
    if (budget <= 0) return '';

    const sections = getTextSections(text);
    const fixedOverhead = sections.reduce((sum, section) => sum + section.label.length + 1, 0)
        + Math.max(0, sections.length - 1) * 2;

    if (fixedOverhead >= budget) return balancedExcerpt(text, budget);

    const bodyBudget = budget - fixedOverhead;
    const bodyAllocations = allocateEvenly(sections.map(section => section.text.length), bodyBudget);
    return sections.map((section, index) => {
        const excerpt = balancedExcerpt(section.text, bodyAllocations[index]);
        return `${section.label}\n${excerpt}`;
    }).join('\n\n');
}

/**
 * Prepare extracted upload files for the existing Groq generator.
 *
 * @param {Array<{name: string, text: string}>} files
 * @param {number} maxChars Maximum combined context length, including labels/notes.
 * @returns {{text: string, truncated: boolean, originalChars: number, includedChars: number}}
 */
export function prepareUploadContext(files, maxChars = UPLOAD_CONTEXT_MAX_CHARS) {
    const documents = (Array.isArray(files) ? files : [])
        .map((file, index) => ({
            name: String(file?.name || `Uploaded file ${index + 1}`),
            text: typeof file?.text === 'string' ? file.text.trim() : '',
        }))
        .filter(file => file.text.length > 0);

    const maxBudget = Number.isFinite(maxChars) ? Math.max(1, Math.floor(maxChars)) : UPLOAD_CONTEXT_MAX_CHARS;
    const originalChars = documents.reduce((sum, file) => sum + file.text.length, 0);
    const fullContext = documents.map(file => `=== ${file.name} ===\n${file.text}`).join('\n\n');

    if (fullContext.length <= maxBudget) {
        return {
            text: fullContext,
            truncated: false,
            originalChars,
            includedChars: fullContext.length,
        };
    }

    const headers = documents.map(file => `=== ${file.name} ===\n`);
    const headerChars = headers.reduce((sum, header) => sum + header.length, 0)
        + Math.max(0, documents.length - 1) * 2;
    const note = TRUNCATION_NOTE;
    const sourceBudget = Math.max(0, maxBudget - headerChars - note.length - 2);
    const allocations = allocateEvenly(documents.map(file => file.text.length), sourceBudget);

    const text = documents.map((file, index) => {
        return `${headers[index]}${sampleText(file.text, allocations[index])}`;
    }).join('\n\n');

    const boundedText = `${text}\n\n${note}`;
    // The reserved note/header space should make this unnecessary in normal use;
    // retain a hard boundary for custom budgets and unexpectedly long labels.
    const finalText = boundedText.length > maxBudget
        ? boundedText.slice(0, maxBudget)
        : boundedText;

    return {
        text: finalText,
        truncated: true,
        originalChars,
        includedChars: finalText.length,
    };
}
