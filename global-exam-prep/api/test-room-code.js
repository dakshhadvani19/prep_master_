import { createClient } from '@supabase/supabase-js';
import { randomInt } from 'node:crypto';

const process = globalThis.process;
const ROOM_CODE_LENGTH = 10;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PRESENCE_CHECK_TIMEOUT_MS = 2200;

function supabaseUrl() {
    return String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
}

function secretKey() {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (process.env.SUPABASE_SECRET_KEY) return process.env.SUPABASE_SECRET_KEY;
    try {
        const keys = JSON.parse(process.env.SUPABASE_SECRET_KEYS || '{}');
        return keys.default || '';
    } catch {
        return '';
    }
}

function normalizeCode(value) {
    const normalized = String(value ?? '').trim().toUpperCase().replace(/[\s-]/g, '');
    const alphabetPattern = new RegExp('^[' + ROOM_CODE_ALPHABET + ']{' + ROOM_CODE_LENGTH + '}$');
    return alphabetPattern.test(normalized) ? normalized : null;
}

function generateCode() {
    let code = '';
    for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
        code += ROOM_CODE_ALPHABET[randomInt(0, ROOM_CODE_ALPHABET.length)];
    }
    return code;
}

function getSupabaseAdmin() {
    const url = supabaseUrl();
    const key = secretKey();
    if (!url || !key) return null;

    return createClient(url, key, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
        },
        realtime: {
            params: { apikey: key },
        },
    });
}

/**
 * Reads the host's Presence payload from a public, unguessably named Realtime
 * channel. No room metadata or code is written to Postgres. A code is valid only
 * while the matching host presence is online.
 */
async function inspectActiveRoom(client, code) {
    return new Promise((resolve) => {
        let finished = false;
        let channel = null;
        let timeoutId = null;

        const finish = (result) => {
            if (finished) return;
            finished = true;
            if (timeoutId) clearTimeout(timeoutId);
            if (channel) {
                Promise.resolve(client.removeChannel(channel)).catch(() => {});
            }
            resolve(result);
        };

        timeoutId = setTimeout(
            () => finish({ unavailable: false, room: null }),
            PRESENCE_CHECK_TIMEOUT_MS,
        );

        try {
            channel = client.channel('test-room:' + code, {
                config: {
                    presence: { key: 'server-room-verifier-' + randomInt(100000, 999999) },
                    broadcast: { self: false },
                },
            });

            channel.on('presence', { event: 'sync' }, () => {
                const allPresence = Object.values(channel.presenceState()).flat();
                const host = allPresence.find((presence) => (
                    presence
                    && presence.role === 'host'
                    && presence.roomCode === code
                    && typeof presence.hostUid === 'string'
                    && ['waiting', 'started'].includes(presence.status)
                ));

                // Presence can emit an initial empty snapshot while membership converges.
                // Keep listening until the timeout before deciding the code is invalid.
                if (!host) return;

                // Only allowlisted metadata is returned; question payloads and answers
                // must never travel through this verification endpoint.
                finish({
                    unavailable: false,
                    room: {
                        roomCode: code,
                        hostUid: host.hostUid,
                        hostName: String(host.hostName || 'Host').slice(0, 80),
                        subjectName: String(host.subjectName || 'MCQ Exam').slice(0, 160),
                        examTitle: String(host.examTitle || 'MCQ Exam').slice(0, 100),
                        difficulty: ['easy', 'medium', 'hard'].includes(host.difficulty)
                            ? host.difficulty
                            : 'medium',
                        durationMinutes: Number.isInteger(host.durationMinutes)
                            ? Math.min(180, Math.max(1, host.durationMinutes))
                            : 30,
                        status: host.status,
                        serverNow: Number.isFinite(Number(host.serverNow)) ? Number(host.serverNow) : Date.now(),
                        startedAt: host.startedAt == null || !Number.isFinite(Number(host.startedAt))
                            ? null
                            : Number(host.startedAt),
                        questionCount: Number.isInteger(host.questionCount)
                            ? Math.min(30, Math.max(1, host.questionCount))
                            : 30,
                        participantLimit: 50,
                    },
                });
            });

            channel.subscribe((status) => {
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    finish({ unavailable: true, room: null });
                }
            });
        } catch {
            finish({ unavailable: true, room: null });
        }
    });
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = req.body || {};
    const action = String(body.action || '');
    if (!['create', 'verify', 'start'].includes(action)) {
        return res.status(400).json({ error: 'Unsupported action.' });
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
        return res.status(503).json({
            error: 'Test Rooms are not configured on this deployment. Check server-side Supabase URL and secret-key environment variables.',
        });
    }

    const authorization = String(req.headers?.authorization || '');
    const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!bearer) return res.status(401).json({ error: 'Sign in to use Test Rooms.' });

    let user;
    try {
        const { data, error } = await admin.auth.getUser(bearer);
        if (error || !data?.user?.id) {
            return res.status(401).json({ error: 'Your session is invalid or expired. Sign in again.' });
        }
        user = data.user;
    } catch {
        return res.status(503).json({ error: 'Could not verify your session right now. Please retry.' });
    }

    if (action === 'create') {
        // The generated code is never written to a table or serverless memory.
        return res.status(200).json({
            code: generateCode(),
            generatedBy: 'backend',
            expiresWhenHostDisconnects: true,
        });
    }

    const code = normalizeCode(body.code);
    if (!code) {
        return res.status(400).json({ valid: false, error: 'Enter a valid 10-character room code.' });
    }

    const inspected = await inspectActiveRoom(admin, code);
    if (inspected.unavailable) {
        return res.status(503).json({
            valid: false,
            error: 'Could not verify the live room right now. Please retry in a moment.',
        });
    }
    if (!inspected.room) {
        return res.status(404).json({
            valid: false,
            error: 'No active room was found for that code. Check it and try again.',
        });
    }
    if (action === 'start') {
        if (inspected.room.hostUid !== user.id) {
            return res.status(403).json({ error: 'Only the room host can start this test.' });
        }
        if (inspected.room.status !== 'waiting') {
            return res.status(409).json({ error: 'This room has already started.' });
        }
        // Authoritative timestamp from the backend. It is shared through host Presence,
        // but is never persisted to a database table.
        const serverNow = Date.now();
        return res.status(200).json({ startedAt: serverNow, serverNow });
    }

    if (inspected.room.status !== 'waiting') {
        return res.status(409).json({
            valid: true,
            joinable: false,
            status: inspected.room.status,
            room: inspected.room,
            error: 'This room has already started and is no longer accepting participants.',
        });
    }

    return res.status(200).json({
        valid: true,
        joinable: true,
        serverNow: Date.now(),
        room: inspected.room,
    });
}
