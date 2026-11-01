import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { evaluateTheoryAttempt } from './_lib/theory-rubric-evaluator.js';
import { buildPublishedExamQuestions, toStudentBankQuestions } from './_lib/published-question-bank.js';
import { getSubjectExamInfo } from '../src/utils/subjectExamPolicy.js';
import { EXAM_BLUEPRINTS } from '../src/data/examBlueprints.js';

export const config = { maxDuration: 60 };

const process = globalThis.process;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function envFirst(...names) {
    for (const name of names) if (process.env[name]?.trim()) return process.env[name].trim();
    return '';
}
function adminClient() {
    const url = envFirst('SUPABASE_URL', 'VITE_SUPABASE_URL').replace(/\/+$/, '');
    let key = envFirst('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY');
    if (!key) { try { key = JSON.parse(process.env.SUPABASE_SECRET_KEYS || '{}').default || ''; } catch { key = ''; } }
    if (!url || !key) throw new Error('Supabase server credentials are not configured.');
    return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}
function fail(res, status, message) {
    return res.status(status).json({ error: message });
}
async function authenticate(req, admin) {
    const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    const { data, error } = await admin.auth.getUser(match[1]);
    return error ? null : data?.user || null;
}
async function privateExamData(admin, action, payload = {}) {
    const { data, error } = await admin.rpc('pm_private_exam_data', { p_action: action, p_payload: payload });
    if (error) throw new Error(error.message);
    return data;
}
async function privateEvaluationData(admin, action, payload = {}) {
    const { data, error } = await admin.rpc('pm_private_exam_evaluation_data', { p_action: action, p_payload: payload });
    if (error) throw new Error(error.message);
    return data;
}
async function claimPrivateEvaluation(admin, { attemptId, userId, answerRevision, claimToken }) {
    const { data, error } = await admin.rpc('pm_private_exam_evaluation_claim', {
        p_attempt_id: attemptId, p_user_id: userId, p_answer_revision: answerRevision, p_claim_token: claimToken,
    });
    if (error) throw new Error(error.message);
    return data;
}
async function finishPrivateEvaluation(admin, { attemptId, userId, answerRevision, claimToken, status, result = null, errorMessage = null }) {
    const { data, error } = await admin.rpc('pm_private_exam_evaluation_finish', {
        p_attempt_id: attemptId, p_user_id: userId, p_answer_revision: answerRevision,
        p_claim_token: claimToken, p_status: status, p_result: result, p_error: errorMessage,
    });
    if (error) throw new Error(error.message);
    return data;
}
function evaluationFailureMessage(error) {
    const message = String(error?.message || '').toLowerCase();
    if (/rate limit|tokens per minute|too many requests/.test(message)) {
        return 'The AI marking service is temporarily busy. Your submission is saved; please retry the evaluation in a moment.';
    }
    if (/marking rubric|saved theory rubrics|rubric.*invalid|rubric.*missing/.test(message)) {
        return 'The saved marking rubric is incomplete or invalid. This attempt needs its rubric corrected before it can be graded.';
    }
    if (/timeout|timed out|aborted|fetch failed|network/.test(message)) {
        return 'The AI marking service did not respond in time. Your submission is saved; please retry the evaluation.';
    }
    if (/json|payload|incomplete|schema|empty evaluation/.test(message)) {
        return 'The AI marker returned an incomplete assessment. Your submission is saved; please retry the evaluation.';
    }
    if (/api key|credentials are not configured/.test(message)) {
        return 'The AI marking service is not configured correctly. Please contact the administrator.';
    }
    return 'The automated marker could not complete this attempt. Your submission is saved; please retry the evaluation.';
}

function hasTheoryQuestions(attempt) {
    return Array.isArray(attempt?.questions) && attempt.questions.some(question => question?.type === 'subjective');
}
function hasCompleteTheoryRubric(attempt) {
    if (!hasTheoryQuestions(attempt)) return false;
    return attempt.questions.filter(question => question?.type === 'subjective').every(question => (
        Array.isArray(question.rubric) && question.rubric.length > 0
    ));
}
function dashboardSafeQuestion(question) {
    if (!question || typeof question !== 'object') return null;
    const safe = { ...question };
    delete safe.answer;
    delete safe.answerFormat;
    delete safe.rubric;
    delete safe.review;
    return safe;
}
function dashboardSafeAttempt(attempt, evaluation) {
    const theory = hasTheoryQuestions(attempt);
    const rubricReady = theory && hasCompleteTheoryRubric(attempt);
    const reviewStatus = !theory ? 'ready' : !rubricReady ? 'unavailable' : (evaluation?.status || 'pending');
    const evaluationResult = reviewStatus === 'completed' ? evaluation?.result : null;
    const awardedMarks = evaluationResult?.totalAwardedMarks ?? evaluation?.total_awarded_marks;
    const possibleMarks = evaluationResult?.totalPossibleMarks ?? evaluation?.total_possible_marks;
    return {
        ...attempt,
        questions: Array.isArray(attempt.questions) ? attempt.questions.map(dashboardSafeQuestion) : [],
        answers: attempt.answers && typeof attempt.answers === 'object' ? attempt.answers : {},
        score: reviewStatus === 'completed' && awardedMarks !== null && awardedMarks !== undefined
            ? Number(awardedMarks) : attempt.score ?? null,
        total_marks: reviewStatus === 'completed' && possibleMarks !== null && possibleMarks !== undefined
            ? Number(possibleMarks) : attempt.total_marks,
        review_status: reviewStatus,
        review_error: reviewStatus === 'failed' ? evaluation?.error || 'Evaluation failed. Please retry.' : null,
        evaluation_attempts: evaluation?.attempts ?? 0,
    };
}
async function upsertTheoryEvaluation(admin, attempt, userId) {
    if (!hasTheoryQuestions(attempt) || !hasCompleteTheoryRubric(attempt)) return null;
    return privateEvaluationData(admin, 'upsert_pending', { attempt_id: attempt.id, user_id: userId });
}
async function tagAttemptSubject(admin, attemptId, userId, subjectId) {
    const { data, error } = await admin.rpc('pm_private_exam_tag_subject', {
        p_attempt_id: attemptId,
        p_user_id: userId,
        p_subject_id: subjectId,
    });
    if (error) throw new Error(error.message);
    if (!data?.ok) throw new Error('The saved attempt could not be linked to its catalog subject.');
    return data;
}
function studentSafeQuestion(question) {
    if (!question || typeof question !== 'object') return null;
    const safe = { ...question };
    delete safe.review;
    // MCQ keys live in private.exam_attempt_keys. Theory model answers remain
    // with the private attempt snapshot for the server-side rubric grader.
    if (question.type === 'mcq') delete safe.answer;
    return safe;
}
export function buildAttemptReviewRecord(attempt, answerKey, evaluation = null) {
    const savedQuestions = Array.isArray(attempt?.questions) ? attempt.questions : [];
    const questions = savedQuestions.map((question, index) => {
        if (question?.type !== 'mcq') return question;
        const expected = Array.isArray(answerKey)
            ? answerKey[index]
            : answerKey && typeof answerKey === 'object'
                ? answerKey[String(question.id)]
                : null;
        const hasExpectedAnswer = expected !== null && expected !== undefined && expected !== '';
        const correctIndex = hasExpectedAnswer ? Number(expected) : Number.NaN;
        return {
            ...question,
            answer: Number.isInteger(correctIndex) && correctIndex >= 0 && correctIndex <= 3
                ? correctIndex
                : null,
        };
    });

    const isObjective = questions.some(question => question?.type === 'mcq');
    const isTheory = !isObjective && questions.some(question => question?.type === 'subjective');
    const evaluationStatus = isTheory ? (evaluation?.status || 'pending') : 'ready';
    const evaluationResult = evaluationStatus === 'completed' ? evaluation?.result || null : null;
    return {
        id: attempt.id,
        attemptId: attempt.id,
        date: attempt.submitted_at || attempt.updated_at || attempt.started_at,
        subjectId: attempt.subject_code || null,
        subjectName: attempt.subject_name || null,
        examType: attempt.exam_type,
        difficulty: attempt.difficulty,
        type: isObjective ? 'objective' : 'theory',
        score: evaluationResult ? Number(evaluationResult.totalAwardedMarks) : attempt.score ?? null,
        totalMarks: evaluationResult ? Number(evaluationResult.totalPossibleMarks) : attempt.total_marks ?? null,
        evaluationStatus,
        evaluationResult,
        evaluationError: evaluationStatus === 'failed' ? evaluation?.error || 'Evaluation failed. Please retry.' : null,
        questions,
        userAnswers: attempt.answers && typeof attempt.answers === 'object' ? attempt.answers : {},
    };
}

export function normalizeAnswers(input, mcqQuestionIds = []) {
    const entries = input && typeof input === 'object' && !Array.isArray(input)
        ? Object.entries(input).slice(0, 100)
        : [];
    const normalized = Object.fromEntries(entries.map(([key, value]) => [
        String(key).slice(0, 120),
        value == null ? null : (typeof value === 'string' ? value.slice(0, 10000) : (Number.isFinite(Number(value)) ? Number(value) : null)),
    ]));

    // MCQ answers use -1 as the explicit unattempted sentinel; theory text remains unchanged.
    mcqQuestionIds.forEach((questionId) => {
        const answer = normalized[questionId];
        normalized[questionId] = Number.isInteger(answer) && answer >= 0 && answer <= 3
            ? answer
            : -1;
    });

    return normalized;
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return fail(res, 405, 'Method not allowed.');

    try {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const action = String(body.action || '');
        const admin = adminClient();
        const user = await authenticate(req, admin);
        if (!user) return fail(res, 401, 'Sign in to continue.');

        if (action === 'create_from_question_bank') {
            const catalogSubjectId = Number(body.catalogSubjectId);
            const examType = String(body.examType || '');
            const difficulty = String(body.difficulty || 'medium');
            if (!Number.isSafeInteger(catalogSubjectId) || catalogSubjectId <= 0) return fail(res, 400, 'Invalid catalog subject identifier.');
            if (!['easy', 'medium', 'hard'].includes(difficulty)) return fail(res, 400, 'Invalid difficulty.');
            const { data: subject, error: subjectError } = await admin.from('Subjects')
                .select('SubjectId,SubjectName,CourseId,Semester,isDepartmentalSubject')
                .eq('SubjectId', catalogSubjectId).maybeSingle();
            if (subjectError) throw new Error('The selected subject could not be verified.');
            if (!subject) return fail(res, 404, 'The selected catalog subject no longer exists.');
            const examInfo = getSubjectExamInfo(examType, subject.isDepartmentalSubject);
            if (!examInfo) return fail(res, 400, 'This exam type is not available for the selected subject.');

            const bankQuery = await admin.rpc('pm_student_question_bank_candidates', {
                p_subject_id: catalogSubjectId,
                p_exam_type: examType,
                p_question_type: examInfo.type === 'objective' ? 'mcq' : 'theory',
                p_difficulty: difficulty,
            });
            if (bankQuery.error) throw new Error('Published question banks could not be checked.');
            const banks = Array.isArray(bankQuery.data?.banks) ? bankQuery.data.banks : [];
            let selected = null;
            let selectedBank = null;

            for (const bank of banks) {
                const bankQuestions = Array.isArray(bank.questions) ? bank.questions : [];
                if (examInfo.type === 'objective') {
                    const completeSets = (Array.isArray(bank.sets) ? bank.sets : [])
                        .filter(set => set.is_complete === true && Number(set.question_count) === 30);
                    for (const set of completeSets) {
                        const rows = bankQuestions.filter(question =>
                            String(question.set_id) === String(set.id)
                            && question.question_type === 'mcq'
                            && question.difficulty === difficulty
                            && question.validation_status === 'valid'
                        );
                        const built = buildPublishedExamQuestions({ rows, examInfo, difficulty });
                        if (built) { selected = built; selectedBank = bank; break; }
                    }
                } else {
                    const rows = bankQuestions.filter(question =>
                        question.question_type === 'theory'
                        && question.difficulty === difficulty
                        && question.validation_status === 'valid'
                    );
                    const built = buildPublishedExamQuestions({
                        rows, examInfo, difficulty,
                        markSequence: EXAM_BLUEPRINTS[String(examType).replace('-', '')]?.markSequence,
                    });
                    if (built) { selected = built; selectedBank = bank; }
                }
                if (selected) break;
            }

            if (!selected || !selectedBank) return res.status(200).json({ found: false });
            const internalQuestions = selected.questions.map(question => studentSafeQuestion(question));
            const payload = {
                user_id: user.id,
                subject_code: String(catalogSubjectId),
                subject_name: String(subject.SubjectName || 'Unknown subject').slice(0, 200),
                exam_type: examType,
                difficulty,
                questions: internalQuestions,
                total_marks: selected.totalMarks,
                time_minutes: selected.timeMinutes,
                answers: Object.fromEntries(internalQuestions.map(question => [String(question.id), -1])),
                score: null,
                status: 'in_progress',
                attempt_type: 'exam',
                started_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                answer_key: selected.answerKey,
            };
            const attempt = await privateExamData(admin, 'create_attempt', payload);
            if (!attempt?.id) throw new Error('The curated question-bank attempt was not saved.');
            try {
                await tagAttemptSubject(admin, attempt.id, user.id, catalogSubjectId);
            } catch (error) {
                await privateExamData(admin, 'update_attempt', {
                    id: attempt.id, user_id: user.id, attempt_type: 'exam', statuses: ['in_progress'],
                    patch: { status: 'cancelled', end_reason: 'catalog_subject_link_failed', updated_at: new Date().toISOString() },
                }).catch(() => {});
                throw error;
            }
            return res.status(201).json({
                found: true, id: attempt.id,
                questions: toStudentBankQuestions(selected.questions),
                sourceFileName: selectedBank.source_file_name,
            });
        }

        if (action === 'create') {
            if (!Array.isArray(body.questions) || body.questions.length < 1 || body.questions.length > 50) {
                return fail(res, 400, 'A valid question set is required.');
            }
            if (!['easy', 'medium', 'hard'].includes(String(body.difficulty || 'medium'))) {
                return fail(res, 400, 'Invalid difficulty.');
            }
            const safeQuestions = [];
            const answerKey = {};
            for (const question of body.questions) {
                if (!question || typeof question !== 'object' || !String(question.id || '').trim()) {
                    return fail(res, 400, 'Every question must have a stable identifier.');
                }
                if (question.type === 'mcq') {
                    if (!Array.isArray(question.options) || question.options.length !== 4
                        || !Number.isInteger(question.answer) || question.answer < 0 || question.answer > 3) {
                        return fail(res, 400, 'Every MCQ must have four options and a valid correct-answer index.');
                    }
                    answerKey[String(question.id)] = question.answer;
                }
                safeQuestions.push(studentSafeQuestion(question));
            }
            let catalogSubjectId = null;
            if (body.catalogSubjectId !== undefined && body.catalogSubjectId !== null && body.catalogSubjectId !== '') {
                catalogSubjectId = Number(body.catalogSubjectId);
                if (!Number.isSafeInteger(catalogSubjectId) || catalogSubjectId <= 0) {
                    return fail(res, 400, 'Invalid catalog subject identifier.');
                }
                const { data: catalogSubject, error: catalogError } = await admin
                    .from('Subjects')
                    .select('SubjectId')
                    .eq('SubjectId', catalogSubjectId)
                    .maybeSingle();
                if (catalogError) throw new Error(catalogError.message);
                if (!catalogSubject) return fail(res, 400, 'The selected catalog subject no longer exists.');
            }

            const payload = {
                user_id: user.id,
                subject_code: body.subjectCode == null ? null : String(body.subjectCode).slice(0, 120),
                subject_name: String(body.subjectName || 'Unknown subject').slice(0, 200),
                exam_type: String(body.examType || 'MCQ').slice(0, 80),
                difficulty: String(body.difficulty || 'medium'),
                questions: safeQuestions,
                total_marks: Math.max(0, Math.min(1000, Math.trunc(Number(body.totalMarks) || 0))),
                time_minutes: Math.max(0, Math.min(600, Math.trunc(Number(body.timeMinutes) || 0))),
                answers: Object.fromEntries(Object.keys(answerKey).map((questionId) => [questionId, -1])),
                score: null,
                status: 'in_progress',
                attempt_type: 'exam',
                started_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                answer_key: answerKey,
            };
            const attempt = await privateExamData(admin, 'create_attempt', payload);
            if (!attempt?.id) throw new Error('The attempt was not persisted.');
            if (catalogSubjectId !== null) {
                try {
                    await tagAttemptSubject(admin, attempt.id, user.id, catalogSubjectId);
                } catch (error) {
                    await privateExamData(admin, 'update_attempt', {
                        id: attempt.id, user_id: user.id, attempt_type: 'exam', statuses: ['in_progress'],
                        patch: {
                            status: 'cancelled',
                            end_reason: 'catalog_subject_link_failed',
                            updated_at: new Date().toISOString(),
                        },
                    }).catch(() => {});
                    throw error;
                }
            }
            return res.status(201).json({ id: attempt.id });
        }

        if (action === 'update_answers') {
            const attemptId = String(body.attemptId || '');
            if (!UUID_RE.test(attemptId)) return fail(res, 400, 'Invalid attempt identifier.');
            const attempt = await privateExamData(admin, 'get_attempt', {
                id: attemptId, user_id: user.id, attempt_type: 'exam',
            });
            if (!attempt) return fail(res, 404, 'Attempt not found.');
            if (attempt.status !== 'in_progress') return fail(res, 409, 'This attempt is no longer accepting answers.');
            const mcqQuestionIds = (Array.isArray(attempt.questions) ? attempt.questions : [])
                .filter((question) => question?.type === 'mcq')
                .map((question) => String(question.id));
            const answers = normalizeAnswers(body.answers, mcqQuestionIds);
            const updated = await privateExamData(admin, 'update_attempt', {
                id: attemptId, user_id: user.id, attempt_type: 'exam', statuses: ['in_progress'],
                patch: { answers, updated_at: new Date().toISOString() },
            });
            if (!updated) return fail(res, 409, 'This attempt is no longer accepting answers.');
            return res.status(200).json({ ok: true });
        }

        if (action === 'submit') {
            const attemptId = String(body.attemptId || '');
            if (!UUID_RE.test(attemptId)) return fail(res, 400, 'Invalid attempt identifier.');
            const attempt = await privateExamData(admin, 'get_attempt', {
                id: attemptId, user_id: user.id, attempt_type: 'exam',
            });
            if (!attempt) return fail(res, 404, 'Attempt not found.');
            if (['submitted', 'auto_submitted'].includes(attempt.status)) {
                const evaluation = await upsertTheoryEvaluation(admin, attempt, user.id);
                return res.status(200).json({
                    ok: true, alreadySubmitted: true, score: attempt.score, totalMarks: attempt.total_marks,
                    percentage: attempt.score == null || !attempt.total_marks
                        ? null : Math.round((Number(attempt.score) / Number(attempt.total_marks)) * 100),
                    evaluationStatus: evaluation?.status || (hasTheoryQuestions(attempt) ? 'unavailable' : 'ready'),
                });
            }
            if (attempt.status !== 'in_progress') return fail(res, 409, 'This attempt is not accepting submissions.');

            const answerRow = await privateExamData(admin, 'get_answer_key', { attempt_id: attemptId });
            const key = answerRow?.answer_key && typeof answerRow.answer_key === 'object' && !Array.isArray(answerRow.answer_key)
                ? answerRow.answer_key : {};
            const keys = Object.entries(key);
            const answers = normalizeAnswers(body.answers, keys.map(([questionId]) => questionId));
            let score = null;
            let correct = null;
            let attempted = Object.values(answers).filter((value) => value !== null && value !== '' && value !== -1).length;
            let totalMarks = Number(attempt.total_marks) || 0;
            if (keys.length) {
                score = keys.reduce((sum, [questionId, expected]) => (
                    sum + (answers[questionId] !== -1 && answers[questionId] != null
                        && String(answers[questionId]) === String(expected) ? 1 : 0)
                ), 0);
                correct = score;
                totalMarks = keys.length;
                attempted = keys.filter(([questionId]) => answers[questionId] !== -1 && answers[questionId] != null).length;
            }
            const patch = {
                answers,
                score,
                status: 'submitted',
                submitted_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                attempted_count: attempted,
            };
            if (correct !== null) {
                patch.correct_count = correct;
                patch.incorrect_count = Math.max(0, attempted - correct);
                patch.unattempted_count = Math.max(0, keys.length - attempted);
            }
            const saved = await privateExamData(admin, 'update_attempt', {
                id: attemptId, user_id: user.id, attempt_type: 'exam', statuses: ['in_progress'],
                patch,
            });
            if (!saved) {
                const latest = await privateExamData(admin, 'get_attempt', { id: attemptId, user_id: user.id, attempt_type: 'exam' });
                if (latest && ['submitted', 'auto_submitted'].includes(latest.status)) {
                    return res.status(200).json({
                        ok: true, alreadySubmitted: true, score: latest.score,
                        totalMarks: latest.total_marks, percentage: latest.score == null || !latest.total_marks
                            ? null : Math.round((Number(latest.score) / Number(latest.total_marks)) * 100),
                    });
                }
                return fail(res, 409, 'The attempt could not be finalized.');
            }
            const finalizedAttempt = { ...attempt, answers, status: 'submitted' };
            const evaluation = await upsertTheoryEvaluation(admin, finalizedAttempt, user.id);
            return res.status(200).json({
                ok: true, alreadySubmitted: false, score,
                totalMarks: totalMarks || null,
                percentage: score == null || totalMarks <= 0 ? null : Math.round((score / totalMarks) * 100),
                evaluationStatus: evaluation?.status || (hasTheoryQuestions(finalizedAttempt) ? 'unavailable' : 'ready'),
            });
        }

        if (action === 'evaluate') {
            const attemptId = String(body.attemptId || '');
            if (!UUID_RE.test(attemptId)) return fail(res, 400, 'Invalid attempt identifier.');
            const attempt = await privateExamData(admin, 'get_attempt', { id: attemptId, user_id: user.id, attempt_type: 'exam' });
            if (!attempt) return fail(res, 404, 'Attempt not found.');
            if (!['submitted', 'auto_submitted'].includes(attempt.status)) {
                return fail(res, 409, 'Evaluation is available after the exam has been submitted.');
            }
            if (!hasCompleteTheoryRubric(attempt)) {
                return res.status(200).json({ status: hasTheoryQuestions(attempt) ? 'unavailable' : 'ready' });
            }
            const evaluation = await upsertTheoryEvaluation(admin, attempt, user.id);
            if (!evaluation) return fail(res, 409, 'The evaluation record could not be initialized.');
            if (evaluation.status === 'completed') {
                return res.status(200).json({ status: 'completed', result: evaluation.result });
            }
            const claimToken = randomUUID();
            const claim = await claimPrivateEvaluation(admin, {
                attemptId, userId: user.id, answerRevision: Number(attempt.answer_revision) || 0, claimToken,
            });
            const claimRow = claim?.evaluation || null;
            if (!claim?.claimed) {
                return res.status(200).json({
                    status: claimRow?.status || 'pending',
                    result: claimRow?.status === 'completed' ? claimRow.result : null,
                    error: claimRow?.status === 'failed' ? claimRow.error : null,
                });
            }
            try {
                const apiKey = envFirst('GROQ_API_KEY', 'VITE_GROQ_API_KEY');
                const result = await evaluateTheoryAttempt(attempt, apiKey);
                const completed = await finishPrivateEvaluation(admin, {
                    attemptId, userId: user.id, answerRevision: Number(attempt.answer_revision) || 0,
                    claimToken, status: 'completed', result,
                });
                if (!completed) return fail(res, 409, 'The saved answers changed during evaluation. Refresh and retry.');
                return res.status(200).json({ status: 'completed', result: completed.result });
            } catch (evaluationError) {
                const userMessage = evaluationFailureMessage(evaluationError);
                console.error('[theory-evaluation] Failed:', evaluationError?.message || evaluationError);
                await finishPrivateEvaluation(admin, {
                    attemptId, userId: user.id, answerRevision: Number(attempt.answer_revision) || 0,
                    claimToken, status: 'failed',
                    errorMessage: userMessage,
                }).catch(finishError => console.error('[theory-evaluation] Could not persist failure:', finishError.message));
                return res.status(200).json({
                    status: 'failed',
                    error: userMessage,
                });
            }
        }
        if (action === 'review') {
            const attemptId = String(body.attemptId || '');
            if (!UUID_RE.test(attemptId)) return fail(res, 400, 'Invalid attempt identifier.');
            const attempt = await privateExamData(admin, 'get_attempt', { id: attemptId, user_id: user.id, attempt_type: 'exam' });
            if (!attempt) return fail(res, 404, 'Attempt not found.');
            if (!['submitted', 'auto_submitted'].includes(attempt.status)) {
                return fail(res, 409, 'Answer review is available after the exam has been submitted.');
            }
            const answerRow = await privateExamData(admin, 'get_answer_key', { attempt_id: attemptId });
            let evaluation = null;
            if (hasCompleteTheoryRubric(attempt)) {
                evaluation = await privateEvaluationData(admin, 'get', { attempt_id: attemptId, user_id: user.id });
                if (!evaluation) evaluation = await upsertTheoryEvaluation(admin, attempt, user.id);
            }
            return res.status(200).json({ record: buildAttemptReviewRecord(attempt, answerRow?.answer_key, evaluation) });
        }

        if (action === 'list') {
            const limit = Math.max(1, Math.min(100, Math.trunc(Number(body.limit) || 50)));
            const attempts = await privateExamData(admin, 'list_attempts', {
                user_id: user.id, attempt_type: 'exam', limit, order: 'started_at_desc',
            });
            const rows = Array.isArray(attempts) ? attempts : [];
            const evaluationRows = rows.length ? await privateEvaluationData(admin, 'list', {
                user_id: user.id, attempt_ids: rows.map(attempt => attempt.id),
            }) : [];
            const evaluationByAttempt = new Map(
                (Array.isArray(evaluationRows) ? evaluationRows : []).map(item => [item.attempt_id, item])
            );
            return res.status(200).json({
                attempts: rows.map(attempt => dashboardSafeAttempt(attempt, evaluationByAttempt.get(attempt.id))),
            });
        }

        if (action === 'get') {
            const attemptId = String(body.attemptId || '');
            if (!UUID_RE.test(attemptId)) return fail(res, 400, 'Invalid attempt identifier.');
            const attempt = await privateExamData(admin, 'get_attempt', { id: attemptId, user_id: user.id, attempt_type: 'exam' });
            return res.status(200).json({ attempt: attempt ? dashboardSafeAttempt(attempt, null) : null });
        }

        return fail(res, 400, 'Unknown exam-attempt action.');
    } catch (error) {
        return fail(res, 500, error?.message || 'Exam attempt request failed.');
    }
}
