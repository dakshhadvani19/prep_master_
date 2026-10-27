import { supabase, requireSupabase } from '../supabase.js';

async function getAccessToken() {
    requireSupabase();
    const { data, error } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (error || !token) throw new Error('Not authenticated');
    return token;
}

async function callExamAttemptApi(payload) {
    const token = await getAccessToken();
    const response = await fetch('/api/exam-attempts', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || 'Exam attempt service request failed.');
    return result || {};
}

export async function saveExamAttempt(payload) {
    try {
        const result = await callExamAttemptApi({ action: 'create', ...payload });
        return { id: result.id || null, error: null };
    } catch (error) {
        return { id: null, error: error.message || 'Could not save exam attempt.' };
    }
}

export async function updateAttemptAnswers(attemptId, answers) {
    try {
        const result = await callExamAttemptApi({ action: 'update_answers', attemptId, answers });
        return { ok: result.ok === true, error: null };
    } catch (error) {
        return { ok: false, error: error.message || 'Could not save exam answers.' };
    }
}

/** The server loads the saved answer key and calculates the authoritative score. */
export async function submitExamAttempt(attemptId, _clientScore, answers) {
    try {
        const result = await callExamAttemptApi({ action: 'submit', attemptId, answers });
        return {
            ok: result.ok === true,
            error: null,
            alreadySubmitted: result.alreadySubmitted === true,
            score: result.score ?? null,
            totalMarks: result.totalMarks ?? null,
            percentage: result.percentage ?? null,
        };
    } catch (error) {
        return { ok: false, error: error.message || 'Could not submit exam.', alreadySubmitted: false };
    }
}

async function callTestRoomSessionApi(payload, options = {}) {
    const token = await getAccessToken();
    const response = await fetch('/api/test-room-session', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify(payload),
        keepalive: Boolean(options.keepalive),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || 'Test Room service request failed.');
    return result;
}

export async function reconcileTestRoomAttempts() {
    try {
        await callTestRoomSessionApi({ action: 'reconcile_my_attempts' });
        return { ok: true, error: null };
    } catch (error) {
        return { ok: false, error: error.message || 'Could not reconcile Test Room attempts.' };
    }
}

export async function getTestRoomAttemptReview(attemptId) {
    try {
        const result = await callTestRoomSessionApi({ action: 'get_attempt_review', attemptId });
        return { record: result?.record || null, error: null };
    } catch (error) {
        return { record: null, error: error.message || 'Could not load this Test Room review.' };
    }
}

export async function getMyAttempts(limit = 50) {
    try {
        const result = await callExamAttemptApi({ action: 'list', limit });
        return { attempts: Array.isArray(result.attempts) ? result.attempts : [], error: null };
    } catch (error) {
        return { attempts: [], error: error.message || 'Could not load exam history.' };
    }
}

export async function getLeaderboardCompletedSubjects() {
    try {
        const token = await getAccessToken();
        const response = await fetch('/api/leaderboard-filters', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + token,
            },
            body: JSON.stringify({ action: 'load' }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.error || 'Could not verify leaderboard access.');
        return {
            subjects: Array.isArray(result?.completedSubjects) ? result.completedSubjects : [],
            error: null,
        };
    } catch (error) {
        return { subjects: [], error: error.message || 'Could not verify leaderboard access.' };
    }
}

export async function getAttempt(attemptId) {
    try {
        const result = await callExamAttemptApi({ action: 'get', attemptId });
        return { attempt: result.attempt || null, error: null };
    } catch (error) {
        return { attempt: null, error: error.message || 'Could not load exam attempt.' };
    }
}
