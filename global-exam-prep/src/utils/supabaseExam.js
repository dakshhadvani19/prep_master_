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

export async function getExamAttemptReview(attemptId) {
    try {
        const result = await callExamAttemptApi({ action: 'review', attemptId });
        return { record: result?.record || null, error: null };
    } catch (error) {
        return { record: null, error: error.message || 'Could not load this exam review.' };
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
        console.error('[leaderboard] Completed-subject access request failed:', error);
        return {
            subjects: [],
            error: 'Could not verify completed exams right now. Please retry.',
        };
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

/**
 * Loads a subject leaderboard through the authenticated server API.
 * Provider/database errors are logged for developers; callers receive a
 * stable, user-friendly message instead of raw infrastructure details.
 */
export async function getLeaderboardRankings({
    subjectId,
    examType = null,
    difficulty = null,
    attemptType = null,
    limit = 50,
    offset = 0,
} = {}) {
    try {
        const token = await getAccessToken();
        const response = await fetch('/api/leaderboard-rankings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + token,
            },
            body: JSON.stringify({
                subjectId,
                examType,
                difficulty,
                attemptType,
                limit,
                offset,
            }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) {
            throw new Error(result?.error || 'Leaderboard data is temporarily unavailable.');
        }
        if (!result?.leaderboard || typeof result.leaderboard !== 'object'
            || Array.isArray(result.leaderboard)) {
            throw new Error('Leaderboard service returned an invalid response.');
        }
        return {
            leaderboard: result.leaderboard,
            error: null,
        };
    } catch (error) {
        console.error('[leaderboard] Could not load leaderboard data:', error);
        return {
            leaderboard: null,
            error: 'We could not load this leaderboard right now. Please try again.',
        };
    }
}
/**
 * Retrieves the signed-in student's verified aggregate performance.
 * Raw provider/database errors are logged for developers, never shown in UI.
 */
export async function getDashboardPerformanceSummary() {
    try {
        const token = await getAccessToken();
        const response = await fetch('/api/dashboard-performance', {
            method: 'GET',
            headers: { Authorization: 'Bearer ' + token },
            cache: 'no-store',
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) {
            throw new Error(result?.error || 'Performance summary is temporarily unavailable.');
        }
        if (!result?.performance || typeof result.performance !== 'object'
            || !result.performance.summary
            || !Array.isArray(result.performance.subjectPerformance)
            || !Array.isArray(result.performance.recentResults)) {
            throw new Error('Performance summary service returned an invalid response.');
        }
        return { performance: result.performance, error: null };
    } catch (error) {
        console.error('[dashboard] Could not load verified performance summary:', error);
        return {
            performance: null,
            error: 'We could not load your performance summary right now. Please try again.',
        };
    }
}

