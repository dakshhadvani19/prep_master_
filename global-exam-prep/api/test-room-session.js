import { createClient } from '@supabase/supabase-js';
import { randomInt } from 'node:crypto';

const process = globalThis.process;
const ROOM_TTL_SECONDS = 72 * 60 * 60;
const MAX_PARTICIPANTS = 50;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const STALE_AFTER_MS = 35_000;

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
function normalizeCode(value) {
    const code = String(value ?? '').trim().toUpperCase().replace(/[\s-]/g, '');
    return new RegExp('^[' + CODE_ALPHABET + ']{10}$').test(code) ? code : null;
}
function generateCode() {
    return Array.from({ length: 10 }, () => CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)]).join('');
}
function keys(code, uid = '') {
    const base = 'pm:test-room:' + code;
    return { meta: base + ':meta', questions: base + ':questions', members: base + ':members', participant: base + ':participant:' + uid };
}
function displayName(user) {
    const metadata = user?.user_metadata || {};
    return String(metadata.full_name || metadata.name || user?.email?.split('@')[0] || 'Student').trim().slice(0, 80) || 'Student';
}
function cleanQuestions(input) {
    if (!Array.isArray(input) || input.length !== 30) throw new Error('A Test Room must contain exactly 30 MCQs.');
    return input.map((q, index) => {
        const options = Array.isArray(q?.options) ? q.options : [];
        const answer = Number(q?.answer);
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
function safeQuestions(questions) {
    return questions.map(({ id, canonicalIndex, text, options }) => ({
        id, canonicalIndex, text, options: options.map((option) => ({ text: option.text, originalOptionIndex: option.originalOptionIndex })),
    }));
}
function normalizeAnswers(input, count = 30) {
    const source = Array.isArray(input) ? input : [];
    return Array.from({ length: count }, (_, index) => Number.isInteger(source[index]) && source[index] >= 0 && source[index] <= 3 ? source[index] : null);
}
function scoreAnswers(key, input) {
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
async function setJson(key, value) { return redis('SET', key, JSON.stringify(value), 'EX', ROOM_TTL_SECONDS); }
async function patchParticipant(code, uid, patch) {
    const script = [
        "local raw = redis.call('GET', KEYS[1])",
        "if not raw then return 'ERR:PARTICIPANT_NOT_FOUND' end",
        "local p = cjson.decode(raw)",
        "local patch = cjson.decode(ARGV[1])",
        "for k, v in pairs(patch) do p[k] = v end",
        "redis.call('SET', KEYS[1], cjson.encode(p), 'EX', ARGV[2])",
        "return cjson.encode(p)"
    ].join('\n');
    const result = String(await redis('EVAL', script, 1, keys(code, uid).participant, JSON.stringify(patch), ROOM_TTL_SECONDS));
    if (result.startsWith('ERR:')) throw new Error(result.slice(4));
    return parseJson(result);
}
async function getAttempt(admin, code, uid) {
    const { data, error } = await admin.from('exam_attempts').select('*').eq('room_code', code).eq('user_id', uid).eq('attempt_type', 'test_room').maybeSingle();
    if (error) throw new Error(error.message);
    return data;
}
async function createAttempt(admin, room, uid, name, role, safe) {
    let attempt = await getAttempt(admin, room.roomCode, uid);
    if (!attempt) {
        const { data, error } = await admin.from('exam_attempts').insert({
            user_id: uid, subject_code: room.subjectCode || null, subject_name: room.subjectName,
            exam_type: room.examTitle || 'MCQ', difficulty: room.difficulty, questions: safe,
            total_marks: room.questionCount || 30, time_minutes: room.durationMinutes,
            answers: Array(room.questionCount || 30).fill(null), score: null,
            status: room.status === 'started' ? 'in_progress' : 'waiting',
            attempt_type: 'test_room', room_code: room.roomCode, room_role: role,
            participant_name: name, started_at: room.startedAt ? new Date(room.startedAt).toISOString() : new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }).select('*').single();
        if (error) {
            attempt = await getAttempt(admin, room.roomCode, uid);
            if (!attempt) throw new Error(error.message);
        } else attempt = data;
    }
    const questions = await getQuestions(room.roomCode).catch(() => null);
    const answerKey = Array.isArray(questions) ? questions.map((q) => q.answer) : [];
    if (answerKey.length) {
        const { error } = await admin.from('exam_attempt_keys').upsert({ attempt_id: attempt.id, answer_key: answerKey }, { onConflict: 'attempt_id' });
        if (error) throw new Error(error.message);
    }
    return attempt;
}
async function writeAnswers(admin, attemptId, uid, answers) {
    const { error } = await admin.from('exam_attempts')
        .update({ answers, updated_at: new Date().toISOString() })
        .eq('id', attemptId).eq('user_id', uid).eq('attempt_type', 'test_room').eq('status', 'in_progress');
    if (error) throw new Error(error.message);
}
async function privateAnswerKey(admin, attemptId, questions = null) {
    if (Array.isArray(questions) && questions.length) return questions.map((q) => q.answer);
    const { data, error } = await admin.from('exam_attempt_keys').select('answer_key').eq('attempt_id', attemptId).maybeSingle();
    if (error) throw new Error(error.message);
    return Array.isArray(data?.answer_key) ? data.answer_key : [];
}
async function finalizeAttempt(admin, { code, uid, status = 'disconnected', reason = 'connection_lost', submittedAnswers = null }) {
    const attempt = await getAttempt(admin, code, uid);
    if (!attempt) return { ok: false, error: 'Attempt record not found.' };
    if (!['in_progress', 'waiting'].includes(attempt.status)) {
        return { ok: true, alreadyFinalized: true, status: attempt.status, result: attempt.score == null ? null : {
            correct: attempt.correct_count || 0, incorrect: attempt.incorrect_count || 0,
            attempted: attempt.attempted_count || 0, unattempted: attempt.unattempted_count ?? attempt.total_marks,
            points: attempt.score, totalQuestions: attempt.total_marks,
        } };
    }
    if (attempt.status === 'waiting') return { ok: false, error: 'The test has not started yet.' };
    const questionList = code ? await getQuestions(code).catch(() => null) : null;
    const answerKey = await privateAnswerKey(admin, attempt.id, questionList);
    const answers = normalizeAnswers(submittedAnswers ?? attempt.answers, attempt.total_marks || answerKey.length || 30);
    const result = answerKey.length ? scoreAnswers(answerKey, answers) : null;
    const now = new Date().toISOString();
    const patch = { answers, status, end_reason: reason, submitted_at: now, updated_at: now };
    if (result) Object.assign(patch, {
        score: result.points, correct_count: result.correct, incorrect_count: result.incorrect,
        attempted_count: result.attempted, unattempted_count: result.unattempted,
    });
    const { data, error } = await admin.from('exam_attempts').update(patch)
        .eq('id', attempt.id).eq('user_id', uid).eq('status', 'in_progress').select('*').maybeSingle();
    if (error) throw new Error(error.message);
    const participant = code ? await getParticipant(code, uid).catch(() => null) : null;
    if (participant) {
        await patchParticipant(code, uid, {
            status: ['submitted', 'auto_submitted', 'timed_out'].includes(status) ? 'submitted' : 'disconnected',
            connected: false, answers, result, disconnectedAt: Date.now(), endReason: reason,
        }).catch(() => {});
    }
    return { ok: true, status: data?.status || status, result, alreadyFinalized: !data };
}
async function reconcileRoom(admin, code) {
    const room = await getRoom(code).catch(() => null);
    if (!room) return;
    const memberIds = await redis('SMEMBERS', keys(code).members).catch(() => []);
    const now = Date.now();
    for (const uid of Array.isArray(memberIds) ? memberIds : []) {
        const p = await getParticipant(code, uid).catch(() => null);
        if (!p || !p.attemptId || !['waiting', 'connected'].includes(p.status)) continue;
        if (room.status !== 'started') continue;
        if (Number(room.deadlineAt) > 0 && now >= Number(room.deadlineAt)) {
            await finalizeAttempt(admin, { code, uid, status: 'timed_out', reason: 'timer_expired' }).catch(() => {});
        } else if (Number(p.lastHeartbeat || 0) > 0 && now - Number(p.lastHeartbeat) > STALE_AFTER_MS) {
            await finalizeAttempt(admin, { code, uid, status: 'disconnected', reason: 'heartbeat_lost' }).catch(() => {});
        }
    }
}
function fail(res, status, error) { return res.status(status).json({ error }); }

export default async function handler(req, res) {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return fail(res, 405, 'Method not allowed.'); }
    let admin, user;
    try { admin = adminClient(); user = await authenticate(req, admin); }
    catch (error) { return fail(res, 503, error.message || 'Test Room services are unavailable.'); }
    if (!user) return fail(res, 401, 'Sign in again before using Test Rooms.');
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const action = String(body.action || '');
    try {
        if (action === 'create') {
            const questions = cleanQuestions(body.questions);
            const input = body.room && typeof body.room === 'object' ? body.room : {};
            const room = {
                roomCode: '', hostUid: user.id, hostName: displayName(user),
                subjectCode: String(input.subjectCode || '').slice(0, 120),
                subjectName: String(input.subjectName || 'MCQ Exam').slice(0, 160),
                examTitle: String(input.examTitle || 'MCQ Exam').slice(0, 100),
                difficulty: ['easy', 'medium', 'hard'].includes(input.difficulty) ? input.difficulty : 'medium',
                durationMinutes: Math.min(180, Math.max(1, Math.floor(Number(input.durationMinutes) || 45))),
                status: 'waiting', startedAt: null, deadlineAt: null, questionCount: 30,
                participantLimit: MAX_PARTICIPANTS, createdAt: new Date().toISOString(), serverNow: Date.now(),
            };
            let code = '';
            for (let i = 0; i < 5; i += 1) {
                const candidate = generateCode();
                if (!(await redis('EXISTS', keys(candidate).meta))) { code = candidate; break; }
            }
            if (!code) return fail(res, 503, 'Could not allocate a unique room code. Please retry.');
            room.roomCode = code;
            const safe = safeQuestions(questions);
            const host = {
                userId: user.id, displayName: room.hostName, role: 'host', status: 'waiting',
                connected: true, joinedAt: room.createdAt, lastHeartbeat: Date.now(),
                answers: Array(30).fill(null), answerRevision: 0, attemptId: null,
            };
            await setJson(keys(code).questions, questions);
            await redis('SADD', keys(code).members, user.id);
            await redis('EXPIRE', keys(code).members, ROOM_TTL_SECONDS);
            await setJson(keys(code, user.id).participant, host);
            const created = await redis('SET', keys(code).meta, JSON.stringify(room), 'EX', ROOM_TTL_SECONDS, 'NX');
            if (created !== 'OK') {
                await redis('DEL', keys(code).questions, keys(code).members, keys(code, user.id).participant);
                return fail(res, 503, 'A room code collision occurred. Please retry.');
            }
            try {
                const attempt = await createAttempt(admin, room, user.id, room.hostName, 'host', safe);
                host.attemptId = attempt.id;
                await setJson(keys(code, user.id).participant, host);
                return res.status(200).json({ code, room, attemptId: attempt.id, questions: safe, serverNow: Date.now() });
            } catch (error) {
                await redis('DEL', keys(code).meta, keys(code).questions, keys(code).members, keys(code, user.id).participant).catch(() => {});
                return fail(res, 503, 'The room was not created because its attempt could not be saved: ' + error.message);
            }
        }

        if (action === 'reconcile_my_attempts') {
            const { data, error } = await admin.from('exam_attempts')
                .select('id,room_code,user_id,status,answers,total_marks,started_at')
                .eq('user_id', user.id).eq('attempt_type', 'test_room').in('status', ['waiting', 'in_progress']).limit(100);
            if (error) throw new Error(error.message);
            for (const attempt of data || []) {
                const room = attempt.room_code ? await getRoom(attempt.room_code).catch(() => null) : null;
                if (room) {
                    await reconcileRoom(admin, attempt.room_code);
                    const p = await getParticipant(attempt.room_code, user.id).catch(() => null);
                    const refreshed = await getAttempt(admin, attempt.room_code, user.id).catch(() => null);
                    if (refreshed?.status === 'in_progress' && (!p || !Number(p.lastHeartbeat) || Date.now() - Number(p.lastHeartbeat) > STALE_AFTER_MS)) {
                        const timedOut = Number(room.deadlineAt) > 0 && Date.now() >= Number(room.deadlineAt);
                        await finalizeAttempt(admin, { code: attempt.room_code, uid: user.id, status: timedOut ? 'timed_out' : 'disconnected', reason: timedOut ? 'timer_expired' : 'connection_lost' }).catch(() => {});
                    }
                } else if (attempt.status === 'in_progress') {
                    await finalizeAttempt(admin, { code: attempt.room_code, uid: user.id, status: 'disconnected', reason: 'room_expired_after_disconnect' }).catch(() => {});
                } else if (attempt.status === 'waiting') {
                    await admin.from('exam_attempts').update({ status: 'cancelled', end_reason: 'room_expired_before_start', updated_at: new Date().toISOString() }).eq('id', attempt.id).eq('user_id', user.id).eq('status', 'waiting');
                }
            }
            return res.status(200).json({ ok: true });
        }

        const code = normalizeCode(body.code);
        if (!code) return fail(res, 400, 'Enter a valid 10-character room code.');
        const room = await getRoom(code);

        if (action === 'verify') {
            if (!room) return fail(res, 404, 'No active room was found for that code.');
            if (room.status !== 'waiting') return res.status(409).json({ valid: false, joinable: false, error: 'This room has already started. Rejoining is disabled.' });
            return res.status(200).json({ valid: true, joinable: true, room: {
                roomCode: room.roomCode, hostUid: room.hostUid, hostName: room.hostName, subjectName: room.subjectName,
                examTitle: room.examTitle, difficulty: room.difficulty, durationMinutes: room.durationMinutes,
                status: room.status, startedAt: room.startedAt, serverNow: Date.now(),
                questionCount: room.questionCount, participantLimit: room.participantLimit,
            }, serverNow: Date.now() });
        }
        if (!room) return fail(res, 404, 'This room expired or is no longer available.');

        if (action === 'join') {
            if (room.status !== 'waiting') return fail(res, 409, 'This room has already started. Rejoining is disabled.');
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
            const joined = String(await redis('EVAL', joinScript, 3, keys(code).meta, keys(code).members, participantKey, MAX_PARTICIPANTS, JSON.stringify(person), user.id, ROOM_TTL_SECONDS));
            if (joined.startsWith('ERR:')) {
                const reason = joined.slice(4);
                const map = { ROOM_NOT_FOUND: 'This room expired or is no longer available.', ROOM_STARTED: 'This room has already started. Rejoining is disabled.', ROOM_FULL: 'This room has reached the 50-participant limit.' };
                return fail(res, reason === 'ROOM_FULL' ? 409 : 404, map[reason] || 'Could not join this room.');
            }
            let saved = joined.startsWith('EXISTING:') ? parseJson(joined.slice(9)) : person;
            if (saved?.status === 'disconnected') return fail(res, 409, 'You have already disconnected from this room and cannot rejoin it.');
            const safe = safeQuestions(await getQuestions(code));
            const attempt = await createAttempt(admin, room, user.id, person.displayName, 'participant', safe);
            saved = { ...saved, attemptId: attempt.id, lastHeartbeat: Date.now(), connected: true };
            await setJson(participantKey, saved);
            return res.status(200).json({ accepted: true, room, attemptId: attempt.id, questions: safe, serverNow: Date.now() });
        }

        if (action === 'start') {
            const script = [
                "local raw = redis.call('GET', KEYS[1])",
                "if not raw then return 'ERR:ROOM_NOT_FOUND' end",
                "local meta = cjson.decode(raw)",
                "if meta.hostUid ~= ARGV[1] then return 'ERR:HOST_ONLY' end",
                "if meta.status == 'waiting' then",
                "  meta.status = 'started'; meta.startedAt = tonumber(ARGV[2]); meta.serverNow = tonumber(ARGV[2])",
                "  meta.deadlineAt = tonumber(ARGV[2]) + tonumber(meta.durationMinutes) * 60000",
                "elseif meta.status ~= 'started' then return 'ERR:ROOM_NOT_WAITING' end",
                "redis.call('SET', KEYS[1], cjson.encode(meta), 'EX', ARGV[3])",
                "return cjson.encode(meta)"
            ].join('\n');
            const started = String(await redis('EVAL', script, 1, keys(code).meta, user.id, Date.now(), ROOM_TTL_SECONDS));
            if (started.startsWith('ERR:')) {
                const reason = started.slice(4);
                return fail(res, reason === 'HOST_ONLY' ? 403 : reason === 'ROOM_NOT_FOUND' ? 404 : 409, ({ HOST_ONLY: 'Only the room host can start this test.', ROOM_NOT_FOUND: 'This room expired or is no longer available.', ROOM_NOT_WAITING: 'This room cannot be started.' })[reason] || 'Could not start the room.');
            }
            const startedRoom = parseJson(started);
            const memberIds = await redis('SMEMBERS', keys(code).members);
            const startIso = new Date(Number(startedRoom.startedAt)).toISOString();
            for (const uid of Array.isArray(memberIds) ? memberIds : []) {
                const p = await getParticipant(code, uid);
                if (!p?.attemptId) continue;
                const { error } = await admin.from('exam_attempts').update({ status: 'in_progress', started_at: startIso, updated_at: new Date().toISOString() }).eq('id', p.attemptId).eq('user_id', uid).eq('status', 'waiting');
                if (error) throw new Error(error.message);
                if (p.status === 'waiting') await patchParticipant(code, uid, { status: 'connected', connected: true, lastHeartbeat: Date.now() }).catch(() => {});
            }
            return res.status(200).json({ startedAt: Number(startedRoom.startedAt), serverNow: Date.now(), deadlineAt: Number(startedRoom.deadlineAt), room: startedRoom });
        }

        if (action === 'heartbeat') {
            await reconcileRoom(admin, code);
            const p = await getParticipant(code, user.id);
            if (!p || p.status === 'disconnected' || p.status === 'submitted') return fail(res, 409, 'This attempt is no longer active. Rejoining is disabled.');
            if (room.status === 'started' && Number(room.deadlineAt) > 0 && Date.now() >= Number(room.deadlineAt)) {
                return res.status(200).json({ active: false, ...await finalizeAttempt(admin, { code, uid: user.id, status: 'timed_out', reason: 'timer_expired' }) });
            }
            await patchParticipant(code, user.id, { lastHeartbeat: Date.now(), connected: true });
            return res.status(200).json({ active: true, serverNow: Date.now(), deadlineAt: room.deadlineAt });
        }

        if (action === 'save_answer') {
            await reconcileRoom(admin, code);
            const currentRoom = await getRoom(code);
            const p = await getParticipant(code, user.id);
            if (!currentRoom || currentRoom.status !== 'started') return fail(res, 409, 'The test is not active.');
            if (!p || p.status === 'disconnected' || p.status === 'submitted') return fail(res, 409, 'This attempt is no longer active. Rejoining is disabled.');
            if (Date.now() >= Number(currentRoom.deadlineAt)) {
                return res.status(200).json({ active: false, ...await finalizeAttempt(admin, { code, uid: user.id, status: 'timed_out', reason: 'timer_expired', submittedAnswers: body.answers }) });
            }
            const questions = await getQuestions(code);
            const answers = normalizeAnswers(body.answers, questions?.length || 30);
            const script = [
                "local raw = redis.call('GET', KEYS[1])",
                "if not raw then return 'ERR:PARTICIPANT_NOT_FOUND' end",
                "local p = cjson.decode(raw)",
                "if p.status == 'disconnected' or p.status == 'submitted' then return 'ERR:ATTEMPT_CLOSED' end",
                "local revision = tonumber(ARGV[2])",
                "if not p.answerRevision or revision >= tonumber(p.answerRevision) then p.answers = cjson.decode(ARGV[1]); p.answerRevision = revision end",
                "p.lastHeartbeat = tonumber(ARGV[3]); p.connected = true",
                "redis.call('SET', KEYS[1], cjson.encode(p), 'EX', ARGV[4])",
                "return cjson.encode(p)"
            ].join('\n');
            const result = String(await redis('EVAL', script, 1, keys(code, user.id).participant, JSON.stringify(answers), Number(body.revision) || Date.now(), Date.now(), ROOM_TTL_SECONDS));
            if (result.startsWith('ERR:')) return fail(res, 409, 'This attempt is no longer active.');
            const saved = parseJson(result);
            await writeAnswers(admin, p.attemptId, user.id, normalizeAnswers(saved?.answers || answers, questions?.length || 30));
            return res.status(200).json({ ok: true, savedAt: Date.now() });
        }

        if (['submit', 'disconnect', 'mark_disconnected'].includes(action)) {
            let targetUid = user.id;
            let reason = action === 'submit' ? 'manual_submit' : action === 'mark_disconnected' ? 'participant_connection_lost' : 'connection_lost';
            if (action === 'mark_disconnected') {
                if (user.id !== room.hostUid) return fail(res, 403, 'Only the host can finalize a disconnected participant.');
                targetUid = String(body.targetUid || '');
                if (!targetUid || targetUid === user.id) return fail(res, 400, 'Invalid participant.');
            }
            const p = await getParticipant(code, targetUid);
            if (!p) return fail(res, 404, 'Participant attempt not found.');
            if (room.status !== 'started') return fail(res, 409, 'The test has not started.');
            const timedOut = Number(room.deadlineAt) > 0 && Date.now() >= Number(room.deadlineAt);
            const status = action === 'submit' ? (timedOut ? 'timed_out' : 'submitted') : 'disconnected';
            if (timedOut) reason = 'timer_expired';
            const inputAnswers = targetUid === user.id ? body.answers : null;
            if (Array.isArray(inputAnswers)) await patchParticipant(code, targetUid, { answers: normalizeAnswers(inputAnswers), lastHeartbeat: Date.now() }).catch(() => {});
            const finalized = await finalizeAttempt(admin, { code, uid: targetUid, status, reason, submittedAnswers: inputAnswers });
            if (!finalized.ok) return fail(res, 409, finalized.error || 'Could not finalize the attempt.');
            return res.status(200).json(finalized);
        }
        return fail(res, 400, 'Unknown Test Room action.');
    } catch (error) {
        const message = String(error?.message || 'Test Room operation failed.');
        const unavailable = /redis|upstash|fetch failed|credentials|supabase server/i.test(message);
        return fail(res, unavailable ? 503 : 500, message);
    }
}
