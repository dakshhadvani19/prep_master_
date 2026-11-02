import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createClient } from '@supabase/supabase-js';
import {
    MAX_UPLOAD_BYTES,
    UploadValidationError,
    validateUploadMetadata,
} from './_lib/admin-course-upload-metadata.js';

export const config = { maxDuration: 60 };

const process = globalThis.process;
const BUCKET = 'admin-course-files';

function envFirst(...names) {
    for (const name of names) {
        if (process.env[name]?.trim()) return process.env[name].trim();
    }
    return '';
}

function serviceClient() {
    const url = envFirst('SUPABASE_URL', 'VITE_SUPABASE_URL').replace(/\/+$/, '');
    let key = envFirst('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY');
    if (!key) {
        try {
            key = JSON.parse(process.env.SUPABASE_SECRET_KEYS || '{}').default || '';
        } catch {
            key = '';
        }
    }
    if (!url || !key) throw new Error('Supabase server credentials are not configured.');
    return createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
}

function fail(res, status, message, extra = {}) {
    return res.status(status).json({ error: message, ...extra });
}

function requestBody(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') {
        try { return JSON.parse(req.body); } catch { return {}; }
    }
    return {};
}

function positiveInteger(value, name, allowZero = false) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < (allowZero ? 0 : 1)) {
        throw new UploadValidationError(name + ' is invalid.');
    }
    return number;
}

async function authenticateAdmin(req, client) {
    const tokenMatch = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    if (!tokenMatch) return { error: { status: 401, message: 'Sign in to manage course files.' } };

    const { data, error } = await client.auth.getUser(tokenMatch[1]);
    const user = error ? null : data?.user;
    if (!user) return { error: { status: 401, message: 'Your session is invalid or expired. Sign in again.' } };

    const { data: adminRecord, error: adminError } = await client
        .from('Admins')
        .select('AdminId,isSuperAdmin')
        .eq('auth_uid', user.id)
        .maybeSingle();

    if (adminError) {
        return { error: { status: 503, message: 'Admin access could not be verified. Please retry.' } };
    }
    if (!adminRecord) {
        return { error: { status: 403, message: 'Only verified administrators can manage course files.' } };
    }
    return { user, adminRecord };
}

async function getSubject(client, subjectId) {
    const { data, error } = await client
        .from('Subjects')
        .select('SubjectId,SubjectName,CourseId,Semester,isDepartmentalSubject')
        .eq('SubjectId', subjectId)
        .maybeSingle();
    if (error) throw new Error('The selected subject could not be verified.');
    if (!data) throw new UploadValidationError('The selected subject no longer exists in the catalog.');
    return data;
}

async function listUploads(client, adminUid, subjectId) {
    const { data, error } = await client.rpc('pm_admin_course_upload_list', {
        p_admin_auth_uid: adminUid,
        p_subject_id: subjectId,
    });
    if (error) throw new Error('Could not load the subject file history.');
    return Array.isArray(data) ? data : [];
}

async function setValidation(client, adminUid, uploadId, status, fields = {}) {
    const { data, error } = await client.rpc('pm_admin_course_upload_set_validation', {
        p_admin_auth_uid: adminUid,
        p_upload_id: uploadId,
        p_status: status,
        p_validation_details: fields.validation_details || {},
        p_preview_text: fields.preview_text ?? null,
        p_page_count: fields.page_count ?? null,
        p_word_count: fields.word_count ?? null,
        p_row_count: fields.row_count ?? null,
        p_error_message: fields.error_message ?? null,
    });
    if (error) throw new Error('Could not save the file validation result.');
    return data;
}

async function removeStoredObject(client, objectPath) {
    try {
        await client.storage.from(BUCKET).remove([objectPath]);
    } catch {
        // Keep the metadata failure visible even if Storage cleanup is temporarily unavailable.
    }
}

async function handleStart(client, user, body) {
    const subjectId = positiveInteger(body.subjectId, 'Subject ID');
    const courseId = positiveInteger(body.courseId, 'Course ID');
    const semester = positiveInteger(body.semester, 'Semester', true);
    const kind = String(body.kind || '').trim();
    const subject = await getSubject(client, subjectId);

    if (Number(subject.CourseId) !== courseId || Number(subject.Semester) !== semester) {
        throw new UploadValidationError('The selected course and semester do not match this subject in the live catalog.');
    }
    if (!['syllabus', 'question_bank'].includes(kind)) {
        throw new UploadValidationError('Choose either a syllabus or a question bank upload.');
    }

    let examType = null;
    if (kind === 'question_bank') {
        const { getExamTypesForSubject } = await import('../src/utils/subjectExamPolicy.js');
        examType = String(body.examType || '').trim();
        if (!getExamTypesForSubject(subject.isDepartmentalSubject).includes(examType)) {
            throw new UploadValidationError('Choose an exam type that is available for this subject.');
        }
    }

    const file = validateUploadMetadata({
        kind,
        fileName: body.fileName,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
    });
    if (file.sizeBytes > MAX_UPLOAD_BYTES) {
        throw new UploadValidationError('Files must be 20 MB or smaller.');
    }

    const objectPath = 'subjects/' + subjectId + '/' + randomUUID() + '.' + file.extension;
    const { data, error } = await client.rpc('pm_admin_course_upload_create', {
        p_admin_auth_uid: user.id,
        p_subject_id: subjectId,
        p_course_id: courseId,
        p_semester: semester,
        p_kind: kind,
        p_exam_type: examType,
        p_file_name: file.fileName,
        p_file_extension: file.extension,
        p_mime_type: file.mimeType,
        p_size_bytes: file.sizeBytes,
        p_object_path: objectPath,
    });
    if (error || !data?.id) {
        throw new Error('Could not create the upload record. No file was uploaded.');
    }
    return {
        upload: {
            id: data.id,
            object_path: data.object_path,
            file_name: data.file_name,
            file_extension: data.file_extension,
            mime_type: data.mime_type,
            size_bytes: data.size_bytes,
            status: data.status,
        },
    };
}

async function handleResume(client, adminUid, body) {
    const subjectId = positiveInteger(body.subjectId, 'Subject ID');
    const uploadId = String(body.uploadId || '');
    if (!/^[0-9a-f-]{36}$/i.test(uploadId)) throw new UploadValidationError('The upload record is invalid.');
    const uploads = await listUploads(client, adminUid, subjectId);
    const record = uploads.find(item => item.id === uploadId);
    if (!record || record.status !== 'uploading') {
        throw new UploadValidationError('This upload is no longer available to resume. Refresh the file history.');
    }
    return {
        upload: {
            id: record.id,
            object_path: record.object_path,
            file_name: record.file_name,
            file_extension: record.file_extension,
            mime_type: record.mime_type,
            size_bytes: record.size_bytes,
            status: record.status,
        },
    };
}

async function getStoredObjectSize(client, record) {
    const parts = String(record.object_path || '').split('/');
    const objectName = parts.pop();
    const folder = parts.join('/');
    if (!objectName || !folder) throw new Error('The stored file path is invalid.');
    const { data, error } = await client.storage.from(BUCKET).list(folder, { limit: 10, search: objectName });
    if (error) throw new Error('Could not verify the uploaded file in private storage.');
    const object = (data || []).find(item => item.name === objectName);
    if (!object) return null;
    const metadataSize = Number(object.metadata?.size ?? object.metadata?.contentLength);
    if (Number.isSafeInteger(metadataSize) && metadataSize >= 0) return metadataSize;
    const { data: fileData, error: downloadError } = await client.storage.from(BUCKET).download(record.object_path);
    if (downloadError || !fileData) throw new Error('The uploaded file is present but its size could not be verified.');
    return Number(fileData.size ?? (await fileData.arrayBuffer()).byteLength);
}

async function handleFinalize(client, adminUid, body) {
    const subjectId = positiveInteger(body.subjectId, 'Subject ID');
    const uploadId = String(body.uploadId || '');
    if (!/^[0-9a-f-]{36}$/i.test(uploadId)) throw new UploadValidationError('Invalid upload ID.');
    const uploads = await listUploads(client, adminUid, subjectId);
    const record = uploads.find(upload => upload.id === uploadId);
    if (!record) throw new UploadValidationError('This upload does not belong to the selected subject.');

    if (record.status !== 'uploading') {
        const accepted = ['queued', 'processing', 'retry_waiting', 'needs_confirmation',
            'validated_waiting_phase3', 'needs_review', 'published', 'active', 'superseded'].includes(record.status);
        return {
            upload: record,
            accepted,
            safe_to_close: accepted,
            message: accepted ? 'The uploaded file is safely stored. Background processing continues independently.' : undefined,
        };
    }

    const storedSize = await getStoredObjectSize(client, record);
    if (storedSize === null) {
        return {
            upload: record,
            incomplete: true,
            message: 'The file has not finished reaching private storage yet. Retry once the transfer completes.',
        };
    }
    if (storedSize !== Number(record.size_bytes)) {
        const message = 'The stored file size does not match the uploaded file. Please upload the file again.';
        const failed = await setValidation(client, adminUid, record.id, 'failed', {
            validation_details: { expected_bytes: Number(record.size_bytes), stored_bytes: storedSize },
            error_message: message,
        });
        await client.storage.from(BUCKET).remove([record.object_path]);
        return { upload: failed, failed: true };
    }

    const { data, error } = await client.rpc('pm_admin_course_upload_accept', {
        p_admin_auth_uid: adminUid,
        p_upload_id: uploadId,
    });
    if (error || !data) {
        throw new Error(error?.message || 'The file is stored, but its background job could not be queued. Retry from upload history.');
    }
    return {
        upload: data,
        accepted: true,
        safe_to_close: true,
        message: 'File stored and queued successfully. You can safely close this page; validation continues in the background.',
    };
}

async function handleRetryProcessing(client, adminUid, body) {
    const uploadId = String(body.uploadId || '');
    if (!/^[0-9a-f-]{36}$/i.test(uploadId)) throw new UploadValidationError('Invalid upload ID.');
    const { data, error } = await client.rpc('pm_admin_course_upload_retry_processing', {
        p_admin_auth_uid: adminUid,
        p_upload_id: uploadId,
    });
    if (error || !data) throw new UploadValidationError(error?.message || 'This upload is not waiting for a processing retry.');
    return { upload: data, accepted: true, safe_to_close: true };
}

async function handleConfirmSyllabus(client, adminUid, body) {
    const uploadId = String(body.uploadId || '');
    if (!/^[0-9a-f-]{36}$/i.test(uploadId)) throw new UploadValidationError('The upload record is invalid.');
    const { data, error } = await client.rpc('pm_admin_course_upload_confirm_syllabus', {
        p_admin_auth_uid: adminUid,
        p_upload_id: uploadId,
    });
    if (error || !data?.id) {
        throw new UploadValidationError('This syllabus is not ready to become active. Validate it first, then retry.');
    }
    return { upload: data };
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Authorization');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!['GET', 'POST'].includes(req.method)) return fail(res, 405, 'Method not allowed.');

    try {
        const client = serviceClient();
        const auth = await authenticateAdmin(req, client);
        if (auth.error) return fail(res, auth.error.status, auth.error.message);
        const { user } = auth;

        if (req.method === 'GET') {
            const url = new URL(req.url, 'http://localhost');
            const subjectId = positiveInteger(url.searchParams.get('subjectId'), 'Subject ID');
            await getSubject(client, subjectId);
            const uploads = await listUploads(client, user.id, subjectId);
            const uploadId = url.searchParams.get('uploadId');
            if (uploadId) {
                if (!uploads.some(item => item.id === uploadId)) throw new UploadValidationError('Upload not found for this subject.');
                const { data, error } = await client.rpc('pm_admin_course_bank_get', {
                    p_admin_auth_uid: user.id, p_upload_id: uploadId,
                });
                if (error) throw new Error('Could not load question-bank review.');
                return res.status(200).json({ review: data });
            }
            return res.status(200).json({ uploads });
        }

        const body = requestBody(req);
        if (body.action === 'start') {
            const result = await handleStart(client, user, body);
            return res.status(201).json(result);
        }
        if (body.action === 'resume') {
            const result = await handleResume(client, user.id, body);
            return res.status(200).json(result);
        }
        if (body.action === 'finalize') {
            const result = await handleFinalize(client, user.id, body);
            return res.status(result.incomplete ? 409 : result.accepted ? 202 : 200).json(result);
        }
        if (body.action === 'retry_processing') {
            const result = await handleRetryProcessing(client, user.id, body);
            return res.status(202).json(result);
        }
        if (body.action === 'confirm_syllabus') {
            const result = await handleConfirmSyllabus(client, user.id, body);
            return res.status(200).json(result);
        }
        if (body.action === 'parse_question_bank') {
            const subjectId = positiveInteger(body.subjectId, 'Subject ID');
            const uploadId = String(body.uploadId || '');
            if (!/^[0-9a-f-]{36}$/i.test(uploadId)) throw new UploadValidationError('Upload record is invalid.');
            const uploads = await listUploads(client, user.id, subjectId);
            const record = uploads.find(item => item.id === uploadId);
            if (!record || record.kind !== 'question_bank' || !['validated_waiting_phase3','needs_review'].includes(record.status)) {
                throw new UploadValidationError('This question bank is not ready for parsing.');
            }
            if (record.status === 'needs_review') {
                const { data, error } = await client.rpc('pm_admin_course_bank_get', { p_admin_auth_uid: user.id, p_upload_id: uploadId });
                if (error || !data) throw new Error('Could not load existing review.');
                return res.status(200).json({ review: data });
            }
            const { data: fileData, error: downloadError } = await client.storage.from(BUCKET).download(record.object_path);
            if (downloadError || !fileData) throw new Error('Original file is not available in private storage.');
            const { parseQuestionBankForReview } = await import('./_lib/question-bank-parser.js');
            const questions = await parseQuestionBankForReview(record, Buffer.from(await fileData.arrayBuffer()));
            const { data, error } = await client.rpc('pm_admin_course_bank_save_review', {
                p_admin_auth_uid: user.id, p_upload_id: uploadId, p_questions: questions,
            });
            if (error || !data) throw new Error('Could not save parsed question review.');
            return res.status(200).json({ review: data });
        }
        if (body.action === 'save_review') {
            const uploadId = String(body.uploadId || '');
            if (!/^[0-9a-f-]{36}$/i.test(uploadId) || !Array.isArray(body.questions)) throw new UploadValidationError('Review payload is invalid.');
            const { data, error } = await client.rpc('pm_admin_course_bank_save_review', {
                p_admin_auth_uid: user.id, p_upload_id: uploadId, p_questions: body.questions,
            });
            if (error || !data) throw new Error('Could not save question-bank corrections.');
            return res.status(200).json({ review: data });
        }
        if (body.action === 'publish_question_bank') {
            const uploadId = String(body.uploadId || '');
            if (!/^[0-9a-f-]{36}$/i.test(uploadId)) throw new UploadValidationError('Upload record is invalid.');
            const { data: bankData, error: bankError } = await client.rpc('pm_admin_course_bank_get', {
                p_admin_auth_uid: user.id, p_upload_id: uploadId,
            });
            if (bankError || !bankData?.bank) throw new UploadValidationError('Question bank was not found for publication.');
            const subject = await getSubject(client, Number(bankData.bank.subject_id));
            const { getSubjectExamInfo } = await import('../src/utils/subjectExamPolicy.js');
            const examInfo = getSubjectExamInfo(bankData.bank.exam_type, subject.isDepartmentalSubject);
            const expectedTotalMarks = Number(examInfo?.totalMarks) || null;
            const { data, error } = await client.rpc('pm_admin_course_bank_publish', {
                p_admin_auth_uid: user.id,
                p_upload_id: uploadId,
                p_expected_total_marks: expectedTotalMarks,
                p_acknowledge_mark_mismatch: body.acknowledgeMarkMismatch === true,
            });
            if (error) throw new UploadValidationError(
                error.message?.includes('generated_rubrics') ? 'Review all generated theory rubrics before publishing.'
                    : error.message?.includes('included_questions') ? 'Fix or exclude all rejected questions before publishing.'
                        : error.message?.includes('mark_total_mismatch') ? 'A full 30-question MCQ set has a mark total that differs from the selected exam format. Review and acknowledge the mismatch.'
                            : 'Question bank could not be published. Review its validation status and try again.'
            );
            return res.status(200).json({ published: data });
        }
        return fail(res, 400, 'Unknown course-file action.');
    } catch (error) {
        if (error instanceof UploadValidationError) {
            return fail(res, 400, error.message, error.details || {});
        }
        const errorUrl = req.method === 'GET' ? new URL(req.url, 'http://localhost') : null;
        const errorBody = req.method === 'POST' ? requestBody(req) : null;
        console.error('[admin-course-uploads] request failed:', {
            requestId: String(req.headers['x-vercel-id'] || '').slice(0, 128),
            method: req.method,
            action: errorBody?.action || (req.method === 'GET' ? 'list' : 'unknown'),
            subjectId: errorBody?.subjectId ?? errorUrl?.searchParams.get('subjectId') ?? null,
            uploadId: errorBody?.uploadId ?? errorUrl?.searchParams.get('uploadId') ?? null,
            error: error?.stack || error?.message || String(error),
        });
        return fail(res, 503, 'The course-file service could not complete the request. Please retry.', {
            code: 'COURSE_FILE_SERVICE_ERROR',
        });
    }
}

