import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { UploadValidationError, validateCourseUpload } from './_lib/admin-course-upload-validation.js';

const BUCKET = 'admin-course-files';
export const config = { maxDuration: 60 };

function serviceClient() {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error('Supabase server configuration is missing.');
    return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function hasWorkerAccess(req) {
    const expected = String(process.env.ADMIN_COURSE_UPLOAD_WORKER_SECRET || '');
    const supplied = String(req.headers['x-course-upload-worker-token'] || '');
    if (!expected || !supplied) return false;
    const expectedBytes = Buffer.from(expected);
    const suppliedBytes = Buffer.from(supplied);
    return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

async function finishJob(client, job, status, result = {}, errorMessage = null) {
    const { data, error } = await client.rpc('pm_admin_course_upload_job_finish', {
        p_upload_id: job.id,
        p_message_id: Number(job.queue_message_id),
        p_status: status,
        p_validation_details: result.validation_details || {},
        p_preview_text: result.preview_text || null,
        p_page_count: result.page_count ?? null,
        p_word_count: result.word_count ?? null,
        p_row_count: result.row_count ?? null,
        p_error_message: errorMessage,
    });
    if (error || !data) throw new Error(error?.message || 'Could not save background validation result.');
    return data;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    if (!hasWorkerAccess(req)) return res.status(401).json({ error: 'Worker authentication failed.' });

    try {
        const client = serviceClient();
        const { data: job, error: claimError } = await client.rpc('pm_admin_course_upload_job_claim');
        if (claimError) throw claimError;
        if (!job) return res.status(200).json({ processed: false, message: 'No queued uploads.' });

        const messageId = Number(job.queue_message_id);
        if (!Number.isSafeInteger(messageId) || messageId < 1) throw new Error('Invalid queue message identifier.');

        try {
            const { data: fileData, error: downloadError } = await client.storage.from(BUCKET).download(job.object_path);
            if (downloadError || !fileData) {
                throw new Error(downloadError?.message || 'The source file could not be downloaded from private storage.');
            }
            const buffer = Buffer.from(await fileData.arrayBuffer());
            if (buffer.length !== Number(job.size_bytes)) {
                throw new UploadValidationError('The stored file size does not match the accepted upload metadata.');
            }
            const result = await validateCourseUpload(job, buffer);
            const status = job.kind === 'syllabus' ? 'needs_confirmation' : 'validated_waiting_phase3';
            const saved = await finishJob(client, job, status, result);
            return res.status(200).json({ processed: true, upload_id: job.id, status: saved.status });
        } catch (error) {
            if (error instanceof UploadValidationError || error?.name === 'UploadValidationError') {
                const saved = await finishJob(client, job, 'failed', {}, error.message || 'The file did not pass validation.');
                await client.storage.from(BUCKET).remove([job.object_path]);
                return res.status(200).json({ processed: true, upload_id: job.id, status: saved.status });
            }
            const { data: retry, error: retryError } = await client.rpc('pm_admin_course_upload_job_retry', {
                p_upload_id: job.id,
                p_message_id: messageId,
                p_error_message: String(error?.message || 'Unexpected processing error').slice(0, 1000),
            });
            if (retryError) throw retryError;
            console.error('[admin-course-upload-worker]', {
                uploadId: job.id,
                attempt: job.processing_attempts,
                error: error?.stack || error?.message || String(error),
            });
            return res.status(200).json({
                processed: true,
                upload_id: job.id,
                status: retry?.status || 'queued',
                retried: retry?.status !== 'retry_waiting',
            });
        }
    } catch (error) {
        console.error('[admin-course-upload-worker]', error?.stack || error?.message || String(error));
        return res.status(500).json({ error: 'The background upload worker could not process a job.' });
    }
}
