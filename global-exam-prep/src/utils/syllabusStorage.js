import { extractPdfText } from './fileParser';

const STORAGE_KEY = 'prepmaster-static-syllabuses';

function docId(courseId, subjectId) {
    return `${courseId}__${subjectId}`;
}

function readStore() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writeStore(store) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
        // Static fallback is best-effort. The extracted syllabus remains usable
        // for the current session even when browser storage is full/unavailable.
    }
}

function toPdfDataUrl(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
    });
}

/**
 * Temporary non-Firebase syllabus store.
 *
 * Supabase Storage is intentionally not introduced in this phase because the
 * existing project does not yet have the bucket/policy contract wired for this
 * admin workflow. Text is extracted immediately in-browser and persisted to
 * localStorage. No artificial fetch delay is used.
 */
export async function uploadSyllabusPDF({
    file,
    subjectId,
    courseId,
    subjectTitle,
    courseTitle,
    uploaderUid,
    onProgress,
}) {
    onProgress?.('Extracting text from PDF...');
    const arrayBuffer = await file.arrayBuffer();
    const extractedText = await extractPdfText(arrayBuffer);

    if (!extractedText || extractedText.trim().length < 50) {
        throw new Error('Could not extract readable text from this PDF. Please check the file.');
    }

    onProgress?.('Saving syllabus locally...');
    const key = docId(courseId, subjectId);
    const store = readStore();

    // Keep the PDF itself only when it is small enough for normal browser
    // localStorage limits. The extracted text is the actual exam-generation input.
    let pdfURL = null;
    if (file.size <= 2 * 1024 * 1024) {
        pdfURL = await toPdfDataUrl(file);
    }

    store[key] = {
        subjectId,
        courseId,
        subjectTitle,
        courseTitle,
        extractedText: extractedText.slice(0, 50000),
        pdfStoragePath: null,
        pdfURL,
        pdfFileName: file.name,
        uploadedBy: uploaderUid || null,
        uploadedAt: new Date().toISOString(),
        storageMode: 'local-static',
    };

    writeStore(store);
    onProgress?.('Done!');
    return store[key];
}

export async function fetchSyllabus(subjectId, courseId) {
    if (!subjectId || !courseId) return null;
    return readStore()[docId(courseId, subjectId)] || null;
}

export async function deleteSyllabus(subjectId, courseId) {
    const store = readStore();
    delete store[docId(courseId, subjectId)];
    writeStore(store);
}

export async function listAllSyllabuses() {
    return Object.values(readStore()).sort(
        (a, b) => String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || ''))
    );
}
