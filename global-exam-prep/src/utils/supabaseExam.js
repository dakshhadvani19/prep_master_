/**
 * supabaseExam.js — Persistence for exam attempts and grades via Supabase.
 *
 * Reuses the shared browser Supabase client from src/supabase.js (which reads
 * VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY and enforces RLS).
 *
 * Stores:
 *   - exam_attempts: one row per student attempt (questions, answers, score, status)
 *   - exam_grades: graded results linked to an attempt
 *
 * Answer keys and generated questions are NEVER written to browser storage.
 * All persistence happens server-side via Supabase.
 */

import { supabase, requireSupabase } from '../supabase.js';

/**
 * Get the current authenticated user's id.
 */
async function getCurrentUserId() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw new Error('Not authenticated');
    return user.id;
}

/**
 * Save a new exam attempt. The questions payload excludes internal review
 * metadata (student-safe). Answers are stored empty initially.
 *
 * @param {object} payload { subjectCode, subjectName, examType, questions, totalMarks, timeMinutes }
 * @returns {Promise<{id, error}>}
 */
export async function saveExamAttempt(payload) {
    requireSupabase();
    const userId = await getCurrentUserId();

    const attempt = {
        user_id: userId,
        subject_code: payload.subjectCode,
        subject_name: payload.subjectName,
        exam_type: payload.examType,
        questions: payload.questions, // student-safe (review metadata stripped)
        total_marks: payload.totalMarks,
        time_minutes: payload.timeMinutes,
        answers: {}, // questionId -> student answer
        score: null,
        status: 'in_progress',
        started_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('exam_attempts').insert([attempt]).select('id').single();
    if (error) return { id: null, error: error.message };
    return { id: data.id, error: null };
}

/**
 * Update an in-progress attempt's answers. Idempotent — re-saving the same
 * answers does not create duplicates.
 *
 * @param {string} attemptId
 * @param {object} answers { [questionId]: string | number | null }
 * @returns {Promise<{ok, error}>}
 */
export async function updateAttemptAnswers(attemptId, answers) {
    requireSupabase();
    const { error } = await supabase
        .from('exam_attempts')
        .update({ answers, updated_at: new Date().toISOString() })
        .eq('id', attemptId)
        .eq('status', 'in_progress');
    if (error) return { ok: false, error: error.message };
    return { ok: true, error: null };
}

/**
 * Mark an attempt as submitted and record the score. Prevents duplicate
 * submission by only allowing transition from 'in_progress' to 'submitted'.
 *
 * @param {string} attemptId
 * @param {number} score
 * @param {object} answers
 * @returns {Promise<{ok, error, alreadySubmitted}>}
 */
export async function submitExamAttempt(attemptId, score, answers) {
    requireSupabase();
    const { error, data } = await supabase
        .from('exam_attempts')
        .update({
            answers,
            score,
            status: 'submitted',
            submitted_at: new Date().toISOString(),
        })
        .eq('id', attemptId)
        .eq('status', 'in_progress') // idempotent guard: only in_progress can be submitted
        .select();

    if (error) return { ok: false, error: error.message, alreadySubmitted: false };
    if (!data || data.length === 0) {
        // Already submitted or not in_progress — idempotent, no duplicate
        return { ok: true, error: null, alreadySubmitted: true };
    }
    return { ok: true, error: null, alreadySubmitted: false };
}

/**
 * Save a grade record linked to a completed attempt.
 *
 * @param {string} attemptId
 * @param {object} grade { score, totalMarks, percentage, grade?, feedback? }
 * @returns {Promise<{id, error}>}
 */
export async function saveExamGrade(attemptId, grade) {
    requireSupabase();
    const userId = await getCurrentUserId();

    const { data, error } = await supabase
        .from('exam_grades')
        .insert([{ attempt_id: attemptId, user_id: userId, ...grade }])
        .select('id')
        .single();
    if (error) return { id: null, error: error.message };
    return { id: data.id, error: null };
}

/**
 * Fetch a student's past attempts for their dashboard/history.
 */
/**
 * Call the authenticated, server-side Test Room API. Answer keys are never
 * read directly by the browser.
 */
async function callTestRoomSessionApi(payload, options = {}) {
    requireSupabase();
    const { data, error } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token;
    if (error || !accessToken) throw new Error('Not authenticated');

    const response = await fetch('/api/test-room-session', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + accessToken,
        },
        body: JSON.stringify(payload),
        keepalive: Boolean(options.keepalive),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || 'Test Room service request failed.');
    return result;
}

/** Reconcile room attempts whose heartbeats have stopped. Safe to call repeatedly. */
export async function reconcileTestRoomAttempts() {
    try {
        await callTestRoomSessionApi({ action: 'reconcile_my_attempts' });
        return { ok: true, error: null };
    } catch (error) {
        return { ok: false, error: error.message || 'Could not reconcile Test Room attempts.' };
    }
}

/** Fetch an owner's finalized Test Room attempt and its answer review. */
export async function getTestRoomAttemptReview(attemptId) {
    try {
        const result = await callTestRoomSessionApi({ action: 'get_attempt_review', attemptId });
        return { record: result?.record || null, error: null };
    } catch (error) {
        return { record: null, error: error.message || 'Could not load this Test Room review.' };
    }
}

export async function getMyAttempts(limit = 50) {
    requireSupabase();
    const userId = await getCurrentUserId();

    const { data, error } = await supabase
        .from('exam_attempts')
        .select('*')
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
        .limit(limit);
    if (error) return { attempts: [], error: error.message };
    return { attempts: data || [], error: null };
}

/**
 * Fetch a single attempt by id (owned by current user).
 */
export async function getAttempt(attemptId) {
    requireSupabase();
    const userId = await getCurrentUserId();

    const { data, error } = await supabase
        .from('exam_attempts')
        .select('*')
        .eq('id', attemptId)
        .eq('user_id', userId)
        .single();
    if (error) return { attempt: null, error: error.message };
    return { attempt: data, error: null };
}
