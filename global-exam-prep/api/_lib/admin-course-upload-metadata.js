export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const MIME_BY_EXTENSION = Object.freeze({
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    csv: 'text/csv',
});

export class UploadValidationError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = 'UploadValidationError';
        this.details = details;
    }
}

export function validateUploadMetadata({ kind, fileName, mimeType, sizeBytes }) {
    const name = String(fileName || '').replace(/^.*[\\/]/, '').trim();
    if (!name || name.length > 180) {
        throw new UploadValidationError('Choose a file with a name between 1 and 180 characters.');
    }
    const extension = name.split('.').pop()?.toLowerCase() || '';
    const allowedExtensions = kind === 'syllabus' ? ['pdf', 'docx']
        : kind === 'question_bank' ? ['pdf', 'docx', 'csv'] : [];
    if (!allowedExtensions.includes(extension)) {
        throw new UploadValidationError(kind === 'syllabus'
            ? 'Syllabus files must be PDF or DOCX.'
            : 'Question banks must be PDF, DOCX, or CSV.');
    }
    const size = Number(sizeBytes);
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_UPLOAD_BYTES) {
        throw new UploadValidationError('Files must be larger than 0 bytes and no larger than 20 MB.');
    }

    const expectedMime = MIME_BY_EXTENSION[extension];
    const suppliedMime = String(mimeType || '').toLowerCase().trim();
    const compatibleMime = !suppliedMime
        || suppliedMime === 'application/octet-stream'
        || suppliedMime === expectedMime
        || (extension === 'csv' && suppliedMime === 'application/vnd.ms-excel');
    if (!compatibleMime) {
        throw new UploadValidationError('The selected file extension and MIME type do not match.');
    }
    return {
        fileName: name,
        extension,
        mimeType: expectedMime,
        sizeBytes: size,
    };
}
