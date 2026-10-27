import { createClient } from '@supabase/supabase-js';
import { randomInt } from 'node:crypto';

const process = globalThis.process;
const ROOM_TTL_SECONDS = 60 * 60;
const ROOM_CLEANUP_GRACE_SECONDS = 5 * 60;
const MAX_PARTICIPANTS = 50;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const STALE_AFTER_MS = 35_000;
const FINAL_ATTEMPT_STATUSES = new Set(['submitted', 'auto_submitted', 'disconnected', 'timed_out', 'cancelled']);

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
async function redis(...args) {
    const url = envFirst('UPSTASH_REDIS_REST_URL').replace(/\/+$/, '');
    const token = envFirst('UPSTASH_REDIS_REST_TOKEN');
    if (!url || !token) throw new Error('Upstash Redis credentials are not configured in the server environment.');
    const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(args.map(String)),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.error) throw new Error(payload?.error || 'Redis request failed (' + response.status + ').');
    return payload.result;
}
function parseJson(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return null; }
}
export function resolveFinalization(action, deadlineAt, now = Date.now()) {
    const deadline = Number(deadlineAt);
    const timedOut = Number.isFinite(deadline) && deadline > 0 && now >= deadline;
    if (timedOut) return { status: 'timed_out', reason: 'timer_expired' };
    if (action === 'submit') return { status: 'submitted', reason: 'manual_submit' };
    if (action === 'mark_disconnected') return { status: 'disconnected', reason: 'participant_connection_lost' };
    return { status: 'disconnected', reason: 'connection_lost' };
}

export function shouldFinalizeStaleHeartbeat(participant, now = Date.now()) {
    return participant?.tabHidden !== true
        && Number(participant?.lastHeartbeat || 0) > 0
        && now - Number(participant.lastHeartbeat) > STALE_AFTER_MS;
}

export function roomJoinError(status) {
    if (status === 'waiting') return null;
    if (status === 'started') return 'This room has already started. Rejoining is disabled.';
    return 'This room has already ended.';
}

export function roomExpiryForStart(startedAt, durationMinutes) {
    const durationSeconds = Math.max(1, Number(durationMinutes) || 45) * 60;
    return Number(startedAt) + Math.max(
        ROOM_TTL_SECONDS,
        durationSeconds + ROOM_CLEANUP_GRACE_SECONDS,
    ) * 1000;
}

export function roomTtlSeconds(room, now = Date.now()) {
    const expiresAt = Number(room?.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) return ROOM_TTL_SECONDS;
    return Math.max(1, Math.ceil((expiresAt - now) / 1000));
}

export function hostResumeError(room, participant, attempt, userId) {
    if (!room) return 'No active Test Room was found for that code. Check the code and try again.';
    if (String(room.hostUid || '') !== String(userId || '')) {
        return 'Only the account that created this Test Room can restore the host session.';
    }
    if (room.status === 'started') {
        return 'This Test Room has already started. Reopening the host session is disabled.';
    }
    if (room.status !== 'waiting') return 'This Test Room has already ended and is no longer available.';
    if (!participant || participant.role !== 'host' || participant.status === 'disconnected') {
        return 'This host session is no longer active. Create a new Test Room.';
    }
    if (!attempt || attempt.status !== 'waiting') {
        return 'The saved host attempt is no longer active. Create a new Test Room.';
    }
    return null;
}

export function normalizeCode(value) {
    const code = String(value ?? '').trim().toUpperCase().replace(/[\s-]/g, '');
    return new RegExp('^[' + CODE_ALPHABET + ']{10}$').test(code) ? code : null;
}
function generateCode() {
    return Array.from({ length: 10 }, () => CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)]).join('');
}
function keys(code, uid = '') {
    const base = 'pm:test-room:' + code;
    return { meta: base + ':meta', questions: base + ':questions', members: base + ':members', reconcileLock: base + ':reconcile-lock', participant: base + ':participant:' + uid };
}
function displayName(user) {
    const metadata = user?.user_metadata || {};
    return String(metadata.full_name || metadata.name || user?.email?.split('@')[0] || 'Student').trim().slice(0, 80) || 'Student';
}
export function buildStartRoomScript() {
    return [
        "local raw = redis.call('GET', KEYS[1])",
        "if not raw then return 'ERR:ROOM_NOT_FOUND' end",
        "local meta = cjson.decode(raw)",
        "if meta.hostUid ~= ARGV[1] then return 'ERR:HOST_ONLY' end",
        "local now = tonumber(ARGV[2])",
        "local ttl = tonumber(ARGV[3]) or 3600",
        "if meta.status == 'waiting' then",
        "  meta.status = 'started'; meta.startedAt = now; meta.serverNow = now",
        "  meta.deadlineAt = now + tonumber(meta.durationMinutes) * 60000",
        "  ttl = math.max(ttl, (tonumber(meta.durationMinutes) or 45) * 60 + (tonumber(ARGV[4]) or 300))",
        "  meta.expiresAt = now + ttl * 1000",
        "elseif meta.status == 'started' then",
        "  ttl = math.max(1, math.ceil((tonumber(meta.expiresAt or (now + ttl * 1000)) - now) / 1000))",
        "else return 'ERR:ROOM_NOT_WAITING' end",
        "redis.call('SET', KEYS[1], cjson.encode(meta), 'EX', ttl)",
        "return cjson.encode(meta)"
    ].join('\n');
}

export function buildLobbySnapshot(room, participants = []) {
    return {
        room: {
            roomCode: String(room?.roomCode || ''),
            subjectCode: String(room?.subjectCode || ''),
            subjectName: String(room?.subjectName || 'MCQ Exam'),
            examTitle: String(room?.examTitle || 'MCQ Exam'),
            difficulty: ['easy', 'medium', 'hard'].includes(room?.difficulty) ? room.difficulty : 'medium',
            durationMinutes: Math.max(1, Number(room?.durationMinutes) || 45),
            status: String(room?.status || 'waiting'),
            startedAt: room?.startedAt ?? null,
            deadlineAt: room?.deadlineAt ?? null,
            questionCount: Math.max(1, Number(room?.questionCount) || 30),
            participantLimit: Math.max(1, Number(room?.participantLimit) || MAX_PARTICIPANTS),
            createdAt: room?.createdAt || null,
            expiresAt: room?.expiresAt ?? null,
            serverNow: Date.now(),
        },
        participants: (Array.isArray(participants) ? participants : []).filter((person) => (
            person && person.userId && ['host', 'participant'].includes(person.role)
        )).map((person) => ({
            userId: String(person.userId),
            displayName: String(person.displayName || 'Student').slice(0, 80),
            role: person.role,
            status: String(person.status || 'waiting'),
            connected: person.connected === true,
            joinedAt: person.joinedAt || null,
        })),
    };
}

export function cleanQuestions(input) {
    if (!Array.isArray(input) || input.length !== 30) throw new Error('A Test Room must contain exactly 30 MCQs.');
    return input.map((q, index) => {
        const options = Array.isArray(q?.options) ? q.options : [];
        const answer = q?.answer;
        if (!String(q?.text || '').trim() || options.length !== 4 || !Number.isInteger(answer) || answer < 0 || answer > 3) {
            throw new Error('Question ' + (index + 1) + ' is not a valid four-option MCQ.');
        }
        const normalized = options.map((option, optionIndex) => {
            const originalOptionIndex = option && typeof option === 'object' && Number.isInteger(option.originalOptionIndex)
                ? option.originalOptionIndex : optionIndex;
            if (originalOptionIndex < 0 || originalOptionIndex > 3) throw new Error('Invalid option index.');
            return { text: String(option && typeof option === 'object' ? (option.text ?? option.label ?? '') : (option ?? '')).slice(0, 2000), originalOptionIndex };
        });
        if (new Set(normalized.map((option) => option.originalOptionIndex)).size !== 4) throw new Error('Option indexes must be unique.');
        return { id: String(q.id || ('room_q' + index)).slice(0, 120), canonicalIndex: index, text: String(q.text).trim().slice(0, 4000), options: normalized, answer };
    });
}
export function safeQuestions(questions) {
    return questions.map(({ id, canonicalIndex, text, options }) => ({
        id, canonicalIndex, text, options: options.map((option) => ({ text: option.text, originalOptionIndex: option.originalOptionIndex })),
    }));
}
export function normalizeAnswers(input, count = 30) {
    const source = Array.isArray(input) ? input : [];
    return Array.from({ length: count }, (_, index) => Number.isInteger(source[index]) && source[index] >= 0 && source[index] <= 3 ? source[index] : null);
}
export function scoreAnswers(key, input) {
    const answers = normalizeAnswers(input, key.length);
    let correct = 0, attempted = 0;
    answers.forEach((answer, index) => {
        if (answer === null) return;
        attempted += 1;
        if (answer === key[index]) correct += 1;
    });
    return { correct, incorrect: attempted - correct, attempted, unattempted: Math.max(0, key.length - attempted), points: correct, totalQuestions: key.length };
}
async function authenticate(req, admin) {
    const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    const { data, error } = await admin.auth.getUser(match[1]);
    return error ? null : data?.user || null;
}
async function getRoom(code) { return parseJson(await redis('GET', keys(code).meta)); }
async function getQuestions(code) { return parseJson(await redis('GET', keys(code).questions)); }
async function getParticipant(code, uid) { return parseJson(await redis('GET', keys(code, uid).participant)); }
async function setJson(key, value, ttlSeconds = ROOM_TTL_SECONDS) {
    return redis('SET', key, JSON.stringify(value), 'EX', Math.max(1, Math.floor(ttlSeconds)));
}
async function patchParticipant(code, uid, patch) {
    const room = await getRoom(code).catch(() => null);
    const ttlSeconds = roomTtlSeconds(room);
    const script = [
        "local raw = redis.call('GET', KEYS[1])",
        "if not raw then return 'ERR:PARTICIPANT_NOT_FOUND' end",
        "local p = cjson.decode(raw)",
        "local patch = cjson.decode(ARGV[1])",
        "for k, v in pairs(patch) do p[k] = v end",
        "redis.call('SET', KEYS[1], cjson.encode(p), 'EX', ARGV[2])",
        "return cjson.encode(p)"
    ].join('\n');
    const result = String(await redis('EVAL', script, 1, keys(code, uid).participant, JSON.stringify(patch), ttlSeconds));
    if (result.startsWith('ERR:')) throw new Error(result.slice(4));
    return parseJson(result);
}
async function privateExamData(admin, action, payload = {}) {
    const { data, error } = await admin.rpc('pm_private_exam_data', {
        p_action: action,
        p_payload: payload,
    });
    if (error) throw new Error(error.message);
    return data;
}
async function tagAttemptSubject(admin, attemptId, userId, subjectId) {
    if (subjectId == null || subjectId === '') return null;
    const parsedSubjectId = Number(subjectId);
    if (!Number.isSafeInteger(parsedSubjectId) || parsedSubjectId <= 0) {
        throw new Error('Invalid catalog subject identifier.');
    }
    const { data, error } = await admin.rpc('pm_private_exam_tag_subject', {
        p_attempt_id: attemptId,
        p_user_id: userId,
        p_subject_id: parsedSubjectId,
    });
    if (error) throw new Error(error.message);
    if (!data?.ok) throw new Error('The Test Room attempt could not be linked to its catalog subject.');
    return data;
}
async function getAttempt(admin, code, uid) {
    return privateExamData(admin, 'get_attempt', {
        room_code: code, user_id: uid, attempt_type: 'test_room',
    });
}
async function purgeLiveRoom(code) {
    const memberIds = await redis('SMEMBERS', keys(code).members).catch(() => []);
    const uniqueIds = Array.isArray(memberIds) ? [...new Set(memberIds.map(String))] : [];
    const liveKeys = [
        keys(code).meta,
        keys(code).questions,
        keys(code).members,
        keys(code).reconcileLock,
        ...uniqueIds.map((uid) => keys(code, uid).participant),
    ];
    await redis('DEL', ...liveKeys);
}

async function cleanupRoomIfComplete(admin, code) {
    const data = await privateExamData(admin, 'list_attempts', {
        room_code: code, attempt_type: 'test_room', limit: MAX_PARTICIPANTS,
    });
    const attempts = Array.isArray(data) ? data : [];
    if (attempts.length > 0 && attempts.every((attempt) => FINAL_ATTEMPT_STATUSES.has(attempt.status))) {
        await purgeLiveRoom(code);
        return true;
    }
    return false;
}

async function createAttempt(admin, room, uid, name, role, safe) {
    let attempt = await getAttempt(admin, room.roomCode, uid);
    if (!attempt) {
        const payload = {
            user_id: uid, subject_code: room.subjectCode || null, subject_name: room.subjectName,
            exam_type: room.examTitle || 'MCQ', difficulty: room.difficulty, questions: safe,
            total_marks: room.questionCount || 30, time_minutes: room.durationMinutes,
            answers: Array(room.questionCount || 30).fill(null), score: null,
            status: room.status === 'started' ? 'in_progress' : 'waiting',
            attempt_type: 'test_room', room_code: room.roomCode, room_role: role,
            participant_name: name, started_at: room.startedAt ? new Date(room.startedAt).toISOString() : new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        try {
            attempt = await privateExamData(admin, 'create_attempt', payload);
        } catch (error) {
            attempt = await getAttempt(admin, room.roomCode, uid);
            if (!attempt) throw error;
        }
    }
    const questions = await getQuestions(room.roomCode).catch(() => null);
    const answerKey = Array.isArray(questions) ? questions.map((q) => q.answer) : [];
    if (answerKey.length) {
        await privateExamData(admin, 'set_answer_key', { attempt_id: attempt.id, answer_key: answerKey });
    }
    if (room.catalogSubjectId != null) {
        await tagAttemptSubject(admin, attempt.id, uid, room.catalogSubjectId);
    }
    return attempt;
}
async function writeAnswers(admin, attemptId, uid, answers, revision) {
    const acceptedRevision = Math.max(0, Math.floor(Number(revision) || 0));
    const data = await privateExamData(admin, 'update_attempt', {
        id: attemptId, user_id: uid, attempt_type: 'test_room',
        statuses: ['in_progress'], before_revision: acceptedRevision,
        patch: { answers, answer_revision: acceptedRevision, updated_at: new Date().toISOString() },
    });
    return Boolean(data?.id);
}
async function privateAnswerKey(admin, attemptId, questions = null) {
    if (Array.isArray(questions) && questions.length) return questions.map((q) => q.answer);
    const data = await privateExamData(admin, 'get_answer_key', { attempt_id: attemptId });
    return Array.isArray(data?.answer_key) ? data.answer_key : [];
}
async function finalizeAttempt(admin, {
    code,
    uid,
    status = 'disconnected',
    reason = 'connection_lost',
    submittedAnswers = null,
    submittedRevision = null,
}) {
    const attempt = await getAttempt(admin, code, uid);
    if (!attempt) return { ok: false, error: 'Attempt record not found.' };
    if (!['in_progress', 'waiting'].includes(attempt.status)) {
        return {
            ok: true,
            alreadyFinalized: true,
            status: attempt.status,
            result: attempt.score == null ? null : {
                correct: attempt.correct_count || 0,
                incorrect: attempt.incorrect_count || 0,
                attempted: attempt.attempted_count || 0,
                unattempted: attempt.unattempted_count ?? attempt.total_marks,
                points: attempt.score,
                totalQuestions: attempt.total_marks,
            },
        };
    }
    if (attempt.status === 'waiting') return { ok: false, error: 'The test has not started yet.' };

    // Close Redis first to stop a late answer write racing with finalization.
    // If the following DB write fails, dashboard reconciliation can retry using
    // this same closed snapshot and its stored finalStatus/endReason.
    const participantSnapshot = code
        ? await closeParticipantSnapshot(code, uid, status, reason, submittedAnswers, submittedRevision)
        : null;
    const questionList = code ? await getQuestions(code).catch(() => null) : null;
    const answerKey = await privateAnswerKey(admin, attempt.id, questionList);
    const finalStatus = participantSnapshot?.finalStatus || status;
    const finalReason = participantSnapshot?.endReason || reason;
    const answerSource = Array.isArray(participantSnapshot?.answers)
        ? participantSnapshot.answers
        : Array.isArray(submittedAnswers)
            ? submittedAnswers
            : attempt.answers;
    const answers = normalizeAnswers(
        answerSource,
        questionList?.length || attempt.questions?.length || answerKey.length || attempt.total_marks || 30,
    );
    const result = answerKey.length ? scoreAnswers(answerKey, answers) : null;
    const now = new Date().toISOString();
    const snapshotRevision = Math.max(
        0,
        Math.floor(Number(participantSnapshot?.answerRevision ?? submittedRevision ?? attempt.answer_revision ?? 0) || 0),
    );
    const patch = {
        answers,
        answer_revision: snapshotRevision,
        status: finalStatus,
        end_reason: finalReason,
        submitted_at: now,
        updated_at: now,
    };
    if (result) Object.assign(patch, {
        score: result.points,
        correct_count: result.correct,
        incorrect_count: result.incorrect,
        attempted_count: result.attempted,
        unattempted_count: result.unattempted,
    });

    const data = await privateExamData(admin, 'update_attempt', {
        id: attempt.id, user_id: uid, attempt_type: 'test_room',
        statuses: ['in_progress'], patch,
    });

    if (!data) {
        // Another request may have finalized the row concurrently. Return the
        // actual durable result instead of a stale local calculation.
        const refreshed = await getAttempt(admin, code, uid);
        if (refreshed && !['in_progress', 'waiting'].includes(refreshed.status)) {
            return {
                ok: true,
                alreadyFinalized: true,
                status: refreshed.status,
                result: refreshed.score == null ? null : {
                    correct: refreshed.correct_count || 0,
                    incorrect: refreshed.incorrect_count || 0,
                    attempted: refreshed.attempted_count || 0,
                    unattempted: refreshed.unattempted_count ?? refreshed.total_marks,
                    points: refreshed.score,
                    totalQuestions: refreshed.total_marks,
                },
            };
        }
        return { ok: false, error: 'The attempt changed while it was being finalized. Please retry.' };
    }

    if (participantSnapshot && code) {
        await patchParticipant(code, uid, {
            status: ['submitted', 'auto_submitted', 'timed_out'].includes(finalStatus) ? 'submitted' : 'disconnected',
            finalStatus,
            endReason: finalReason,
            connected: false,
            answers,
            answerRevision: snapshotRevision,
            result,
            disconnectedAt: Date.now(),
        }).catch(() => {});
    }
    if (code) {
        // Remove only ephemeral Redis keys once every room attempt is finalized.
        // Saved answers, answer keys and review data remain durable in Supabase.
        await cleanupRoomIfComplete(admin, code).catch((error) => {
            console.error('[test-room-session] completed-room cleanup deferred:', error?.message || error);
        });
    }
    return { ok: true, status: data.status, result, alreadyFinalized: false };
}

async function reconcileRoom(admin, code, skipUid = '') {
    // Heartbeats and debounced answer saves can arrive frequently. A short Redis
    // lease ensures only one request per room scans every participant at a time.
    // This reduces command amplification and avoids making heartbeats wait for
    // dozens of redundant Redis round trips.
    const lease = await redis('SET', keys(code).reconcileLock, String(Date.now()), 'EX', 8, 'NX').catch(() => null);
    if (lease !== 'OK') return;

    const room = await getRoom(code).catch(() => null);
    if (!room) return;
    const memberIds = await redis('SMEMBERS', keys(code).members).catch(() => []);
    const now = Date.now();
    for (const uid of Array.isArray(memberIds) ? memberIds : []) {
        if (!uid || uid === skipUid) continue;
        const p = await getParticipant(code, uid).catch(() => null);
        if (!p || !p.attemptId) continue;
        const durableAttempt = await getAttempt(admin, code, uid).catch(() => null);
        if (durableAttempt?.status === 'in_progress' && ['disconnected', 'submitted'].includes(p.status)) {
            await finalizeAttempt(admin, {
                code,
                uid,
                status: p.finalStatus || (p.status === 'submitted' ? 'submitted' : 'disconnected'),
                reason: p.endReason || 'recovery_after_partial_finalization',
            }).catch(() => {});
            continue;
        }
        if (!['waiting', 'connected'].includes(p.status) || room.status !== 'started') continue;
        if (Number(room.deadlineAt) > 0 && now >= Number(room.deadlineAt)) {
            await finalizeAttempt(admin, { code, uid, status: 'timed_out', reason: 'timer_expired' }).catch(() => {});
        } else if (shouldFinalizeStaleHeartbeat(p, now)) {
            await finalizeAttempt(admin, { code, uid, status: 'disconnected', reason: 'heartbeat_lost' }).catch(() => {});
        }
    }
}
function fail(res, status, error) { return res.status(status).json({ error }); }

export default async function handler(req, res) {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return fail(res, 405, 'Method not allowed.'); }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const action = String(body.action || '');

    // This unauthenticated action only reveals whether a high-entropy code is
    // valid and waiting. Joining, Realtime presence, and attempts still require auth.
    if (action === 'public_verify') {
        const code = normalizeCode(body.code);
        if (!code) return fail(res, 400, 'That room code is invalid. Enter the 10-character code shared by the host.');
        try {
            const room = await getRoom(code);
            if (!room) return fail(res, 404, 'No active Test Room was found for that code. Check the code and try again.');
            const joinError = roomJoinError(room.status);
            if (joinError) return res.status(409).json({ valid: false, joinable: false, error: joinError });
            return res.status(200).json({
                valid: true,
                joinable: true,
                serverNow: Date.now(),
                room: {
                    roomCode: room.roomCode,
                    subjectName: room.subjectName,
                    examTitle: room.examTitle,
                    difficulty: room.difficulty,
                    durationMinutes: room.durationMinutes,
                    status: room.status,
                    startedAt: room.startedAt,
                    serverNow: Date.now(),
                    questionCount: room.questionCount,
                    participantLimit: room.participantLimit,
                },
            });
        } catch (error) {
            console.error('[test-room-session] public room verification failed:', error?.message || error);
            return fail(res, 503, 'Test Rooms are temporarily unavailable. Please try again shortly.');
        }
    }

    let admin, user;
    try { admin = adminClient(); user = await authenticate(req, admin); }
    catch (error) {
        console.error('[test-room-session] authentication service failed:', error?.message || error);
        return fail(res, 503, 'Test Rooms are temporarily unavailable. Please try again shortly.');
    }
    if (!user) return fail(res, 401, 'Sign in to join this Test Room.');
    try {
        if (action === 'create') {
            const questions = cleanQuestions(body.questions);
            const input = body.room && typeof body.room === 'object' ? body.room : {};
            let catalogSubjectId = null;
            if (input.catalogSubjectId !== undefined && input.catalogSubjectId !== null && input.catalogSubjectId !== '') {
                catalogSubjectId = Number(input.catalogSubjectId);
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
                catalogSubjectId = Number(catalogSubject.SubjectId);
            }
            const createdAtMs = Date.now();
            const room = {
                roomCode: '', hostUid: user.id, hostName: displayName(user),
                catalogSubjectId,
                subjectCode: String(input.subjectCode || '').slice(0, 120),
                subjectName: String(input.subjectName || 'MCQ Exam').slice(0, 160),
                examTitle: String(input.examTitle || 'MCQ Exam').slice(0, 100),
                difficulty: ['easy', 'medium', 'hard'].includes(input.difficulty) ? input.difficulty : 'medium',
                durationMinutes: Math.min(180, Math.max(1, Math.floor(Number(input.durationMinutes) || 45))),
                status: 'waiting', startedAt: null, deadlineAt: null, questionCount: 30,
                participantLimit: MAX_PARTICIPANTS, createdAt: new Date(createdAtMs).toISOString(),
                expiresAt: createdAtMs + ROOM_TTL_SECONDS * 1000, serverNow: createdAtMs,
            };
            let code = '';
            // Reserve the metadata key atomically BEFORE writing any room-specific
            // keys. Otherwise two simultaneous creators could both pass EXISTS and
            // one could overwrite the other room's questions/participants.
            for (let i = 0; i < 5; i += 1) {
                const candidate = generateCode();
                const reservation = await redis(
                    'SET',
                    keys(candidate).meta,
                    JSON.stringify({ ...room, roomCode: candidate }),
                    'EX',
                    roomTtlSeconds(room, createdAtMs),
                    'NX',
                );
                if (reservation === 'OK') {
                    code = candidate;
                    break;
                }
            }
            if (!code) return fail(res, 503, 'Could not allocate a unique room code. Please retry.');
            room.roomCode = code;
            const safe = safeQuestions(questions);
            const initialTtl = roomTtlSeconds(room);
            const host = {
                userId: user.id, displayName: room.hostName, role: 'host', status: 'waiting',
                connected: true, joinedAt: room.createdAt, lastHeartbeat: Date.now(),
                answers: Array(30).fill(null), answerRevision: 0, attemptId: null,
            };
            try {
                await setJson(keys(code).questions, questions, initialTtl);
                await redis('SADD', keys(code).members, user.id);
                await redis('EXPIRE', keys(code).members, initialTtl);
                await setJson(keys(code, user.id).participant, host, initialTtl);

                const attempt = await createAttempt(admin, room, user.id, room.hostName, 'host', safe);
                host.attemptId = attempt.id;
                await setJson(keys(code, user.id).participant, host, roomTtlSeconds(room));
                return res.status(200).json({ code, room, attemptId: attempt.id, questions: safe, serverNow: Date.now() });
            } catch (error) {
                // Preserve an audit record if the DB attempt was inserted but a later
                // step failed; never leave a dangling "waiting" attempt in the dashboard.
                const partialAttempt = await getAttempt(admin, code, user.id).catch(() => null);
                if (partialAttempt && ['waiting', 'in_progress'].includes(partialAttempt.status)) {
                    await privateExamData(admin, 'update_attempt', {
                        id: partialAttempt.id, user_id: user.id, statuses: ['waiting', 'in_progress'],
                        patch: { status: 'cancelled', end_reason: 'room_creation_failed', updated_at: new Date().toISOString() },
                    }).catch(() => {});
                }
                await redis('DEL', keys(code).meta, keys(code).questions, keys(code).members, keys(code, user.id).participant).catch(() => {});
                return fail(res, 503, 'The room was not created because its attempt could not be saved: ' + error.message);
            }
        }

        if (action === 'reconcile_my_attempts') {
            const data = await privateExamData(admin, 'list_attempts', {
                user_id: user.id, attempt_type: 'test_room', statuses: ['waiting', 'in_progress'], limit: 100,
            });
            for (const attempt of data || []) {
                const room = attempt.room_code ? await getRoom(attempt.room_code).catch(() => null) : null;
                if (room) {
                    await reconcileRoom(admin, attempt.room_code);
                    const p = await getParticipant(attempt.room_code, user.id).catch(() => null);
                    const refreshed = await getAttempt(admin, attempt.room_code, user.id).catch(() => null);
                    if (refreshed?.status === 'in_progress' && (
                        ['disconnected', 'submitted'].includes(p?.status)
                        || !p
                        || (p?.tabHidden !== true && !Number(p?.lastHeartbeat))
                        || shouldFinalizeStaleHeartbeat(p)
                    )) {
                        const timedOut = Number(room.deadlineAt) > 0 && Date.now() >= Number(room.deadlineAt);
                        await finalizeAttempt(admin, { code: attempt.room_code, uid: user.id, status: p?.finalStatus || (timedOut ? 'timed_out' : p?.status === 'submitted' ? 'submitted' : 'disconnected'), reason: p?.endReason || (timedOut ? 'timer_expired' : 'connection_lost') }).catch(() => {});
                    }
                } else if (attempt.status === 'in_progress') {
                    await finalizeAttempt(admin, { code: attempt.room_code, uid: user.id, status: 'disconnected', reason: 'room_expired_after_disconnect' }).catch(() => {});
                } else if (attempt.status === 'waiting') {
                    await privateExamData(admin, 'update_attempt', {
                        id: attempt.id, user_id: user.id, statuses: ['waiting'],
                        patch: { status: 'cancelled', end_reason: 'room_expired_before_start', updated_at: new Date().toISOString() },
                    });
                }
            }
            return res.status(200).json({ ok: true });
        }

        if (action === 'get_attempt_review') {
            const attemptId = String(body.attemptId || '');
            if (!/^[0-9a-f-]{36}$/i.test(attemptId)) return fail(res, 400, 'Invalid attempt identifier.');
            const attempt = await privateExamData(admin, 'get_attempt', {
                id: attemptId, user_id: user.id, attempt_type: 'test_room',
            });
            if (!attempt) return fail(res, 404, 'Attempt not found.');
            if (!['submitted', 'auto_submitted', 'disconnected', 'timed_out'].includes(attempt.status)) {
                return fail(res, 409, 'This attempt is not finalized yet. Its saved progress is still being reconciled.');
            }
            const keyRow = await privateExamData(admin, 'get_answer_key', { attempt_id: attempt.id });
            const key = Array.isArray(keyRow?.answer_key) ? keyRow.answer_key : [];
            const safeQuestionsForReview = Array.isArray(attempt.questions) ? attempt.questions : [];
            const answers = normalizeAnswers(attempt.answers, safeQuestionsForReview.length || 30);
            const correct = safeQuestionsForReview.map((question, index) => ({
                ...question,
                options: (Array.isArray(question.options) ? question.options : [])
                    .slice()
                    .sort((a, b) => Number(a?.originalOptionIndex ?? 0) - Number(b?.originalOptionIndex ?? 0))
                    .map((option) => String(option?.text ?? option ?? '')),
                answer: Number.isInteger(key[index]) ? key[index] : null,
            }));
            const userAnswers = Object.fromEntries(correct.map((question, index) => [
                question.id,
                answers[index] === null || answers[index] === undefined ? '' : answers[index],
            ]));
            return res.status(200).json({
                record: {
                    id: attempt.id,
                    date: attempt.started_at || attempt.created_at,
                    subjectId: attempt.subject_code || attempt.subject_name,
                    subjectName: attempt.subject_name,
                    examType: attempt.exam_type,
                    difficulty: attempt.difficulty,
                    type: 'objective',
                    score: attempt.score,
                    totalMarks: attempt.total_marks,
                    questions: correct,
                    userAnswers,
                    attemptType: 'test_room',
                    status: attempt.status,
                    endReason: attempt.end_reason,
                    correctCount: attempt.correct_count,
                    incorrectCount: attempt.incorrect_count,
                    attemptedCount: attempt.attempted_count,
                    unattemptedCount: attempt.unattempted_count,
                },
            });
        }

        const code = normalizeCode(body.code);
        if (!code) return fail(res, 400, 'Enter a valid 10-character room code.');
        const room = await getRoom(code);

        if (action === 'host_resume') {
            if (!room) return fail(res, 404, 'No active Test Room was found for that code. Check the code and try again.');
            if (String(room.hostUid || '') !== String(user.id)) {
                return fail(res, 403, 'Only the account that created this Test Room can restore the host session.');
            }

            const participant = await getParticipant(code, user.id);
            const attempt = await getAttempt(admin, code, user.id);
            const resumeError = hostResumeError(room, participant, attempt, user.id);
            if (resumeError) return fail(res, 409, resumeError);

            // The original generated question set remains in the host's route state.
            // Resume returns only active host metadata and the host's own attempt id;
            // it never returns questions or the private answer key.
            const serverNow = Date.now();
            const hostPresence = {
                role: 'host',
                roomCode: room.roomCode,
                userId: user.id,
                hostUid: user.id,
                hostName: room.hostName || displayName(user),
                displayName: participant.displayName || room.hostName || displayName(user),
                joinedAt: participant.joinedAt || room.createdAt,
                connected: true,
                status: room.status,
                subjectCode: room.subjectCode || '',
                subjectName: room.subjectName || 'MCQ Exam',
                examTitle: room.examTitle || 'MCQ Exam',
                difficulty: room.difficulty || 'medium',
                durationMinutes: room.durationMinutes || 45,
                startedAt: room.startedAt || null,
                deadlineAt: room.deadlineAt || null,
                questionCount: room.questionCount || 30,
                participantLimit: room.participantLimit || MAX_PARTICIPANTS,
                createdAt: room.createdAt,
                expiresAt: room.expiresAt,
                serverNow,
            };
            return res.status(200).json({
                resumed: true,
                room: hostPresence,
                attemptId: participant.attemptId || attempt.id,
                serverNow,
            });
        }

        if (action === 'verify') {
            if (!room) return fail(res, 404, 'No active room was found for that code.');
            const joinError = roomJoinError(room.status);
            if (joinError) return res.status(409).json({ valid: false, joinable: false, error: joinError });
            return res.status(200).json({ valid: true, joinable: true, room: {
                roomCode: room.roomCode, hostUid: room.hostUid, hostName: room.hostName, subjectName: room.subjectName,
                examTitle: room.examTitle, difficulty: room.difficulty, durationMinutes: room.durationMinutes,
                status: room.status, startedAt: room.startedAt, serverNow: Date.now(),
                questionCount: room.questionCount, participantLimit: room.participantLimit,
            }, serverNow: Date.now() });
        }
        if (action === 'room_results') {
            const hostAttempt = room ? null : await getAttempt(admin, code, user.id);
            if ((room && user.id !== room.hostUid) || (!room && hostAttempt?.room_role !== 'host')) {
                return fail(res, 403, 'Only the host can view the room-wide results.');
            }
            const data = await privateExamData(admin, 'list_attempts', {
                room_code: code, attempt_type: 'test_room', room_role: 'participant',
                statuses: ['submitted', 'auto_submitted', 'disconnected', 'timed_out'],
                order: 'submitted_at_asc', limit: MAX_PARTICIPANTS,
            });
            return res.status(200).json({
                results: (data || []).filter((row) => row.score !== null).map((row) => ({
                    userId: row.user_id,
                    displayName: row.participant_name || 'Participant',
                    points: Number(row.score),
                    totalQuestions: Number(row.total_marks || 30),
                    correct: Number(row.correct_count || 0),
                    incorrect: Number(row.incorrect_count || 0),
                    attempted: Number(row.attempted_count || 0),
                    unattempted: Number(row.unattempted_count || 0),
                    status: row.status,
                    endReason: row.end_reason,
                })),
            });
        }

        if (!room) {
            // A client may retry a submit after the last participant caused the
            // ephemeral room to be purged. Return its durable result idempotently.
            if (action === 'submit') {
                const attempt = await getAttempt(admin, code, user.id);
                if (attempt && ['submitted', 'auto_submitted', 'disconnected', 'timed_out'].includes(attempt.status)) {
                    return res.status(200).json({
                        ok: true,
                        alreadyFinalized: true,
                        status: attempt.status,
                        result: attempt.score == null ? null : {
                            correct: attempt.correct_count || 0,
                            incorrect: attempt.incorrect_count || 0,
                            attempted: attempt.attempted_count || 0,
                            unattempted: attempt.unattempted_count ?? attempt.total_marks,
                            points: attempt.score,
                            totalQuestions: attempt.total_marks,
                        },
                    });
                }
            }
            return fail(res, 404, 'This room expired or is no longer available.');
        }

        if (action === 'poll_lobby') {
            const memberIds = await redis('SMEMBERS', keys(code).members);
            const isHost = String(room.hostUid || '') === String(user.id);
            const isMember = Array.isArray(memberIds) && memberIds.map(String).includes(String(user.id));
            const ownParticipant = isHost ? null : await getParticipant(code, user.id);
            if (!isHost && (!isMember || !ownParticipant)) {
                return fail(res, 403, 'Only members of this Test Room can read its live lobby.');
            }
            const participants = await Promise.all((Array.isArray(memberIds) ? memberIds : []).map(
                (uid) => getParticipant(code, String(uid)).catch(() => null),
            ));
            const snapshot = buildLobbySnapshot(room, participants);
            if (room.status === 'started' && !isHost) {
                const questions = await getQuestions(code);
                snapshot.questions = Array.isArray(questions) ? safeQuestions(questions) : [];
            }
            return res.status(200).json(snapshot);
        }

        if (action === 'join') {
            const joinError = roomJoinError(room.status);
            if (joinError) return fail(res, 409, joinError);
            const participantKey = keys(code, user.id).participant;
            const previous = await getParticipant(code, user.id);
            if (previous?.status === 'disconnected') return fail(res, 409, 'You have already disconnected from this room and cannot rejoin it.');
            const person = { userId: user.id, displayName: displayName(user), role: 'participant', status: 'waiting', connected: true, joinedAt: new Date().toISOString(), lastHeartbeat: Date.now(), answers: Array(room.questionCount || 30).fill(null), answerRevision: 0, attemptId: null };
            const joinScript = [
                "local raw = redis.call('GET', KEYS[1])",
                "if not raw then return 'ERR:ROOM_NOT_FOUND' end",
                "local meta = cjson.decode(raw)",
                "if meta.status ~= 'waiting' then return 'ERR:ROOM_STARTED' end",
                "local old = redis.call('GET', KEYS[3])",
                "if old then return 'EXISTING:' .. old end",
                "if redis.call('SCARD', KEYS[2]) >= tonumber(ARGV[1]) then return 'ERR:ROOM_FULL' end",
                "local p = cjson.decode(ARGV[2])",
                "redis.call('SADD', KEYS[2], ARGV[3])",
                "redis.call('SET', KEYS[3], cjson.encode(p), 'EX', ARGV[4])",
                "redis.call('EXPIRE', KEYS[1], ARGV[4])",
                "redis.call('EXPIRE', KEYS[2], ARGV[4])",
                "return 'NEW'"
            ].join('\n');
            const joined = String(await redis('EVAL', joinScript, 3, keys(code).meta, keys(code).members, participantKey, MAX_PARTICIPANTS, JSON.stringify(person), user.id, roomTtlSeconds(room)));
            if (joined.startsWith('ERR:')) {
                const reason = joined.slice(4);
                const map = { ROOM_NOT_FOUND: 'This room expired or is no longer available.', ROOM_STARTED: 'This room has already started. Rejoining is disabled.', ROOM_FULL: 'This room has reached the 50-participant limit.' };
                return fail(res, reason === 'ROOM_FULL' ? 409 : 404, map[reason] || 'Could not join this room.');
            }
            let saved = joined.startsWith('EXISTING:') ? parseJson(joined.slice(9)) : person;
            if (saved?.status === 'disconnected') return fail(res, 409, 'You have already disconnected from this room and cannot rejoin it.');
            const safe = safeQuestions(await getQuestions(code));
            const attempt = await createAttempt(admin, room, user.id, person.displayName, 'participant', safe);

            // Join reservation and start are atomic Redis operations, but the DB
            // attempt is created just after the reservation. Re-read the room so a
            // start occurring during that short window cannot leave this attempt
            // permanently in "waiting".
            const latestRoom = await getRoom(code);
            if (!latestRoom) throw new Error('The room expired while the participant was joining.');
            let participantStatus = 'waiting';
            if (latestRoom.status === 'started') {
                await privateExamData(admin, 'update_attempt', {
                    id: attempt.id, user_id: user.id, statuses: ['waiting'],
                    patch: { status: 'in_progress', started_at: new Date(Number(latestRoom.startedAt)).toISOString(), updated_at: new Date().toISOString() },
                });
                participantStatus = 'connected';
            } else if (latestRoom.status !== 'waiting') {
                return fail(res, 409, 'This room has already ended.');
            }

            saved = {
                ...saved,
                attemptId: attempt.id,
                status: participantStatus,
                lastHeartbeat: Date.now(),
                connected: true,
            };
            await setJson(participantKey, saved);
            return res.status(200).json({
                accepted: true,
                room: latestRoom,
                attemptId: attempt.id,
                questions: safe,
                serverNow: Date.now(),
            });
        }

        if (action === 'start') {
            const script = buildStartRoomScript();
            const started = String(await redis(
                'EVAL', script, 1, keys(code).meta, user.id, Date.now(),
                ROOM_TTL_SECONDS, ROOM_CLEANUP_GRACE_SECONDS,
            ));
            if (started.startsWith('ERR:')) {
                const reason = started.slice(4);
                return fail(res, reason === 'HOST_ONLY' ? 403 : reason === 'ROOM_NOT_FOUND' ? 404 : 409, ({ HOST_ONLY: 'Only the room host can start this test.', ROOM_NOT_FOUND: 'This room expired or is no longer available.', ROOM_NOT_WAITING: 'This room cannot be started.' })[reason] || 'Could not start the room.');
            }
            const startedRoom = parseJson(started);
            const startedTtl = roomTtlSeconds(startedRoom);
            const memberIds = await redis('SMEMBERS', keys(code).members);
            await Promise.all([
                redis('EXPIRE', keys(code).questions, startedTtl),
                redis('EXPIRE', keys(code).members, startedTtl),
            ]);
            const startIso = new Date(Number(startedRoom.startedAt)).toISOString();
            // One database update handles all room attempts. Serial per-person reads
            // and writes can exceed serverless request limits at the 50-person cap.
            await privateExamData(admin, 'update_attempt', {
                room_code: code, attempt_type: 'test_room', statuses: ['waiting'],
                patch: { status: 'in_progress', started_at: startIso, updated_at: new Date().toISOString() },
            });

            await Promise.allSettled((Array.isArray(memberIds) ? memberIds : []).map(async (uid) => {
                const p = await getParticipant(code, uid);
                if (p?.status === 'waiting') {
                    await patchParticipant(code, uid, { status: 'connected', connected: true, lastHeartbeat: Date.now() });
                }
            }));
            return res.status(200).json({ startedAt: Number(startedRoom.startedAt), serverNow: Date.now(), deadlineAt: Number(startedRoom.deadlineAt), room: startedRoom });
        }

        if (action === 'visibility') {
            if (room.status !== 'started') return fail(res, 409, 'The test is not active.');
            const p = await getParticipant(code, user.id);
            if (!p || p.status === 'disconnected' || p.status === 'submitted') {
                return fail(res, 409, 'This attempt is no longer active. Rejoining is disabled.');
            }
            const now = Date.now();
            if (Number(room.deadlineAt) > 0 && now >= Number(room.deadlineAt)) {
                return res.status(200).json({
                    active: false,
                    ...await finalizeAttempt(admin, { code, uid: user.id, status: 'timed_out', reason: 'timer_expired' }),
                });
            }
            const isVisible = body.isVisible !== false;
            const script = [
                "local raw = redis.call('GET', KEYS[1])",
                "if not raw then return 'ERR:PARTICIPANT_NOT_FOUND' end",
                "local p = cjson.decode(raw)",
                "if p.status == 'disconnected' or p.status == 'submitted' then return 'ERR:ATTEMPT_CLOSED' end",
                "local revision = tonumber(ARGV[2])",
                "if p.visibilityRevision and revision <= tonumber(p.visibilityRevision) then return cjson.encode(p) end",
                "p.visibilityRevision = revision",
                "p.tabHidden = ARGV[1] == 'false'",
                "if p.tabHidden then p.tabHiddenSince = p.tabHiddenSince or tonumber(ARGV[3]) else p.tabHiddenSince = nil end",
                "p.lastHeartbeat = tonumber(ARGV[3]); p.lastVisibilityChange = tonumber(ARGV[3]); p.connected = true",
                "redis.call('SET', KEYS[1], cjson.encode(p), 'EX', ARGV[4])",
                "return cjson.encode(p)"
            ].join('\n');
            const visibilityRevision = Number.isSafeInteger(Number(body.visibilityRevision)) && Number(body.visibilityRevision) > 0
                ? Number(body.visibilityRevision)
                : now;
            const updated = String(await redis(
                'EVAL', script, 1, keys(code, user.id).participant,
                isVisible ? 'true' : 'false', visibilityRevision, now, roomTtlSeconds(room),
            ));
            if (updated.startsWith('ERR:')) return fail(res, 409, 'This attempt is no longer active. Rejoining is disabled.');
            return res.status(200).json({ active: true, isVisible, serverNow: now, deadlineAt: room.deadlineAt });
        }

        if (action === 'heartbeat') {
            await reconcileRoom(admin, code, user.id);
            const p = await getParticipant(code, user.id);
            if (!p || p.status === 'disconnected' || p.status === 'submitted') return fail(res, 409, 'This attempt is no longer active. Rejoining is disabled.');
            if (room.status === 'started' && Number(room.deadlineAt) > 0 && Date.now() >= Number(room.deadlineAt)) {
                return res.status(200).json({ active: false, ...await finalizeAttempt(admin, { code, uid: user.id, status: 'timed_out', reason: 'timer_expired', submittedAnswers: body.answers, submittedRevision: body.revision }) });
            }
            if (room.status === 'started' && shouldFinalizeStaleHeartbeat(p)) {
                const final = await finalizeAttempt(admin, {
                    code, uid: user.id, status: 'disconnected', reason: 'heartbeat_lost', submittedAnswers: body.answers, submittedRevision: body.revision,
                });
                return res.status(200).json({ active: false, ...final });
            }

            // Heartbeats also retry the newest answer snapshot. This closes the gap
            // where a transient save_answer request failed and the student made no
            // further selections before disconnecting.
            if (Array.isArray(body.answers)) {
                const questions = await getQuestions(code);
                const normalized = normalizeAnswers(body.answers, questions?.length || 30);
                const revision = Number.isFinite(Number(body.revision)) ? Number(body.revision) : Date.now();
                const snapshotScript = [
                    "local raw = redis.call('GET', KEYS[1])",
                    "if not raw then return 'ERR:PARTICIPANT_NOT_FOUND' end",
                    "local participant = cjson.decode(raw)",
                    "if participant.status == 'disconnected' or participant.status == 'submitted' then return 'ERR:ATTEMPT_CLOSED' end",
                    "local revision = tonumber(ARGV[2])",
                    "if not participant.answerRevision or revision > tonumber(participant.answerRevision) then participant.answers = cjson.decode(ARGV[1]); participant.answerRevision = revision end",
                    "participant.lastHeartbeat = tonumber(ARGV[3]); participant.connected = true",
                    "redis.call('SET', KEYS[1], cjson.encode(participant), 'EX', ARGV[4])",
                    "return cjson.encode(participant)"
                ].join('\n');
                const savedRaw = String(await redis('EVAL', snapshotScript, 1, keys(code, user.id).participant, JSON.stringify(normalized), revision, Date.now(), roomTtlSeconds(room)));
                if (savedRaw.startsWith('ERR:')) return fail(res, 409, 'This attempt is no longer active.');
                const saved = parseJson(savedRaw);
                await writeAnswers(admin, p.attemptId, user.id, normalizeAnswers(saved?.answers || normalized, questions?.length || 30), Number(saved?.answerRevision ?? revision));
            } else {
                await patchParticipant(code, user.id, { lastHeartbeat: Date.now(), connected: true });
            }
            return res.status(200).json({ active: true, serverNow: Date.now(), deadlineAt: room.deadlineAt });
        }

        if (action === 'save_answer') {
            await reconcileRoom(admin, code, user.id);
            const currentRoom = await getRoom(code);
            const p = await getParticipant(code, user.id);
            if (!currentRoom || currentRoom.status !== 'started') return fail(res, 409, 'The test is not active.');
            if (!p || p.status === 'disconnected' || p.status === 'submitted') return fail(res, 409, 'This attempt is no longer active. Rejoining is disabled.');
            if (Date.now() >= Number(currentRoom.deadlineAt)) {
                return res.status(200).json({ active: false, ...await finalizeAttempt(admin, { code, uid: user.id, status: 'timed_out', reason: 'timer_expired', submittedAnswers: body.answers, submittedRevision: body.revision }) });
            }
            if (shouldFinalizeStaleHeartbeat(p)) {
                const final = await finalizeAttempt(admin, {
                    code, uid: user.id, status: 'disconnected', reason: 'heartbeat_lost', submittedAnswers: body.answers,
                });
                return res.status(200).json({ active: false, ...final });
            }
            const questions = await getQuestions(code);
            const answers = normalizeAnswers(body.answers, questions?.length || 30);
            const script = [
                "local raw = redis.call('GET', KEYS[1])",
                "if not raw then return 'ERR:PARTICIPANT_NOT_FOUND' end",
                "local p = cjson.decode(raw)",
                "if p.status == 'disconnected' or p.status == 'submitted' then return 'ERR:ATTEMPT_CLOSED' end",
                "local revision = tonumber(ARGV[2])",
                "if not p.answerRevision or revision > tonumber(p.answerRevision) then p.answers = cjson.decode(ARGV[1]); p.answerRevision = revision end",
                "p.lastHeartbeat = tonumber(ARGV[3]); p.connected = true",
                "redis.call('SET', KEYS[1], cjson.encode(p), 'EX', ARGV[4])",
                "return cjson.encode(p)"
            ].join('\n');
            const result = String(await redis('EVAL', script, 1, keys(code, user.id).participant, JSON.stringify(answers), Number(body.revision) || Date.now(), Date.now(), roomTtlSeconds(currentRoom)));
            if (result.startsWith('ERR:')) return fail(res, 409, 'This attempt is no longer active.');
            const saved = parseJson(result);
            await writeAnswers(admin, p.attemptId, user.id, normalizeAnswers(saved?.answers || answers, questions?.length || 30), Number(saved?.answerRevision ?? body.revision ?? Date.now()));
            return res.status(200).json({ ok: true, savedAt: Date.now() });
        }

        if (['submit', 'disconnect', 'mark_disconnected'].includes(action)) {
            let targetUid = user.id;
            if (action === 'mark_disconnected') {
                if (user.id !== room.hostUid) return fail(res, 403, 'Only the host can finalize a disconnected participant.');
                targetUid = String(body.targetUid || '');
                if (!targetUid || targetUid === user.id) return fail(res, 400, 'Invalid participant.');
            }
            const p = await getParticipant(code, targetUid);
            if (!p) return fail(res, 404, 'Participant attempt not found.');
            if (room.status !== 'started') return fail(res, 409, 'The test has not started.');
            const decision = resolveFinalization(action, room.deadlineAt, Date.now());
            const inputAnswers = targetUid === user.id ? body.answers : null;
            const finalized = await finalizeAttempt(admin, {
                code, uid: targetUid, status: decision.status, reason: decision.reason,
                submittedAnswers: inputAnswers, submittedRevision: body.revision,
            });
            if (!finalized.ok) return fail(res, 409, finalized.error || 'Could not finalize the attempt.');
            return res.status(200).json(finalized);
        }
        return fail(res, 400, 'Unknown Test Room action.');
    } catch (error) {
        const message = String(error?.message || 'Test Room operation failed.');
        const unavailable = /redis|upstash|fetch failed|credentials|supabase|database|postgres/i.test(message);
        console.error('[test-room-session] request failed:', { action, message });
        return fail(
            res,
            unavailable ? 503 : 500,
            unavailable
                ? 'Test Rooms are temporarily unavailable. Please try again shortly.'
                : 'We could not complete this Test Room request. Please try again.',
        );
    }
}
