import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as tus from 'tus-js-client';
import {
    AlertCircle, CheckCircle2, CloudUpload, FileText, RefreshCw,
    ShieldCheck, UploadCloud, X,
} from 'lucide-react';
import { supabase } from '../supabase.js';
import { getSubjectExamInfo } from '../utils/subjectExamPolicy.js';
import './AdminCourseUploads.css';

const BUCKET = 'admin-course-files';
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MIME_BY_EXTENSION = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    csv: 'text/csv',
};

function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024 * 1024) return Math.max(1, Math.round(value / 1024)) + ' KB';
    return (value / (1024 * 1024)).toFixed(1) + ' MB';
}

function statusLabel(upload) {
    if (upload.status === 'active' && upload.is_active) return 'Active syllabus';
    const labels = {
        uploading: 'Upload incomplete',
        queued: 'Queued for validation',
        processing: 'Processing in background',
        retry_waiting: 'Retry required',
        validating: 'Validating',
        needs_confirmation: 'Ready to activate',
        validated_waiting_phase3: 'Validated · Ready to parse',
        needs_review: 'Admin review required',
        published: 'Published question bank',
        active: 'Active syllabus',
        superseded: 'Previous version',
        failed: 'Validation failed',
    };
    return labels[upload.status] || 'Unknown status';
}

function dateLabel(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

export default function AdminCourseUploads({ subject, examTypes = [] }) {
    const [kind, setKind] = useState('syllabus');
    const [examType, setExamType] = useState(examTypes[0] || '');
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploads, setUploads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [actionError, setActionError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(null);
    const [confirmingId, setConfirmingId] = useState(null);
    const [expandedId, setExpandedId] = useState(null);
    const [progress, setProgress] = useState({ uploaded: 0, total: 0 });
    const [review, setReview] = useState(null);
    const [reviewBusy, setReviewBusy] = useState(false);
    const [reviewError, setReviewError] = useState('');
    const [publishReport, setPublishReport] = useState(null);
    const [markTotalsAcknowledged, setMarkTotalsAcknowledged] = useState(false);
    const fileInputRef = useRef(null);

    const activeSyllabus = useMemo(
        () => uploads.find(item => item.kind === 'syllabus' && item.is_active) || null,
        [uploads],
    );

    const examTypesKey = examTypes.join('|');
    useEffect(() => {
        setExamType(examTypesKey ? examTypesKey.split('|')[0] : '');
    }, [subject?.subjectId, examTypesKey]);

    const getSession = useCallback(async () => {
        if (!supabase) throw new Error('Supabase is not configured on this deployment.');
        const { data, error } = await supabase.auth.getSession();
        const session = data?.session;
        if (error || !session?.access_token) {
            throw new Error('Your session has expired. Sign in again before uploading files.');
        }
        return session;
    }, []);

    const apiRequest = useCallback(async (method, payload = null, extraQuery = '') => {
        const session = await getSession();
        const url = method === 'GET'
            ? '/api/admin-course-uploads?subjectId=' + encodeURIComponent(subject.subjectId) + (extraQuery ? '&' + extraQuery : '')
            : '/api/admin-course-uploads';
        const response = await fetch(url, {
            method,
            headers: {
                Authorization: 'Bearer ' + session.access_token,
                ...(payload ? { 'Content-Type': 'application/json' } : {}),
            },
            ...(payload ? { body: JSON.stringify(payload) } : {}),
        });
        let result;
        try { result = await response.json(); } catch { result = {}; }
        if (!response.ok) {
            const error = new Error(result.error || 'The course-file request failed. Please retry.');
            error.status = response.status;
            throw error;
        }
        return result;
    }, [getSession, subject.subjectId]);

    const loadUploads = useCallback(async () => {
        setLoading(true);
        setLoadError('');
        try {
            const result = await apiRequest('GET');
            setUploads(Array.isArray(result.uploads) ? result.uploads : []);
        } catch (error) {
            setLoadError(error.message || 'Could not load saved file history.');
        } finally {
            setLoading(false);
        }
    }, [apiRequest]);

    useEffect(() => {
        loadUploads();
    }, [loadUploads]);

    const hasPendingJobs = uploads.some(upload => ['queued', 'processing'].includes(upload.status));
    useEffect(() => {
        if (!hasPendingJobs) return undefined;
        const timer = setInterval(async () => {
            try {
                const result = await apiRequest('GET');
                setUploads(Array.isArray(result.uploads) ? result.uploads : []);
            } catch {
                // Keep the last known state; a later poll can recover.
            }
        }, 7000);
        return () => clearInterval(timer);
    }, [hasPendingJobs, apiRequest]);

    function validateSelectedFile(file, uploadKind) {
        if (!file) throw new Error('Choose a file first.');
        const extension = file.name.split('.').pop()?.toLowerCase() || '';
        const allowed = uploadKind === 'syllabus' ? ['pdf', 'docx'] : ['pdf', 'docx', 'csv'];
        if (!allowed.includes(extension)) {
            throw new Error(uploadKind === 'syllabus'
                ? 'Syllabus files must be PDF or DOCX.'
                : 'Question banks must be PDF, DOCX, or CSV.');
        }
        if (!file.size || file.size > MAX_FILE_BYTES) {
            throw new Error('Files must be larger than 0 bytes and no larger than 20 MB.');
        }
        if (file.type && file.type !== 'application/octet-stream'
            && file.type !== MIME_BY_EXTENSION[extension]
            && !(extension === 'csv' && file.type === 'application/vnd.ms-excel')) {
            throw new Error('The selected file extension and file type do not match.');
        }
        return { extension, mimeType: MIME_BY_EXTENSION[extension] };
    }

    async function transferFile(file, uploadRecord, session) {
        const baseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
        const publicKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '');
        if (!baseUrl || !publicKey) throw new Error('Supabase upload settings are missing from this deployment.');

        setProgress({ uploaded: 0, total: file.size });
        await new Promise((resolve, reject) => {
            const upload = new tus.Upload(file, {
                endpoint: baseUrl + '/storage/v1/upload/resumable',
                retryDelays: [0, 3000, 5000, 10000, 20000],
                headers: {
                    authorization: 'Bearer ' + session.access_token,
                    apikey: publicKey,
                },
                metadata: {
                    bucketName: BUCKET,
                    objectName: uploadRecord.object_path,
                    contentType: uploadRecord.mime_type,
                    cacheControl: '3600',
                },
                fingerprint: (sourceFile, options) => Promise.resolve([
                    options.endpoint,
                    options.metadata.objectName,
                    sourceFile.name,
                    sourceFile.size,
                    sourceFile.lastModified,
                ].join('::')),
                uploadDataDuringCreation: true,
                removeFingerprintOnSuccess: true,
                chunkSize: 6 * 1024 * 1024,
                onError: reject,
                onProgress: (uploaded, total) => setProgress({ uploaded, total }),
                onSuccess: resolve,
            });

            upload.findPreviousUploads()
                .then(previous => {
                    if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
                    upload.start();
                })
                .catch(reject);
        });
    }

    async function finalizeUpload(uploadId) {
        setBusy({ id: uploadId, phase: 'queueing' });
        setNotice('Upload complete. Verifying private storage and queuing background validation.');
        const result = await apiRequest('POST', {
            action: 'finalize',
            subjectId: subject.subjectId,
            uploadId,
        });
        await loadUploads();
        if (result.incomplete) {
            setNotice('');
            setActionError(result.message || 'The file is not fully uploaded yet.');
        } else if (result.failed) {
            setNotice('');
            setActionError(result.upload?.error_message || 'The file did not pass validation.');
        } else if (result.accepted && ['queued', 'processing'].includes(result.upload?.status)) {
            setActionError('');
            setNotice(result.message || 'File accepted. You can safely close this page; processing continues in the background.');
        } else if (result.upload?.status === 'needs_confirmation') {
            setActionError('');
            setNotice('Syllabus validated. Review the preview, then explicitly confirm it to replace the active version.');
        } else if (result.upload?.status === 'validated_waiting_phase3') {
            setActionError('');
            setNotice('Question-bank file validated and saved. It is waiting for Phase 3 parsing and admin review.');
        }
    }

    async function startUpload(file, uploadKind, existingRecord = null) {
        let session;
        try {
            const fileMeta = validateSelectedFile(file, uploadKind);
            setActionError('');
            setNotice('');
            session = await getSession();

            let record;
            if (existingRecord) {
                const resumed = await apiRequest('POST', {
                    action: 'resume',
                    subjectId: subject.subjectId,
                    uploadId: existingRecord.id,
                });
                record = resumed.upload;
                if (file.name !== record.file_name || file.size !== Number(record.size_bytes)) {
                    throw new Error('Choose the same file name and size used for the interrupted upload.');
                }
                if (fileMeta.extension !== record.file_extension) {
                    throw new Error('The selected file type does not match the interrupted upload.');
                }
            } else {
                setBusy({ id: 'new', phase: 'preparing' });
                const created = await apiRequest('POST', {
                    action: 'start',
                    subjectId: subject.subjectId,
                    courseId: subject.courseId,
                    semester: subject.semester,
                    kind: uploadKind,
                    examType: uploadKind === 'question_bank' ? examType : null,
                    fileName: file.name,
                    mimeType: file.type || fileMeta.mimeType,
                    sizeBytes: file.size,
                });
                record = created.upload;
            }

            setBusy({ id: record.id, phase: 'uploading' });
            setNotice('Uploading the original file to private storage. Keep this page open until the transfer completes and the background job is accepted.');
            await transferFile(file, record, session);
            await finalizeUpload(record.id);
            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (error) {
            setActionError(error.message || 'Upload failed. You can retry or resume it from the file history.');
            setNotice('');
            await loadUploads();
        } finally {
            setBusy(null);
            setProgress({ uploaded: 0, total: 0 });
        }
    }

    async function checkUpload(upload) {
        setActionError('');
        setNotice('Checking whether the file reached private storage.');
        try {
            await finalizeUpload(upload.id);
        } catch (error) {
            setActionError(error.message || 'Could not validate this upload.');
            setNotice('');
        } finally {
            setBusy(null);
        }
    }

    async function confirmSyllabus(upload) {
        setBusy({ id: upload.id, phase: 'confirming' });
        setActionError('');
        try {
            await apiRequest('POST', { action: 'confirm_syllabus', uploadId: upload.id });
            setConfirmingId(null);
            setNotice('The new syllabus is now active. The previous version remains in file history.');
            await loadUploads();
        } catch (error) {
            setActionError(error.message || 'Could not activate this syllabus.');
        } finally {
            setBusy(null);
        }
    }


    function validateReviewedQuestion(question) {
        const errors = [];
        if (!String(question.question_text || '').trim()) errors.push('Question text is required.');
        const marks = Number(question.marks);
        if (!Number.isFinite(marks) || marks <= 0) errors.push('Marks must be greater than zero.');
        if (!['easy', 'medium', 'hard'].includes(question.difficulty)) errors.push('Choose a difficulty.');
        if (question.question_type === 'mcq') {
            if (!Array.isArray(question.options) || question.options.length !== 4 || question.options.some(value => !String(value || '').trim())) {
                errors.push('MCQ needs four options.');
            }
            if (question.correct_option_index === null || question.correct_option_index === undefined || question.correct_option_index === '' || !Number.isInteger(Number(question.correct_option_index)) || Number(question.correct_option_index) < 0 || Number(question.correct_option_index) > 3) {
                errors.push('Select the correct option.');
            }
        } else if (!String(question.model_answer || '').trim()) {
            errors.push('Theory model answer is required.');
        }
        return {
            ...question,
            validation_errors: errors,
            validation_status: errors.length ? 'rejected'
                : question.rubric_generated && !question.rubric_reviewed ? 'warning' : 'valid',
        };
    }

    async function openQuestionReview(upload) {
        setReviewBusy(true);
        setReviewError('');
        setActionError('');
        setPublishReport(null);
        setMarkTotalsAcknowledged(false);
        try {
            const result = upload.status === 'validated_waiting_phase3'
                ? await apiRequest('POST', { action: 'parse_question_bank', subjectId: subject.subjectId, uploadId: upload.id })
                : await apiRequest('GET', null, 'uploadId=' + encodeURIComponent(upload.id));
            if (!result.review?.bank) throw new Error('Question-bank review was not returned.');
            setReview(result.review);
            setNotice('Extracted questions are ready. Correct rejected items, review generated rubrics, save, and publish explicitly.');
            await loadUploads();
        } catch (error) {
            setReviewError(error.message || 'Could not parse this question bank.');
        } finally {
            setReviewBusy(false);
        }
    }

    function updateReviewQuestion(index, patch) {
        setReview(current => {
            if (!current) return current;
            const questions = current.questions.map((question, i) => i === index
                ? validateReviewedQuestion({ ...question, ...patch })
                : question);
            return { ...current, questions };
        });
    }

    async function saveQuestionReview() {
        if (!review?.bank?.source_upload_id) return null;
        const questions = review.questions.map(validateReviewedQuestion);
        setReview(current => ({ ...current, questions }));
        const result = await apiRequest('POST', {
            action: 'save_review',
            uploadId: review.bank.source_upload_id,
            questions,
        });
        setReview(result.review);
        return result.review;
    }

    async function publishQuestionBank() {
        setReviewBusy(true);
        setReviewError('');
        setPublishReport(null);
        try {
            await saveQuestionReview();
            const result = await apiRequest('POST', {
                action: 'publish_question_bank',
                uploadId: review.bank.source_upload_id,
                acknowledgeMarkMismatch: markTotalsAcknowledged,
            });
            setPublishReport(result.published);
            setReview(current => ({
                ...current,
                bank: { ...current.bank, status: 'published', published_questions: result.published.published_questions },
            }));
            setNotice('Question bank published. Every included question is stored with canonical subject, course, semester and exam metadata.');
            await loadUploads();
        } catch (error) {
            setReviewError(error.message || 'Could not publish this question bank.');
        } finally {
            setReviewBusy(false);
        }
    }

    const includedQuestions = review?.questions?.filter(question => question.include_in_publish) || [];
    const blockingQuestions = includedQuestions.filter(question => question.validation_status !== 'valid'
        || (question.rubric_generated && !question.rubric_reviewed));
    const examInfo = review ? getSubjectExamInfo(review.bank.exam_type, subject.isDepartmentalSubject) : null;
    const expectedExamMarks = Number(examInfo?.totalMarks) || null;
    const mcqQuestions = includedQuestions.filter(question => question.question_type === 'mcq')
        .sort((a, b) => a.sort_order - b.sort_order);
    const mcqMarkSets = Array.from({ length: Math.ceil(mcqQuestions.length / 30) }, (_, index) => {
        const questions = mcqQuestions.slice(index * 30, (index + 1) * 30);
        return {
            set: index + 1,
            count: questions.length,
            marks: questions.reduce((total, question) => total + (Number(question.marks) || 0), 0),
            complete: questions.length === 30,
        };
    });
    const markTotalWarnings = expectedExamMarks
        ? mcqMarkSets.filter(item => item.complete && item.marks !== expectedExamMarks)
        : [];
    const needsMarkAcknowledgement = markTotalWarnings.length > 0;
    const questionBankAllowed = examTypes.length > 0;

    return (
        <section className="ac-uploads" aria-labelledby="ac-uploads-title">
            <div className="ac-uploads__heading">
                <div>
                    <h3 id="ac-uploads-title">Syllabus &amp; question-bank files</h3>
                    <p>Validate source files, correct extracted questions, then publish an approved subject-linked question bank.</p>
                </div>
                <span className="ac-uploads__security"><ShieldCheck size={16} /> Admin-only</span>
            </div>

            <div className="ac-uploads__tabs" role="tablist" aria-label="File category">
                <button type="button" role="tab" aria-selected={kind === 'syllabus'} className={kind === 'syllabus' ? 'is-active' : ''} onClick={() => { setKind('syllabus'); setSelectedFile(null); setActionError(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                    <FileText size={16} /> Syllabus
                </button>
                <button type="button" role="tab" aria-selected={kind === 'question_bank'} className={kind === 'question_bank' ? 'is-active' : ''} onClick={() => { setKind('question_bank'); setSelectedFile(null); setActionError(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                    <CloudUpload size={16} /> Question bank
                </button>
            </div>

            <div className="ac-uploads__form">
                {kind === 'question_bank' && (
                    <div className="ac-uploads__exam">
                        <label htmlFor="ac-upload-exam">Exam type</label>
                        <select id="ac-upload-exam" value={examType} onChange={event => setExamType(event.target.value)} disabled={!questionBankAllowed}>
                            {examTypes.map(type => <option value={type} key={type}>{type.replace(/-/g, ' ').toUpperCase()}</option>)}
                        </select>
                        {!questionBankAllowed && <small>No question-bank exam types are configured for this subject.</small>}
                    </div>
                )}

                <div className="ac-uploads__file-row">
                    <label className="ac-uploads__file-picker">
                        <UploadCloud size={19} />
                        <span>{selectedFile ? selectedFile.name : 'Choose ' + (kind === 'syllabus' ? 'a PDF or DOCX' : 'a PDF, DOCX or CSV')}</span>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={kind === 'syllabus' ? '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document' : '.pdf,.docx,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/csv'}
                            onChange={event => {
                                setSelectedFile(event.target.files?.[0] || null);
                                setActionError('');
                                setNotice('');
                            }}
                            aria-label="Choose upload file"
                        />
                    </label>
                    {selectedFile && <button type="button" className="ac-uploads__clear" aria-label="Clear selected file" onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}><X size={16} /></button>}
                    <button
                        type="button"
                        className="ac-btn ac-btn--primary"
                        disabled={!selectedFile || Boolean(busy) || (kind === 'question_bank' && !questionBankAllowed)}
                        onClick={() => startUpload(selectedFile, kind)}
                    >
                        <CloudUpload size={16} /> Upload and validate
                    </button>
                </div>

                <div className="ac-uploads__limits">
                    <span>PDF / DOCX: max 20 MB, PDF max 50 pages, document text max 30,000 characters.</span>
                    <span>CSV: max 20 MB and 10,000 question rows.</span>
                </div>

                {kind === 'question_bank' && (
                    <div className="ac-uploads__csv-help">
                        <div><strong>CSV format</strong><span>Use the exact template columns. MCQ rows need four options and a correct option; theory rows need a model answer.</span></div>
                        <a href="/templates/question-bank-template.csv" download>Download CSV template</a>
                    </div>
                )}
            </div>

            {busy && (
                <div className="ac-uploads__activity" role="status">
                    <span className="ac-spinner" />
                    <div>
                        <strong>{busy.phase === 'uploading' ? 'Uploading original file' : busy.phase === 'validating' ? 'Validating file' : busy.phase === 'confirming' ? 'Activating syllabus' : 'Preparing secure upload'}</strong>
                        <span>{busy.phase === 'uploading' && progress.total > 0
                            ? Math.round((progress.uploaded / progress.total) * 100) + '% · ' + formatBytes(progress.uploaded) + ' of ' + formatBytes(progress.total)
                            : busy.phase === 'validating'
                                ? 'Checking file structure and extracting a text preview.'
                                : busy.phase === 'confirming'
                                    ? 'Switching the active syllabus version.'
                                    : 'Creating a private upload record.'}</span>
                        {busy.phase === 'uploading' && progress.total > 0 && (
                            <div className="ac-uploads__progress" role="progressbar" aria-label="File upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((progress.uploaded / progress.total) * 100)}>
                                <span style={{ width: Math.min(100, (progress.uploaded / progress.total) * 100) + '%' }} />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {notice && (
                <div className={'ac-uploads__notice' + (busy ? ' ac-uploads__notice--pending' : '')} role="status">
                    {busy
                        ? <span className="ac-spinner" aria-hidden="true" />
                        : <CheckCircle2 size={17} />}
                    <span>{notice}</span>
                </div>
            )}
            {actionError && <div className="ac-uploads__error" role="alert"><AlertCircle size={17} /><span>{actionError}</span></div>}

            <div className="ac-uploads__history-heading">
                <div><h4>Saved file history</h4><p>Upload state is saved and remains visible after a refresh.</p></div>
                <button type="button" className="ac-btn ac-btn--secondary" onClick={loadUploads} disabled={loading || Boolean(busy)}><RefreshCw size={15} /> Refresh</button>
            </div>

            {loading ? <div className="ac-uploads__loading" role="status"><span className="ac-spinner" /> Loading saved uploads…</div>
                : loadError ? <div className="ac-uploads__empty ac-uploads__empty--error"><AlertCircle size={18} /><span>{loadError}</span><button type="button" onClick={loadUploads}>Retry</button></div>
                    : uploads.length === 0 ? <div className="ac-uploads__empty"><FileText size={22} /><span>No syllabus or question-bank files have been uploaded for this subject.</span></div>
                        : <div className="ac-uploads__history">
                            {uploads.map(upload => (
                                <article className="ac-uploads__item" key={upload.id}>
                                    <div className="ac-uploads__item-top">
                                        <div className="ac-uploads__file-icon"><FileText size={18} /></div>
                                        <div className="ac-uploads__item-copy">
                                            <strong>{upload.file_name}</strong>
                                            <span>{upload.kind === 'syllabus' ? 'Syllabus' : 'Question bank · ' + String(upload.exam_type || '').replace(/-/g, ' ').toUpperCase()} · {formatBytes(upload.size_bytes)}</span>
                                        </div>
                                        <span className={'ac-uploads__status ac-uploads__status--' + upload.status}>{statusLabel(upload)}</span>
                                    </div>

                                    <div className="ac-uploads__item-meta">
                                        <span>{dateLabel(upload.created_at)}</span>
                                        {upload.page_count !== null && upload.page_count !== undefined && <span>{upload.page_count} pages</span>}
                                        {upload.word_count !== null && upload.word_count !== undefined && <span>{Number(upload.word_count).toLocaleString()} words</span>}
                                        {upload.row_count !== null && upload.row_count !== undefined && <span>{Number(upload.row_count).toLocaleString()} question rows</span>}
                                        {upload.kind === 'syllabus' && upload.is_active && <span className="ac-uploads__active-note">Current active version</span>}
                                    </div>

                                    {upload.error_message && <p className="ac-uploads__item-error">{upload.error_message}</p>}

                                    {upload.preview_text && (
                                        <details className="ac-uploads__preview" open={expandedId === upload.id} onToggle={event => {
                                            if (event.currentTarget.open) setExpandedId(upload.id);
                                            else if (expandedId === upload.id) setExpandedId(null);
                                        }}>
                                            <summary>View extracted preview</summary>
                                            <pre>{upload.preview_text}</pre>
                                        </details>
                                    )}

                                    {upload.status === 'uploading' && (
                                        <div className="ac-uploads__item-actions">
                                            <button type="button" className="ac-btn ac-btn--secondary" disabled={Boolean(busy)} onClick={() => checkUpload(upload)}>Check completed upload</button>
                                            <label className="ac-uploads__resume">
                                                Resume with the same file
                                                <input type="file" accept={'.' + upload.file_extension} disabled={Boolean(busy)} onChange={event => {
                                                    const file = event.target.files?.[0];
                                                    if (file) startUpload(file, upload.kind, upload);
                                                    event.target.value = '';
                                                }} />
                                            </label>
                                        </div>
                                    )}

                                    {upload.status === 'needs_confirmation' && upload.kind === 'syllabus' && (
                                        <div className="ac-uploads__confirm">
                                            {confirmingId === upload.id ? (
                                                <>
                                                    <p>This will make the validated file the active syllabus for this subject. The previous version stays in history and is no longer active.</p>
                                                    <div>
                                                        <button type="button" className="ac-btn ac-btn--primary" disabled={Boolean(busy)} onClick={() => confirmSyllabus(upload)}>Confirm replace active syllabus</button>
                                                        <button type="button" className="ac-btn ac-btn--secondary" onClick={() => setConfirmingId(null)}>Cancel</button>
                                                    </div>
                                                </>
                                            ) : (
                                                <button type="button" className="ac-btn ac-btn--primary" disabled={Boolean(busy)} onClick={() => setConfirmingId(upload.id)}>
                                                    Review and confirm syllabus replacement
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {upload.kind === 'question_bank' && ['validated_waiting_phase3', 'needs_review'].includes(upload.status) && (
                                        <div className="ac-uploads__item-actions">
                                            <button type="button" className="ac-btn ac-btn--primary" disabled={reviewBusy || Boolean(busy)} onClick={() => openQuestionReview(upload)}>
                                                {upload.status === 'needs_review' ? 'Continue question review' : 'Parse questions for review'}
                                            </button>
                                        </div>
                                    )}
                                    {upload.status === 'published' && upload.kind === 'question_bank' && (
                                        <p className="ac-uploads__phase-note">This canonical question bank has been published with its subject, course, semester and exam type metadata.</p>
                                    )}

                                    {upload.status === 'retry_waiting' && (
                                        <div className="ac-uploads__item-actions">
                                            <button type="button" className="ac-btn ac-btn--secondary" disabled={Boolean(busy)} onClick={async () => {
                                                setBusy({ id: upload.id, phase: 'retrying' });
                                                setActionError('');
                                                try {
                                                    await apiRequest('POST', { action: 'retry_processing', uploadId: upload.id });
                                                    setNotice('The processing job has been queued again.');
                                                    await loadUploads();
                                                } catch (error) {
                                                    setActionError(error.message || 'Could not retry background processing.');
                                                } finally {
                                                    setBusy(null);
                                                }
                                            }}>Retry processing</button>
                                        </div>
                                    )}

                                    {upload.status === 'failed' && (
                                        <p className="ac-uploads__phase-note">This file was rejected and removed from private file storage. Select it again above to start a new upload.</p>
                                    )}
                                </article>
                            ))}
                        </div>}


            {review && (
                <section className="ac-question-review" aria-labelledby="ac-question-review-title">
                    <div className="ac-question-review__header">
                        <div>
                            <h4 id="ac-question-review-title">{review.bank.source_file_name}</h4>
                            <p>Subject {review.bank.subject_id} · Course {review.bank.course_id} · Semester {review.bank.semester} · {String(review.bank.exam_type).replace(/-/g, ' ').toUpperCase()}</p>
                        </div>
                        <span className={'ac-uploads__status ' + (review.bank.status === 'published' ? 'ac-uploads__status--active' : 'ac-uploads__status--needs_confirmation')}>
                            {review.bank.status === 'published' ? 'Published' : 'Awaiting approval'}
                        </span>
                    </div>
                    <div className="ac-question-review__summary">
                        <span><strong>{review.bank.total_questions}</strong> extracted</span>
                        <span><strong>{review.bank.valid_questions}</strong> valid</span>
                        <span><strong>{review.bank.rejected_questions}</strong> rejected</span>
                        <span><strong>{review.bank.warning_questions}</strong> warnings</span>
                        <span><strong>{includedQuestions.length}</strong> selected to publish</span>
                    </div>
                    {mcqMarkSets.length > 0 && (
                        <div className="ac-question-review__mark-check">
                            <strong>MCQ mark totals</strong>
                            {mcqMarkSets.map(item => (
                                <span key={item.set} className={item.complete && expectedExamMarks && item.marks !== expectedExamMarks ? 'is-warning' : ''}>
                                    Set {item.set}: {item.count} questions · {item.marks} marks
                                    {item.complete && expectedExamMarks ? ' / ' + expectedExamMarks + ' expected' : item.complete ? ' · 30-question set' : ' · short remainder retained'}
                                </span>
                            ))}
                            {needsMarkAcknowledgement && (
                                <label className="ac-question-review__check">
                                    <input type="checkbox" checked={markTotalsAcknowledged} disabled={reviewBusy || review.bank.status === 'published'} onChange={event => setMarkTotalsAcknowledged(event.target.checked)} />
                                    I checked the MCQ set mark totals against this exam format and approve the mismatch
                                </label>
                            )}
                        </div>
                    )}
                    {review.questions.map((question, index) => (
                        <article className={'ac-question-review__item ac-question-review__item--' + question.validation_status} key={question.id || question.sort_order}>
                            <div className="ac-question-review__item-head">
                                <strong>Question {question.sort_order} · {question.question_type.toUpperCase()}</strong>
                                <span>{question.validation_status.toUpperCase()}</span>
                            </div>
                            <p className="ac-question-review__source">Source: {question.source_location?.page ? 'PDF page ' + question.source_location.page : question.source_location?.paragraph ? 'DOCX paragraph ' + question.source_location.paragraph : question.source_location?.row ? 'CSV row ' + question.source_location.row : 'Unspecified location'}</p>
                            <label>Question text
                                <textarea value={question.question_text} disabled={reviewBusy || review.bank.status === 'published'} onChange={event => updateReviewQuestion(index, { question_text: event.target.value })} rows={2} />
                            </label>
                            {question.question_type === 'mcq' ? (
                                <div className="ac-question-review__options">
                                    {question.options.map((option, optionIndex) => (
                                        <label key={optionIndex}>Option {String.fromCharCode(65 + optionIndex)}
                                            <input value={option} disabled={reviewBusy || review.bank.status === 'published'} onChange={event => {
                                                const options = [...question.options];
                                                options[optionIndex] = event.target.value;
                                                updateReviewQuestion(index, { options });
                                            }} />
                                        </label>
                                    ))}
                                    <label>Correct option
                                        <select value={question.correct_option_index ?? ''} disabled={reviewBusy || review.bank.status === 'published'} onChange={event => updateReviewQuestion(index, { correct_option_index: event.target.value === '' ? null : Number(event.target.value) })}>
                                            <option value="">Select answer</option>
                                            {[0,1,2,3].map(i => <option value={i} key={i}>{String.fromCharCode(65 + i)}</option>)}
                                        </select>
                                    </label>
                                </div>
                            ) : (
                                <label>Model answer
                                    <textarea value={question.model_answer || ''} disabled={reviewBusy || review.bank.status === 'published'} onChange={event => updateReviewQuestion(index, { model_answer: event.target.value })} rows={3} />
                                </label>
                            )}
                            <div className="ac-question-review__metadata">
                                <label>Marks<input type="number" min="0.5" step="0.5" value={question.marks ?? ''} disabled={reviewBusy || review.bank.status === 'published'} onChange={event => updateReviewQuestion(index, { marks: event.target.value === '' ? null : Number(event.target.value) })} /></label>
                                <label>Difficulty<select value={question.difficulty || ''} disabled={reviewBusy || review.bank.status === 'published'} onChange={event => updateReviewQuestion(index, { difficulty: event.target.value })}><option value="">Choose</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
                            </div>
                            {question.question_type === 'theory' && (
                                <label>Marking rubric
                                    <textarea value={question.rubric || ''} disabled={reviewBusy || review.bank.status === 'published'} onChange={event => updateReviewQuestion(index, { rubric: event.target.value, rubric_reviewed: false })} rows={3} />
                                </label>
                            )}
                            {question.rubric_generated && (
                                <label className="ac-question-review__check">
                                    <input type="checkbox" checked={Boolean(question.rubric_reviewed)} disabled={reviewBusy || review.bank.status === 'published'} onChange={event => updateReviewQuestion(index, { rubric_reviewed: event.target.checked })} />
                                    I reviewed and approve this generated rubric
                                </label>
                            )}
                            {question.validation_errors?.length > 0 && <ul className="ac-question-review__errors">{question.validation_errors.map((error, i) => <li key={i}>{error}</li>)}</ul>}
                            <label className="ac-question-review__check">
                                <input type="checkbox" checked={Boolean(question.include_in_publish)} disabled={reviewBusy || review.bank.status === 'published'} onChange={event => updateReviewQuestion(index, { include_in_publish: event.target.checked })} />
                                Include this question in the published bank
                            </label>
                        </article>
                    ))}
                    {reviewError && <div className="ac-uploads__error" role="alert"><AlertCircle size={17} /><span>{reviewError}</span></div>}
                    {publishReport && (
                        <div className="ac-uploads__notice" role="status">
                            <CheckCircle2 size={17} />
                            <span>Published {publishReport.published_questions} questions. {publishReport.sets?.filter(item => !item.is_complete).length || 0} incomplete MCQ short set(s) retained rather than discarded.</span>
                        </div>
                    )}
                    {review.bank.status !== 'published' && (
                        <div className="ac-question-review__actions">
                            <button type="button" className="ac-btn ac-btn--secondary" disabled={reviewBusy} onClick={async () => {
                                setReviewBusy(true); setReviewError('');
                                try { await saveQuestionReview(); setNotice('Question corrections saved.'); }
                                catch (error) { setReviewError(error.message || 'Could not save review.'); }
                                finally { setReviewBusy(false); }
                            }}>Save review</button>
                            <button type="button" className="ac-btn ac-btn--primary" disabled={reviewBusy || includedQuestions.length === 0 || blockingQuestions.length > 0 || (needsMarkAcknowledgement && !markTotalsAcknowledged)} onClick={publishQuestionBank}>
                                Publish {includedQuestions.length} approved questions
                            </button>
                            <span>{blockingQuestions.length ? blockingQuestions.length + ' selected question(s) still need correction or rubric approval.' : needsMarkAcknowledgement && !markTotalsAcknowledged ? 'Acknowledge the exam mark-total mismatch before publishing.' : 'Only selected, validated questions can be published.'}</span>
                        </div>
                    )}
                </section>
            )}

            {activeSyllabus && <p className="ac-uploads__active-summary"><CheckCircle2 size={15} /> Active syllabus: <strong>{activeSyllabus.file_name}</strong></p>}

            <p className="ac-uploads__keep-open">Keep this page open until the upload and validation status is shown. An interrupted upload remains listed so it can be resumed with the same file.</p>
        </section>
    );
}

