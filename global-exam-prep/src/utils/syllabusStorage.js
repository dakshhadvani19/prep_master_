import { extractPdfText } from './fileParser';

const STORAGE_KEY = 'prepmaster_syllabuses_v1';
const objectUrls = new Map();

function docId(courseId, subjectId) {
    return `${courseId}__${subjectId}`;
}

function readAll() {
    try {
        if (typeof window === 'undefined' || !window.localStorage) return [];
        const raw = window.localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeAll(items) {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        }
    } catch {}
}

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
    const existingUrl = objectUrls.get(key);
    if (existingUrl) URL.revokeObjectURL(existingUrl);

    const pdfURL = typeof URL !== 'undefined' && URL.createObjectURL
        ? URL.createObjectURL(file)
        : '';

    objectUrls.set(key, pdfURL);

    const item = {
        subjectId,
        courseId,
        subjectTitle,
        courseTitle,
        extractedText: extractedText.slice(0, 50000),
        pdfStoragePath: null,
        pdfURL,
        pdfFileName: file.name,
        uploadedBy: uploaderUid,
        uploadedAt: new Date().toISOString(),
    };

    const items = readAll().filter((entry) => docId(entry.courseId, entry.subjectId) !== key);
    items.push({ ...item, pdfURL: '' });
    writeAll(items);
    onProgress?.('Done!');
    return item;
}

export async function fetchSyllabus(subjectId, courseId) {
    if (!subjectId || !courseId) return null;
    const key = docId(courseId, subjectId);
    const item = readAll().find((entry) => docId(entry.courseId, entry.subjectId) === key) || null;
    if (item) item.pdfURL = objectUrls.get(key) || '';
    return item;
}

export async function deleteSyllabus(subjectId, courseId) {
    const key = docId(courseId, subjectId);
    const url = objectUrls.get(key);
    if (url) URL.revokeObjectURL(url);
    objectUrls.delete(key);
    writeAll(readAll().filter((entry) => docId(entry.courseId, entry.subjectId) !== key));
}

export async function listAllSyllabuses() {
    return readAll().map((item) => ({
        ...item,
        pdfURL: item.pdfURL || objectUrls.get(docId(item.courseId, item.subjectId)) || '',
    }));
}
