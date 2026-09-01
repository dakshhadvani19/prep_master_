import { db, storage } from '../firebase';
import { doc, setDoc, getDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { extractPdfText } from './fileParser';

// Firestore doc ID for a given course+subject pair
function docId(courseId, subjectId) {
    return `${courseId}__${subjectId}`;
}

/**
 * Upload a syllabus PDF for a subject.
 * Extracts text client-side, stores raw PDF in Storage, metadata+text in Firestore.
 *
 * @param {File} file - The PDF file
 * @param {string} subjectId
 * @param {string} courseId
 * @param {string} subjectTitle
 * @param {string} courseTitle
 * @param {string} uploaderUid
 * @param {function} onProgress - optional callback(message)
 */
export async function uploadSyllabusPDF({ file, subjectId, courseId, subjectTitle, courseTitle, uploaderUid, onProgress }) {
    onProgress?.('Extracting text from PDF...');
    const arrayBuffer = await file.arrayBuffer();
    const extractedText = await extractPdfText(arrayBuffer);

    if (!extractedText || extractedText.trim().length < 50) {
        throw new Error('Could not extract readable text from this PDF. Please check the file.');
    }

    onProgress?.('Uploading PDF to storage...');
    const storagePath = `syllabuses/${courseId}/${subjectId}/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file);
    const pdfURL = await getDownloadURL(storageRef);

    onProgress?.('Saving syllabus to database...');
    await setDoc(doc(db, 'syllabuses', docId(courseId, subjectId)), {
        subjectId,
        courseId,
        subjectTitle,
        courseTitle,
        extractedText: extractedText.slice(0, 50000), // cap at 50k chars
        pdfStoragePath: storagePath,
        pdfURL,
        pdfFileName: file.name,
        uploadedBy: uploaderUid,
        uploadedAt: new Date().toISOString(),
    });

    onProgress?.('Done!');
}

/**
 * Fetch syllabus for a subject+course from Firestore.
 * Returns the document data or null if not uploaded yet.
 */
export async function fetchSyllabus(subjectId, courseId) {
    if (!subjectId || !courseId) return null;
    const snap = await getDoc(doc(db, 'syllabuses', docId(courseId, subjectId)));
    return snap.exists() ? snap.data() : null;
}

/**
 * Delete a syllabus entry from Firestore and Storage.
 */
export async function deleteSyllabus(subjectId, courseId, pdfStoragePath) {
    await deleteDoc(doc(db, 'syllabuses', docId(courseId, subjectId)));
    if (pdfStoragePath) {
        try {
            await deleteObject(ref(storage, pdfStoragePath));
        } catch {
            // Storage file missing is acceptable — Firestore doc is already deleted
        }
    }
}

/**
 * List all uploaded syllabuses.
 */
export async function listAllSyllabuses() {
    const snap = await getDocs(collection(db, 'syllabuses'));
    return snap.docs.map(d => d.data());
}
