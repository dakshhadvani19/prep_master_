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

export async function fetchActiveUploadedSyllabus(subjectId) {
    try {
        const numericId = Number(subjectId);
        if (!Number.isSafeInteger(numericId) || numericId <= 0) return { syllabus: null, error: null };
        const token = await getAccessToken();
        const response = await fetch('/api/student-exam-content?subjectId=' + encodeURIComponent(numericId), {
            headers: { Authorization: 'Bearer ' + token },
            cache: 'no-store',
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result?.error || 'Could not check the active subject syllabus.');
        retur¶»§q«^