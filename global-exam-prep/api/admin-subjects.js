import { Buffer } from 'node:buffer';
import { createClient } from '@supabase/supabase-js';
import {
    UploadValidationError,
    extractSyllabusText,
    validateUploadMetadata,
} from './_lib/admin-course-upload-validation.js';

export const config = { maxDuration: 60 };

const process = globalThis.process;
const BUCKET = 'admin-course-files';
const MAX_BIGINT = 9223372036854775807n;

function envFirst(...names) {
    for (const name of names) {
        if (process.env[name]?.trim()) return process.env[name].trim();
    }
    return '';
}

function serviceClient() {
    const url = envFirst('SUPABASE_URL', 'VITE_SUPABASE_URL').replace(/\\/+$/, '');
    let key = envFirst('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY');
    if (!key) {
        try { key = JSON.parse(process.env.SUPABASE_SECRET_KEYS || '{}').default || ''; } catch { key = ''; }
    }
    if (!url || !key) throw new Error('Supabase server credentials are not configured.');
    return createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
}

function bodyOf(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') {
        try { return JSON.parse(req.body); } catch { return {}; }
    }
    return {};
}

function positiveInteger(value, label, allowZero = false) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < (allowZero ? 0 : 1)) {
        throw new UploadValidationError(label + ' is invalid.');
    }
    return number;
}

async function authenticateAdmin(req, client) {
    const token = String(req.headers.authorization || '').match(/^Bearer\\s+(.+)$/i)?.[1];
    if (!token) return { error: { status: 401, message: 'Sign in to edit subjects.' } };
    const { data, error } = await client.auth.getUser(token);
    const user = error ? null : data?.user;
    if (!user) return { error: { status: 401, message: 'Your session is invalid or expired. Sign in again.' } };
    const { data: admin, error: adminError } = await client
        .from('Admins').select('AdminId').eq('auth_uid', user.id).maybeSingle();
    if (adminError) return { error: { status: 503, message: 'Admin access could not be verified.' } };
    if (!admin) return { error: { status: 403, message: 'Only verified administrators can edit subjects.' } };
    return { user };
}

function encodeOfficialCode(value) {
    const code = String(value || '').trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._/ -]{1,39}$/.test(code)) {
        throw new UploadValidationError('Enter the official subject code from the syllabus.');
    }
    const digits = [...code].map(char => {
        if (/^[0-9]$/.test(char)) return char;
        if (/^[A-Z]$/.test(char)) return String(char.charCodeAt(0) - 64);
        return '';
    }).join('');
    if (!digits || digits.length > 10) {
        throw new UploadValidationError('This subject code cannot be encoded into the catalog Subject ID format.');
    }
    return digits;
}

async function allocateSubjectId(client, courseId, subjectCode) {
    const encodedCode = encodeOfficialCode(subjectCode);
    const { data, error } = await client.from('Subjects').select('SubjectId').eq('CourseId', courseId);
    if (error) throw new Error('Existing subject IDs could not be checked.');
    const used = new Set((data || []).map(row => String(row.SubjectId)));
    for (let occurrence = 1; occurrence <= 99; occurrence += 1) {
        const suffix = encodedCode + String(occurrence).padStart(2, '0');
        if (suffix.length > 12) break;
        const candidate = BigInt(String(courseId) + suffix.padStart(12, '0'));
        if (candidate <= 0n || candidate > MAX_BIGINT) break;
        const subjectId = candidate.toString();
        if (!used.has(subjectId)) return subjectId;
    }
    throw new UploadValidationError('A free canonical Subject ID could not be allocated for this subject code. Check the official code and existing course mapping.');
}

async function removeStoredFile(client, objectPath) {
    if (!objectPath) return;
    await client.storage.from(BUCKET).remove([objectPath]);
}

async function addSubject(client, user, body) {
    const courseId = positiveInteger(body.courseId, 'Course ID');
    const semester = positiveInteger(body.semester, 'Semester', true);
    const subjectName = String(body.subjectName || '').trim();
    const subjectCode = String(body.subjectCode || '').trim().toUpperCase();
    const subjectType = String(body.subjectType || '').trim().toLowerCase();
    const isDepartmental = body.isDepartmentalSubject === true;
    if (subjectName.length < 2 || subjectName.length > 180) {
        throw new UploadValidationError('Subject name must contain 2–180 characters.');
    }
    if (!['theory', 'practical', 'both'].includes(subjectType)) {
        throw new UploadValidationError('Choose Theory, Practical, or Theory + Practical as the subject type.');
    }

    const { data: course, error: courseError } = await client
        .from('Courses').select('CourseId,Sems').eq('CourseId', courseId).maybeSingle();
    if (courseError || !course || !(course.Sems || []).map(Number).includes(semester)) {
        throw new UploadValidationError('The selected semester does not belong to this course.');
    }

    const extension = String(body.fileName || '').split('.').pop()?.toLowerCase();
    const file = validateUploadMetadata({
        kind: 'syllabus',
        fileName: body.fileName,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
    });
    const objectPath = String(body.objectPath || '');
    const expectedPrefix = 'subjects/new/' + user.id + '/';
    const relativeObjectName = objectPath.startsWith(expectedPrefix)
        ? objectPath.slice(expectedPrefix.length)
        : '';
    if (!/^[0-9a-f-]{36}\\.(pdf|docx)$/i.test(relativeObjectName) || extension !== file.extension) {
        throw new UploadValidationError('The uploaded syllabus object path is invalid. Please select the file again.');
    }

    let saved = false;
    try {
        const { data: fileData, error: downloadError } = await client.storage.from(BUCKET).download(objectPath);
        if (downloadError || !fileData) {
            throw new UploadValidationError('The syllabus file is not present in private storage. Upload it again.');
        }
        const buffer = Buffer.from(await fileData.arrayBuffer());
        if (buffer.length !== file.sizeBytes) {
            throw new UploadValidationError('The uploaded file size does not match. Upload the syllabus again.');
        }
        const extracted = await extractSyllabusText({
            file_extension: file.extension,
            mime_type: file.mimeType,
        }, buffer);
        if (extracted.word_count < 10) {
            throw new UploadValidationError('The syllabus contains too little readable text. Upload a complete text-readable PDF or DOCX.');
        }

        const subjectId = await allocateSubjectId(client, courseId, subjectCode);
        const { data, error } = await client.rpc('pm_admin_subject_create', {
            p_admin_auth_uid: user.id,
            p_subject_id: subjectId,
            p_subject_name: subjectName,
            p_subject_code: subjectCode,
            p_course_id: courseId,
            p_semester: semester,
            p_is_departmental: isDepartmental,
            p_subject_type: subjectType,
            p_syllabus_text: extracted.text,
            p_file_name: file.fileName,
            p_file_extension: file.extension,
            p_mime_type: file.mimeType,
            p_size_bytes: file.sizeBytes,
            p_object_path: objectPath,
            p_page_count: extracted.page_count,
            p_word_count: extracted.word_count,
        });
        if (error || !data?.subject) {
            if (error?.code === '23505') throw new UploadValidationError('This Subject ID is already in use. Retry the add operation to allocate the next available occurrence.');
            throw new Error(error?.message || 'The subject and extracted syllabus could not be saved.');
        }
        saved = true;
        return {
            subjectId: String(data.subject.SubjectId),
            subjectName: data.subject.SubjectName,
            courseId,
            semester,
            extractedWords: extracted.word_count,
            pageCount: extracted.page_count,
        };
    } catch (error) {
        if (!saved) await removeStoredFile(client, objectPath);
        throw error;
    }
}

async function removeSubject(client, user, body) {
    const subjectId = positiveInteger(body.subjectId, 'Subject ID');
    const courseId = positiveInteger(body.courseId, 'Course ID');
    const semester = positiveInteger(body.semester, 'Semester', true);
    const { data, error } = await client.rpc('pm_admin_subject_remove', {
        p_admin_auth_uid: user.id,
        p_subject_id: subjectId,
        p_course_id: courseId,
        p_semester: semester,
    });
    if (error) {
        if (error.code === '23503' || String(error.message || '').includes('subject_has_exam_or_question_history')) {
            throw Object.assign(new Error('This subject has exam attempts, leaderboard results, or published question banks. It cannot be removed without damaging existing records.'), { status: 409 });
        }
        if (error.code === 'P0002') throw Object.assign(new Error('The selected subject no longer exists in this course and semester.'), { status: 404 });
        throw new Error('The subject could not be removed. ' + (error.message || 'Please retry.'));
    }
    const paths = Array.isArray(data?.object_paths) ? data.object_paths.filter(Boolean) : [];
    let storageCleanupWarning = false;
    if (paths.length) {
        const { error: storageError } = await client.storage.from(BUCKET).remove(paths);
        storageCleanupWarning = Boolean(storageError);
    }
    return { subjectId: String(subjectId), storageCleanupWarning };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const client = serviceClient();
    const auth = await authenticateAdmin(req, client);
    if (auth.error) return res.status(auth.error.status).json({ error: auth.error.message });

    const body = bodyOf(req);
    try {
        if (body.action === 'add') {
            const result = await addSubject(client, auth.user, body);
            return res.status(201).json({ ok: true, ...result });
        }
        if (body.action === 'remove') {
            const result = await removeSubject(client, auth.user, body);
            return res.status(200).json({ ok: true, ...result });
        }
        return res.status(400).json({ error: 'Choose Add subject or Remove subject.' });
    } catch (error) {
        const status = Number(error?.status) || (error instanceof UploadValidationError ? 400 : 500);
        console.error('[admin-subjects]', error?.message || String(error));
        return res.status(status).json({
            error: status >= 500 ? 'The subject could not be saved. Please retry.' : error.message,
        });
    }
}
