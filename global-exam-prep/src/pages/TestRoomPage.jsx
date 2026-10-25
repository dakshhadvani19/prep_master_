import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
    AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, Clipboard,
    Clock3, DoorOpen, GraduationCap, LoaderCircle, LockKeyhole, Play,
    ShieldCheck, Sparkles, Users, XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { requireSupabase } from '../supabase';
import {
    buildCanonicalRoomQuestions,
    makeSafeRoomQuestions,
    scoreRoomAnswers,
    shuffleRoomQuestions,
    toCanonicalAnswerArray,
} from '../utils/testRoomShuffle';

const MAX_PARTICIPANTS = 50;
const TIMER_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180];

function normalizedCode(value) {
    return String(value || '').toUpperCase().replace(/[\s-]/g, '');
}

function formattedCode(value) {
    const code = normalizedCode(value);
    return code.length === 10 ? code.slice(0, 5) + '-' + code.slice(5) : code;
}

function uniqueParticipants(channel) {
    if (!channel) return [];
    const all = Object.values(channel.presenceState()).flat();
    const byUserId = new Map();
    all.forEach((presence) => {
        if (!presence?.userId) return;
        const previous = byUserId.get(presence.userId);
        if (!previous || presence.role === 'host') byUserId.set(presence.userId, presence);
    });
    return [...byUserId.values()].sort((a, b) => {
        if (a.role === 'host' && b.role !== 'host') return -1;
        if (b.role === 'host' && a.role !== 'host') return 1;
        return String(a.joinedAt || '').localeCompare(String(b.joinedAt || ''));
    });
}

async function callRoomApi(payload) {
    const supabase = requireSupabase();
    const { data, error } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token;
    if (error || !accessToken) throw new Error('Sign in again before using Test Rooms.');

    const response = await fetch('/api/test-room-code', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + accessToken,
        },
        body: JSON.stringify(payload),
    });

    let body = null;
    try {
        body = await response.json();
    } catch {
        throw new Error('The Test Room service returned an unreadable response.');
    }
    if (!response.ok) throw new Error(body?.error || 'The Test Room request failed.');
    return body;
}

function roomButtonStyle(variant = 'primary', disabled = false) {
    const common = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.55rem',
        padding: '0.85rem 1.15rem',
        borderRadius: 'var(--radius-full)',
        fontWeight: 700,
        fontSize: '0.93rem',
        transition: 'transform 0.16s ease, opacity 0.16s ease, border-color 0.16s ease',
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        width: '100%',
    };
    if (variant === 'secondary') {
        return {
            ...common,
            border: '1px solid var(--border-color)',
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
        };
    }
    if (variant === 'success') {
        return {
            ...common,
            background: 'linear-gradient(135deg,#059669,#10b981)',
            color: 'white',
            boxShadow: '0 7px 22px rgba(16,185,129,0.2)',
        };
    }
    return {
        ...common,
        background: 'var(--accent-gradient)',
        color: 'white',
        boxShadow: 'var(--shadow-glow)',
    };
}

export default function TestRoomPage() {
    const { roomCode: routeCode } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { currentUser } = useAuth();

    const createPayload = location.state?.testRoomMode === 'create' && Array.isArray(location.state?.questions)
        ? location.state
        : null;
    const isHostFlow = !routeCode && Boolean(createPayload);
    const userId = currentUser?.uid || currentUser?.id || '';
    const displayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Student';

    const [canonicalQuestions, setCanonicalQuestions] = useState(
        () => isHostFlow ? buildCanonicalRoomQuestions(createPayload.questions) : [],
    );
    const [displayQuestions, setDisplayQuestions] = useState([]);
    const [roomCode, setRoomCode] = useState('');
    const [roomMeta, setRoomMeta] = useState(null);
    const [participants, setParticipants] = useState([]);
    const [view, setView] = useState(routeCode ? 'connecting' : (createPayload ? 'setup' : 'join'));
    const [joinCodeInput, setJoinCodeInput] = useState('');
    const [durationMinutes, setDurationMinutes] = useState(
        Number(createPayload?.timeMinutes) || 45,
    );
    const [working, setWorking] = useState(false);
    const [connected, setConnected] = useState(false);
    const [verifiedJoin, setVerifiedJoin] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState({});
    const [timeLeft, setTimeLeft] = useState(0);
    const [scoreResult, setScoreResult] = useState(null);
    const [results, setResults] = useState({});
    const [submissionPending, setSubmissionPending] = useState(false);

    const channelRef = useRef(null);
    const canonicalQuestionsRef = useRef(canonicalQuestions);
    const roomMetaRef = useRef(roomMeta);
    const participantsRef = useRef(participants);
    const reservedUsersRef = useRef(new Set());
    const hostSeenRef = useRef(false);
    const submittedRef = useRef(false);
    const serverClockOffsetRef = useRef(0);
    const startingRoomRef = useRef(false);
    const submitHandlerRef = useRef(null);
    const latestViewRef = useRef(view);

    useEffect(() => { canonicalQuestionsRef.current = canonicalQuestions; }, [canonicalQuestions]);
    useEffect(() => { roomMetaRef.current = roomMeta; }, [roomMeta]);
    useEffect(() => { participantsRef.current = participants; }, [participants]);
    useEffect(() => { latestViewRef.current = view; }, [view]);

    useEffect(() => {
        if (!canonicalQuestions.length) {
            setDisplayQuestions([]);
            return;
        }
        setDisplayQuestions(shuffleRoomQuestions(canonicalQuestions));
        setCurrentQuestionIndex(0);
        setAnswers({});
        submittedRef.current = false;
        setScoreResult(null);
        setSubmissionPending(false);
    }, [canonicalQuestions]);

    // The user-entered code is checked server-side against live Realtime Presence.
    // The host's presence contains the temporary session summary; no room row is created.
    useEffect(() => {
        if (!routeCode || !userId) return undefined;
        let cancelled = false;

        (async () => {
            setView('connecting');
            setError('');
            try {
                const response = await callRoomApi({ action: 'verify', code: routeCode });
                if (cancelled) return;
                if (!response.valid || !response.joinable || !response.room) {
                    throw new Error(response.error || 'This room is not accepting participants.');
                }
                if (Number.isFinite(Number(response.serverNow))) {
                    serverClockOffsetRef.current = Number(response.serverNow) - Date.now();
                }
                roomMetaRef.current = response.room;
                setRoomMeta(response.room);
                setRoomCode(response.room.roomCode || normalizedCode(routeCode));
                setVerifiedJoin(true);
            } catch (err) {
                if (cancelled) return;
                setError(err.message || 'Could not verify this room.');
                setView('error');
            }
        })();

        return () => { cancelled = true; };
    }, [routeCode, userId]);

    // A single Realtime channel holds only live Presence/Broadcast state. Unmounting
    // closes this browser's connection; the session is intentionally not durable.
    useEffect(() => {
        if (!roomCode || !userId || (!isHostFlow && !verifiedJoin)) return undefined;

        let cancelled = false;
        const supabase = requireSupabase();
        let joinTimeout = null;
        const channel = supabase.channel('test-room:' + normalizedCode(roomCode), {
            config: {
                presence: { key: userId },
                broadcast: { self: false, ack: true },
            },
        });
        channelRef.current = channel;

        const send = (event, payload) => channel.send({
            type: 'broadcast',
            event,
            payload,
        });

        channel.on('presence', { event: 'sync' }, () => {
            const liveParticipants = uniqueParticipants(channel);
            const liveIds = new Set(liveParticipants.map((person) => person.userId));
            for (const reservedId of reservedUsersRef.current) {
                if (liveIds.has(reservedId)) reservedUsersRef.current.delete(reservedId);
            }
            setParticipants(liveParticipants);
            participantsRef.current = liveParticipants;

            const host = liveParticipants.find((person) => (
                person.role === 'host' && person.roomCode === normalizedCode(roomCode)
            ));
            if (host) {
                if (Number.isFinite(Number(host.serverNow))) {
                    serverClockOffsetRef.current = Number(host.serverNow) - Date.now();
                }
                hostSeenRef.current = true;
                roomMetaRef.current = host;
                setRoomMeta(host);
                if (host.status === 'started' && canonicalQuestionsRef.current.length > 0) {
                    setView((previous) => (
                        previous === 'result' || previous === 'submitting' ? previous : 'attempt'
                    ));
                }
                if (host.status === 'finished') setView('finished');
            } else if (!isHostFlow && hostSeenRef.current) {
                setError('The host disconnected. This temporary room is no longer available.');
                setConnected(false);
                setView('error');
            }
        });

        // The host serially accepts join requests in its own event loop and reserves
        // a slot before replying, which avoids overbooking from simultaneous clicks.
        channel.on('broadcast', { event: 'join_request' }, async ({ payload }) => {
            if (!isHostFlow) return;
            const requestingUid = String(payload?.userId || '');
            if (!requestingUid || requestingUid === userId) return;

            const meta = roomMetaRef.current;
            const live = uniqueParticipants(channel);
            const knownIds = new Set([
                ...live.map((person) => person.userId),
                ...reservedUsersRef.current,
            ]);
            if (startingRoomRef.current || meta?.status !== 'waiting') {
                await send('join_response', {
                    toUid: requestingUid,
                    accepted: false,
                    reason: startingRoomRef.current ? 'The host is starting the test now.' : 'This room has already started.',
                });
                return;
            }
            if (knownIds.has(requestingUid)) {
                await send('join_response', {
                    toUid: requestingUid,
                    accepted: true,
                    room: meta,
                });
                return;
            }
            if (knownIds.size >= MAX_PARTICIPANTS) {
                await send('join_response', {
                    toUid: requestingUid,
                    accepted: false,
                    reason: 'This room has reached the 50-participant limit.',
                });
                return;
            }

            reservedUsersRef.current.add(requestingUid);
            await send('join_response', {
                toUid: requestingUid,
                accepted: true,
                room: meta,
            });
        });

        channel.on('broadcast', { event: 'join_response' }, async ({ payload }) => {
            if (isHostFlow || payload?.toUid !== userId) return;
            if (joinTimeout) clearTimeout(joinTimeout);
            if (!payload.accepted) {
                setError(payload.reason || 'The host could not admit you to this room.');
                setView('error');
                return;
            }

            const participantPresence = {
                role: 'participant',
                roomCode: normalizedCode(roomCode),
                userId,
                displayName: String(displayName).slice(0, 80),
                joinedAt: new Date().toISOString(),
            };
            try {
                await channel.track(participantPresence);
                if (cancelled) return;
                setConnected(true);
                setView('lobby');
                await send('request_exam', { toUid: roomMetaRef.current?.hostUid });
            } catch {
                setError('Could not join the live room. Please try entering the code again.');
                setView('error');
            }
        });

        channel.on('broadcast', { event: 'request_exam' }, async ({ payload }) => {
            if (!isHostFlow || !payload?.toUid) return;
            const safeQuestions = makeSafeRoomQuestions(canonicalQuestionsRef.current);
            await send('exam_payload', {
                toUid: payload.toUid,
                questions: safeQuestions,
            });
        });

        channel.on('broadcast', { event: 'exam_payload' }, ({ payload }) => {
            if (isHostFlow || payload?.toUid !== userId || !Array.isArray(payload.questions)) return;
            setCanonicalQuestions(buildCanonicalRoomQuestions(payload.questions));
        });

        channel.on('broadcast', { event: 'room_submission' }, async ({ payload }) => {
            if (!isHostFlow || !payload?.userId || !Array.isArray(payload.answers)) return;
            const submittedUid = String(payload.userId);
            const roster = participantsRef.current;
            if (!roster.some((person) => person.userId === submittedUid)) return;

            const result = scoreRoomAnswers(canonicalQuestionsRef.current, payload.answers);
            setResults((previous) => ({
                ...previous,
                [submittedUid]: {
                    userId: submittedUid,
                    displayName: roster.find((person) => person.userId === submittedUid)?.displayName || 'Participant',
                    ...result,
                },
            }));
            await send('room_result', { toUid: submittedUid, result });
        });

        channel.on('broadcast', { event: 'room_result' }, ({ payload }) => {
            if (payload?.toUid !== userId || !payload.result) return;
            setScoreResult(payload.result);
            setSubmissionPending(false);
            setView('result');
        });

        channel.subscribe(async (status) => {
            if (cancelled) return;
            if (status === 'SUBSCRIBED') {
                if (isHostFlow) {
                    const hostPresence = roomMetaRef.current;
                    if (!hostPresence) {
                        setError('The room setup expired. Return to the subject and create the room again.');
                        setView('error');
                        return;
                    }
                    try {
                        await channel.track(hostPresence);
                        if (cancelled) return;
                        setConnected(true);
                        setView((previous) => previous === 'setup' ? 'share' : previous);
                    } catch {
                        setError('Could not activate the temporary room. Please try again.');
                        setView('error');
                    }
                } else {
                    await send('join_request', {
                        userId,
                        displayName: String(displayName).slice(0, 80),
                    });
                    joinTimeout = setTimeout(() => {
                        if (cancelled || latestViewRef.current !== 'connecting') return;
                        setError('The host is no longer reachable. Ask them to reopen the room and share a new code.');
                        setView('error');
                    }, 6000);
                }
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                setError('The live room connection failed. Check your connection and retry.');
                setView('error');
            }
        });

        return () => {
            cancelled = true;
            if (joinTimeout) clearTimeout(joinTimeout);
            if (channelRef.current === channel) channelRef.current = null;
            Promise.resolve(supabase.removeChannel(channel)).catch(() => {});
        };
    }, [roomCode, userId, displayName, isHostFlow, verifiedJoin]);

    const createRoom = async () => {
        if (!isHostFlow || !canonicalQuestions.length) {
            setError('The generated MCQ set is missing. Return to exam setup and generate it again.');
            return;
        }
        if (canonicalQuestions.length !== 30 || canonicalQuestions.some((question) => (
            !question.text.trim() || question.options.length !== 4 || !Number.isInteger(question.answer)
            || question.answer < 0 || question.answer > 3
        ))) {
            setError('This question set is not a valid four-option MCQ exam.');
            return;
        }
        setWorking(true);
        setError('');
        try {
            const response = await callRoomApi({ action: 'create' });
            const meta = {
                role: 'host',
                roomCode: response.code,
                userId,
                hostUid: userId,
                hostName: String(displayName).slice(0, 80),
                displayName: String(displayName).slice(0, 80),
                subjectName: String(createPayload?.subjectName || 'MCQ Exam').slice(0, 160),
                examTitle: String(createPayload?.examTitle || 'MCQ Exam').slice(0, 100),
                difficulty: ['easy', 'medium', 'hard'].includes(createPayload?.difficulty)
                    ? createPayload.difficulty
                    : 'medium',
                durationMinutes: Math.min(180, Math.max(1, Number(durationMinutes) || 45)),
                status: 'waiting',
                startedAt: null,
                questionCount: canonicalQuestions.length,
                participantLimit: MAX_PARTICIPANTS,
                createdAt: new Date().toISOString(),
            };
            roomMetaRef.current = meta;
            setRoomMeta(meta);
            setRoomCode(response.code);
            setView('share');
        } catch (err) {
            setError(err.message || 'Could not create a Test Room.');
        } finally {
            setWorking(false);
        }
    };

    const enterLobby = () => {
        if (!connected) {
            setError('The room is still connecting. Wait until it is ready.');
            return;
        }
        setView('lobby');
    };

    const startRoom = async () => {
        if (!isHostFlow || !channelRef.current || roomMetaRef.current?.status !== 'waiting' || working) return;
        setWorking(true);
        setError('');
        const previous = roomMetaRef.current;
        try {
            const startResponse = await callRoomApi({ action: 'start', code: roomCode });
            const next = {
                ...previous,
                status: 'started',
                startedAt: Number(startResponse.startedAt),
                serverNow: Number(startResponse.serverNow),
            };
            await channelRef.current.track(next);
            roomMetaRef.current = next;
            setRoomMeta(next);
            setView('attempt');
        } catch (err) {
            // Keep the lobby in the waiting state if the Realtime start update fails.
            roomMetaRef.current = previous;
            setRoomMeta(previous);
            startingRoomRef.current = false;
            setError(err.message || 'Could not start the room. No timer was started.');
        } finally {
            setWorking(false);
        }
    };

    const handleSubmit = useCallback(async () => {
        if (submittedRef.current || !canonicalQuestionsRef.current.length) return;
        submittedRef.current = true;
        const canonicalAnswers = toCanonicalAnswerArray(
            answers,
            canonicalQuestionsRef.current.length,
        );
        setSubmissionPending(!isHostFlow);
        setView(isHostFlow ? 'result' : 'submitting');

        if (isHostFlow) {
            setScoreResult(scoreRoomAnswers(canonicalQuestionsRef.current, canonicalAnswers));
        }
        try {
            await channelRef.current?.send({
                type: 'broadcast',
                event: 'room_submission',
                payload: { userId, answers: canonicalAnswers },
            });
        } catch {
            if (!isHostFlow) {
                setError('Your answers could not be sent to the host. Keep this page open and retry your connection.');
                setView('error');
            }
        }
    }, [answers, isHostFlow, userId]);

    useEffect(() => { submitHandlerRef.current = handleSubmit; }, [handleSubmit]);

    useEffect(() => {
        if (roomMeta?.status !== 'started' || !roomMeta.startedAt || view !== 'attempt') return undefined;
        const updateRemaining = () => {
            const deadline = Number(roomMeta.startedAt) + Number(roomMeta.durationMinutes) * 60 * 1000;
            const serverAdjustedNow = Date.now() + serverClockOffsetRef.current;
            const remaining = Math.max(0, Math.ceil((deadline - serverAdjustedNow) / 1000));
            setTimeLeft(remaining);
            if (remaining === 0) submitHandlerRef.current?.();
        };
        updateRemaining();
        const timer = setInterval(updateRemaining, 1000);
        return () => clearInterval(timer);
    }, [roomMeta?.status, roomMeta?.startedAt, roomMeta?.durationMinutes, view]);

    const copyRoomCode = async () => {
        try {
            await navigator.clipboard.writeText(formattedCode(roomCode));
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            setError('Clipboard access was blocked. Select and copy the code manually.');
        }
    };

    const currentQuestion = displayQuestions[currentQuestionIndex];
    const participantCount = participants.length;
    const timeLabel = useMemo(() => {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
    }, [timeLeft]);

    if (!userId) {
        return (
            <div className="container" style={{ maxWidth: 680, marginTop: '3rem' }}>
                <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
                    <LockKeyhole size={32} style={{ margin: '0 auto 1rem', color: 'var(--accent-primary)' }} />
                    <h2 style={{ marginBottom: '0.75rem' }}>Sign in to use Test Rooms</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>Room codes and participant presence are available only to signed-in students.</p>
                    <button style={roomButtonStyle()} onClick={() => navigate('/signup?mode=login', { state: { from: location } })}>Sign in</button>
                </div>
            </div>
        );
    }

    if (view === 'join' && !routeCode && !isHostFlow) {
        const normalized = normalizedCode(joinCodeInput);
        const codeLooksValid = /^[A-HJ-NP-Z2-9]{10}$/.test(normalized);
        return (
            <div className="container animate-fade-in" style={{ maxWidth: 720, marginTop: '3rem', marginBottom: '4rem' }}>
                <button onClick={() => navigate(-1)} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                    <ArrowLeft size={17} /> Back
                </button>
                <div className="glass-panel" style={{ padding: 'clamp(1.5rem,4vw,2.5rem)' }}>
                    <div style={{ width: 58, height: 58, borderRadius: 17, background: 'rgba(141,123,255,0.15)', color: '#b9adff', display: 'grid', placeItems: 'center', marginBottom: '1rem' }}>
                        <Users size={27} />
                    </div>
                    <h1 style={{ fontSize: '1.8rem', marginBottom: '0.65rem' }}>Join a Test Room</h1>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.65 }}>
                        Enter the 10-character code shared by the host. The backend will check that the temporary room is active before you join.
                    </p>
                    <label htmlFor="test-room-code" style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.55rem' }}>Room code</label>
                    <input
                        id="test-room-code"
                        autoComplete="off"
                        spellCheck={false}
                        value={joinCodeInput}
                        onChange={(event) => setJoinCodeInput(normalizedCode(event.target.value).slice(0, 10))}
                        onKeyDown={(event) => { if (event.key === 'Enter' && codeLooksValid) navigate('/test-rooms/' + normalizedCode(joinCodeInput)); }}
                        placeholder="e.g. 7KMR2QXNA8"
                        aria-describedby="room-code-hint"
                        style={{ width: '100%', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.9rem 1rem', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', font: 'inherit', fontSize: '1.1rem', letterSpacing: '0.1em', marginBottom: '0.6rem' }}
                    />
                    <p id="room-code-hint" style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', marginBottom: '1.3rem' }}>Letters I/O and digits 0/1 are excluded to make codes easier to read.</p>
                    {error && <p role="alert" style={{ color: '#fca5a5', fontSize: '0.88rem', marginBottom: '1rem' }}>{error}</p>}
                    <button disabled={!codeLooksValid} onClick={() => navigate('/test-rooms/' + normalizedCode(joinCodeInput))} style={roomButtonStyle('primary', !codeLooksValid)}>
                        <DoorOpen size={18} /> Check Code &amp; Join
                    </button>
                    <p style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem', lineHeight: 1.55, marginTop: '1rem' }}>
                        Only currently active rooms can be joined. Closing the host's room ends its code; no room session is stored in a database table.
                    </p>
                </div>
            </div>
        );
    }

    if (!isHostFlow && !routeCode) {
        return (
            <div className="container" style={{ maxWidth: 680, marginTop: '3rem' }}>
                <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
                    <AlertCircle size={32} style={{ margin: '0 auto 1rem', color: 'var(--warning)' }} />
                    <h2 style={{ marginBottom: '0.75rem' }}>Room setup expired</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>The generated exam and room setup are held temporarily in this browser session. Return to the subject page and create the room again.</p>
                    <button style={roomButtonStyle()} onClick={() => navigate(-1)}>Return to exam setup</button>
                </div>
            </div>
        );
    }

    if (view === 'connecting') {
        return (
            <div className="container" style={{ maxWidth: 680, marginTop: '4rem' }}>
                <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center' }}>
                    <LoaderCircle size={34} className="spin" style={{ margin: '0 auto 1rem', color: 'var(--accent-primary)' }} />
                    <h2 style={{ marginBottom: '0.75rem' }}>Checking room code</h2>
                    <p style={{ color: 'var(--text-secondary)' }}>The backend is checking whether the host's temporary room is active.</p>
                </div>
            </div>
        );
    }

    if (view === 'error' || (error && !roomCode)) {
        return (
            <div className="container" style={{ maxWidth: 720, marginTop: '3rem' }}>
                <div className="glass-panel" style={{ padding: '2rem', borderColor: 'rgba(239,68,68,0.25)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', color: '#fca5a5' }}>
                        <AlertCircle size={25} />
                        <h2 style={{ fontSize: '1.35rem' }}>Test Room unavailable</h2>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>{error || 'The live room is no longer available.'}</p>
                    <button style={roomButtonStyle('secondary')} onClick={() => navigate(-1)}><ArrowLeft size={17} /> Go back</button>
                </div>
            </div>
        );
    }

    if (view === 'setup') {
        return (
            <div className="container animate-fade-in" style={{ maxWidth: 780, marginTop: '2rem', marginBottom: '4rem' }}>
                <button onClick={() => navigate(-1)} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                    <ArrowLeft size={17} /> Back
                </button>
                <div className="glass-panel" style={{ padding: 'clamp(1.4rem,4vw,2.5rem)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', marginBottom: '1.5rem' }}>
                        <div style={{ width: 54, height: 54, borderRadius: 16, display: 'grid', placeItems: 'center', background: 'var(--accent-light)', color: 'var(--accent-primary)' }}>
                            <Users size={27} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: '1.7rem' }}>Create a Test Room</h1>
                            <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Set a shared timer before opening the lobby.</p>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '0.85rem', marginBottom: '1.5rem' }}>
                        <div style={{ padding: '1rem', borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)' }}>
                            <GraduationCap size={20} color="var(--accent-primary)" />
                            <div style={{ fontWeight: 700, marginTop: '0.5rem' }}>{createPayload?.subjectName || 'MCQ exam'}</div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{createPayload?.examTitle || 'MCQ exam'} · {canonicalQuestions.length} questions</div>
                        </div>
                        <div style={{ padding: '1rem', borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)' }}>
                            <ShieldCheck size={20} color="var(--success)" />
                            <div style={{ fontWeight: 700, marginTop: '0.5rem' }}>Maximum 50 participants</div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>You are counted as one participant.</div>
                        </div>
                    </div>

                    <label htmlFor="room-duration" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.55rem' }}>Test duration</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                        <select id="room-duration" value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} style={{ padding: '0.8rem 1rem', minWidth: 190, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', font: 'inherit' }}>
                            {TIMER_OPTIONS.map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
                        </select>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>The timer starts once when you press Start Test Room.</span>
                    </div>

                    <div style={{ padding: '1rem', borderRadius: 'var(--radius-md)', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.18)', marginBottom: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6 }}>
                        The join code and room state are temporary. The host must keep this page open; leaving or disconnecting ends the live room.
                    </div>

                    {error && <p style={{ color: '#fca5a5', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</p>}
                    <button disabled={working || !canonicalQuestions.length} onClick={createRoom} style={roomButtonStyle('primary', working || !canonicalQuestions.length)}>
                        {working ? <><LoaderCircle size={18} className="spin" /> Creating room…</> : <><Sparkles size={18} /> Generate Join Code &amp; Create Room</>}
                    </button>
                </div>
            </div>
        );
    }

    if (view === 'share') {
        return (
            <div className="container animate-fade-in" style={{ maxWidth: 760, marginTop: '2.5rem', marginBottom: '4rem' }}>
                <div className="glass-panel" style={{ padding: 'clamp(1.4rem,4vw,2.8rem)', textAlign: 'center' }}>
                    <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ width: 70, height: 70, borderRadius: 22, margin: '0 auto 1.1rem', display: 'grid', placeItems: 'center', background: 'rgba(16,185,129,0.12)', color: 'var(--success)' }}>
                        <CheckCircle2 size={36} />
                    </motion.div>
                    <h1 style={{ fontSize: '1.9rem', marginBottom: '0.65rem' }}>Your room is ready</h1>
                    <p style={{ color: 'var(--text-secondary)', maxWidth: 500, margin: '0 auto 1.6rem' }}>Share this code with the participants. Enter the lobby when you are ready to wait for everyone.</p>

                    <div style={{ border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-xl)', padding: '1.5rem', maxWidth: 500, margin: '0 auto 1.5rem' }}>
                        <div style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.55rem' }}>Room join code</div>
                        <div style={{ fontSize: 'clamp(1.7rem,6vw,2.5rem)', fontWeight: 800, letterSpacing: '0.13em', fontVariantNumeric: 'tabular-nums' }}>{formattedCode(roomCode)}</div>
                        <button onClick={copyRoomCode} style={{ ...roomButtonStyle('secondary'), marginTop: '1.1rem', maxWidth: 220, marginInline: 'auto' }}>
                            {copied ? <><Check size={17} /> Copied</> : <><Clipboard size={17} /> Copy code</>}
                        </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '1.1rem', marginBottom: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><Clock3 size={16} /> {durationMinutes} minutes</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><Users size={16} /> 1 / {MAX_PARTICIPANTS} capacity</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><ShieldCheck size={16} /> Host starts the test</span>
                    </div>

                    {!connected && <p style={{ color: 'var(--warning)', marginBottom: '1rem', fontSize: '0.9rem' }}><LoaderCircle size={15} className="spin" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />Connecting to the live room…</p>}
                    {error && <p style={{ color: '#fca5a5', marginBottom: '1rem' }}>{error}</p>}
                    <button disabled={!connected} onClick={enterLobby} style={roomButtonStyle('success', !connected)}><DoorOpen size={18} /> Enter Test Room</button>
                </div>
            </div>
        );
    }

    if (view === 'lobby') {
        return (
            <div className="container animate-fade-in" style={{ maxWidth: 1000, marginTop: '2rem', marginBottom: '4rem' }}>
                <div className="glass-panel" style={{ padding: 'clamp(1.2rem,3vw,2rem)', marginBottom: '1.2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--success)', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '0.65rem' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', boxShadow: '0 0 10px currentColor' }} /> Live waiting room</div>
                            <h1 style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>{roomMeta?.subjectName || 'Test Room'}</h1>
                            <p style={{ color: 'var(--text-secondary)' }}>{roomMeta?.examTitle || 'MCQ exam'} · <span style={{ textTransform: 'capitalize' }}>{roomMeta?.difficulty || 'medium'}</span> · {roomMeta?.questionCount || canonicalQuestions.length || 30} questions</p>
                        </div>
                        <div style={{ padding: '0.9rem 1rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-tertiary)', minWidth: 180 }}>
                            <div style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Join code</div>
                            <div style={{ fontWeight: 800, fontSize: '1.3rem', letterSpacing: '0.1em', margin: '0.35rem 0' }}>{formattedCode(roomCode)}</div>
                            <button onClick={copyRoomCode} style={{ color: 'var(--accent-primary)', display: 'inline-flex', gap: '0.35rem', alignItems: 'center', fontSize: '0.82rem', fontWeight: 700 }}>{copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? 'Copied' : 'Copy code'}</button>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.25fr) minmax(260px,0.75fr)', gap: '1.2rem', alignItems: 'start' }}>
                    <div className="glass-panel" style={{ padding: '1.35rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
                            <h2 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Users size={20} color="var(--accent-primary)" /> Participants</h2>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: participantCount >= MAX_PARTICIPANTS ? 'var(--danger)' : 'var(--text-secondary)' }}>{participantCount} / {MAX_PARTICIPANTS}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                            <AnimatePresence initial={false}>
                                {participants.map((person, index) => (
                                    <motion.div key={person.userId} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.8rem 0.9rem' }}>
                                        <div style={{ width: 38, height: 38, borderRadius: 13, display: 'grid', placeItems: 'center', flexShrink: 0, background: person.role === 'host' ? 'rgba(245,158,11,0.15)' : 'var(--accent-light)', color: person.role === 'host' ? '#fbbf24' : 'var(--accent-primary)', fontWeight: 800 }}>{String(person.displayName || person.hostName || 'S').trim().charAt(0).toUpperCase()}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{person.displayName || person.hostName || 'Student'}{person.userId === userId ? ' (You)' : ''}</div>
                                            <div style={{ color: 'var(--text-tertiary)', fontSize: '0.76rem' }}>{person.role === 'host' ? 'Created this room' : 'Joined the lobby'}</div>
                                        </div>
                                        {person.role === 'host' && <span style={{ padding: '0.27rem 0.55rem', borderRadius: 'var(--radius-full)', background: 'rgba(245,158,11,0.13)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.23)', fontSize: '0.72rem', fontWeight: 800 }}>Host</span>}
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                            {participants.length === 0 && <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '1.75rem 0' }}>Connecting to participants…</p>}
                        </div>
                    </div>

                    <div className="glass-panel" style={{ padding: '1.35rem' }}>
                        <div style={{ width: 48, height: 48, borderRadius: 15, background: 'rgba(59,130,246,0.12)', color: 'var(--accent-primary)', display: 'grid', placeItems: 'center', marginBottom: '1rem' }}><Clock3 size={24} /></div>
                        <h2 style={{ fontSize: '1.2rem', marginBottom: '0.55rem' }}>Waiting for the host</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.65, marginBottom: '1rem' }}>Everyone stays here until the host starts the test. The shared {roomMeta?.durationMinutes || durationMinutes}-minute timer will begin at the same moment for every participant.</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 0.8rem', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.18)', borderRadius: 'var(--radius-md)', color: '#fbbf24', fontSize: '0.82rem', marginBottom: '1.2rem' }}><Clock3 size={16} /> {roomMeta?.durationMinutes || durationMinutes} minutes · {roomMeta?.questionCount || canonicalQuestions.length || 30} questions</div>
                        {isHostFlow ? (
                            <button disabled={!connected || working || participantCount > MAX_PARTICIPANTS} onClick={startRoom} style={roomButtonStyle('success', !connected || working || participantCount > MAX_PARTICIPANTS)}>{working ? <><LoaderCircle size={18} className="spin" /> Starting…</> : <><Play size={18} /> Start Test Room</>}</button>
                        ) : (
                            <div style={{ ...roomButtonStyle('secondary', true), cursor: 'default', lineHeight: 1.4 }}><LoaderCircle size={17} className="spin" /> Waiting for host to start…</div>
                        )}
                        {error && <p style={{ color: '#fca5a5', marginTop: '0.9rem', fontSize: '0.84rem' }}>{error}</p>}
                    </div>
                </div>
            </div>
        );
    }

    if (view === 'attempt') {
        if (!displayQuestions.length || !currentQuestion) {
            return (
                <div className="container" style={{ maxWidth: 650, marginTop: '4rem' }}>
                    <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
                        <LoaderCircle className="spin" size={30} style={{ color: 'var(--accent-primary)', margin: '0 auto 1rem' }} />
                        <h2 style={{ marginBottom: '0.5rem' }}>Loading the shared exam</h2>
                        <p style={{ color: 'var(--text-secondary)' }}>The host is sharing the question set. Your timer is already synchronized.</p>
                    </div>
                </div>
            );
        }

        return (
            <div className="container animate-fade-in" style={{ maxWidth: 1100, marginTop: '1rem', marginBottom: '3rem' }}>
                <div className="glass-panel" style={{ position: 'sticky', top: 64, zIndex: 50, padding: '0.85rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                    <div style={{ fontWeight: 700 }}>{roomMeta?.examTitle || 'Test Room'} <span style={{ display: 'block', color: 'var(--text-tertiary)', fontSize: '0.77rem', fontWeight: 500 }}>{roomMeta?.subjectName || 'MCQ exam'}</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: timeLeft < 300 ? 'var(--danger)' : 'var(--accent-primary)', fontWeight: 800, fontSize: '1.2rem', fontVariantNumeric: 'tabular-nums' }}><Clock3 size={20} /> {timeLabel}</div>
                    <button disabled={submissionPending || submittedRef.current} onClick={() => submitHandlerRef.current?.()} style={{ ...roomButtonStyle('success', submissionPending || submittedRef.current), width: 'auto', minWidth: 130 }}><CheckCircle2 size={17} /> Submit</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px,0.34fr) minmax(0,1fr)', gap: '1rem', alignItems: 'start' }}>
                    <aside className="glass-panel" style={{ padding: '1rem', position: 'sticky', top: 145 }}>
                        <h2 style={{ fontSize: '0.95rem', marginBottom: '0.85rem', color: 'var(--text-secondary)' }}>Questions</h2>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: '0.4rem' }}>
                            {displayQuestions.map((question, index) => {
                                const isAnswered = answers[question.canonicalIndex] !== undefined;
                                return <button key={question.id + '-' + question.canonicalIndex} onClick={() => setCurrentQuestionIndex(index)} style={{ aspectRatio: '1', borderRadius: 9, border: currentQuestionIndex === index ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)', background: currentQuestionIndex === index ? 'var(--accent-primary)' : isAnswered ? 'rgba(16,185,129,0.14)' : 'var(--bg-tertiary)', color: currentQuestionIndex === index ? 'white' : isAnswered ? 'var(--success)' : 'var(--text-primary)', fontWeight: 800 }}>{index + 1}</button>;
                            })}
                        </div>
                        <div style={{ marginTop: '1rem', color: 'var(--text-tertiary)', fontSize: '0.78rem', lineHeight: 1.6 }}>Answered: {Object.keys(answers).length} / {displayQuestions.length}</div>
                    </aside>

                    <section className="glass-panel" style={{ padding: 'clamp(1.25rem,3vw,2.2rem)', minHeight: 490 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem' }}>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', fontWeight: 700 }}>Question {currentQuestionIndex + 1} of {displayQuestions.length}</span>
                            <span style={{ padding: '0.25rem 0.55rem', borderRadius: 'var(--radius-full)', background: 'var(--accent-light)', color: 'var(--accent-primary)', fontSize: '0.75rem', fontWeight: 800 }}>1 mark</span>
                        </div>
                        <h2 style={{ fontSize: 'clamp(1.15rem,2.4vw,1.55rem)', lineHeight: 1.5, marginBottom: '1.8rem' }}>{currentQuestion.text}</h2>
                        <div style={{ display: 'grid', gap: '0.75rem' }}>
                            {currentQuestion.options.map((option, displayIndex) => {
                                const selected = answers[currentQuestion.canonicalIndex] === option.originalOptionIndex;
                                return (
                                    <button key={option.originalOptionIndex} onClick={() => setAnswers((previous) => ({ ...previous, [currentQuestion.canonicalIndex]: option.originalOptionIndex }))} style={{ padding: '1rem', display: 'flex', gap: '0.85rem', alignItems: 'center', textAlign: 'left', borderRadius: 'var(--radius-md)', border: selected ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)', background: selected ? 'var(--accent-light)' : 'var(--bg-tertiary)', color: 'var(--text-primary)', transition: 'all 0.14s ease' }}>
                                        <span style={{ flexShrink: 0, width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: 10, background: selected ? 'var(--accent-primary)' : 'var(--bg-secondary)', color: selected ? 'white' : 'var(--text-secondary)', fontWeight: 800 }}>{String.fromCharCode(65 + displayIndex)}</span>
                                        <span style={{ flex: 1, lineHeight: 1.5 }}>{option.text}</span>
                                        {selected && <Check size={18} color="var(--accent-primary)" />}
                                    </button>
                                );
                            })}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', marginTop: '2rem' }}>
                            <button disabled={currentQuestionIndex === 0} onClick={() => setCurrentQuestionIndex((previous) => Math.max(0, previous - 1))} style={roomButtonStyle('secondary', currentQuestionIndex === 0)}><ArrowLeft size={17} /> Previous</button>
                            {currentQuestionIndex < displayQuestions.length - 1 ? (
                                <button onClick={() => setCurrentQuestionIndex((previous) => Math.min(displayQuestions.length - 1, previous + 1))} style={roomButtonStyle()}>Next <ArrowRight size={17} /></button>
                            ) : (
                                <button onClick={() => submitHandlerRef.current?.()} style={roomButtonStyle('success')}><CheckCircle2 size={17} /> Submit test</button>
                            )}
                        </div>
                    </section>
                </div>
            </div>
        );
    }

    if (view === 'submitting') {
        return (
            <div className="container" style={{ maxWidth: 680, marginTop: '4rem' }}>
                <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center' }}>
                    <LoaderCircle className="spin" size={34} style={{ color: 'var(--accent-primary)', margin: '0 auto 1rem' }} />
                    <h2 style={{ marginBottom: '0.6rem' }}>Answers submitted</h2>
                    <p style={{ color: 'var(--text-secondary)' }}>Your answers were sent to the host for scoring. Keep this page open while the result is returned.</p>
                </div>
            </div>
        );
    }

    if (view === 'result' || view === 'finished') {
        return (
            <div className="container animate-fade-in" style={{ maxWidth: 850, marginTop: '3rem', marginBottom: '4rem' }}>
                <div className="glass-panel" style={{ padding: 'clamp(1.5rem,4vw,3rem)', textAlign: 'center', marginBottom: '1.2rem' }}>
                    <div style={{ width: 68, height: 68, margin: '0 auto 1rem', borderRadius: 22, background: 'rgba(16,185,129,0.12)', color: 'var(--success)', display: 'grid', placeItems: 'center' }}><CheckCircle2 size={35} /></div>
                    <h1 style={{ fontSize: '1.9rem', marginBottom: '0.55rem' }}>Test submitted</h1>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1.6rem' }}>{roomMeta?.subjectName || 'MCQ exam'} · {roomMeta?.examTitle || 'Test Room'}</p>
                    {scoreResult ? (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                            <div style={{ padding: '1rem 1.4rem', minWidth: 130, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)' }}><div style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>Score</div><div style={{ color: 'var(--accent-primary)', fontWeight: 800, fontSize: '2rem' }}>{scoreResult.points} / {scoreResult.totalQuestions}</div></div>
                            <div style={{ padding: '1rem 1.4rem', minWidth: 100, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)' }}><div style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>Correct</div><div style={{ color: 'var(--success)', fontWeight: 800, fontSize: '1.8rem' }}>{scoreResult.correct}</div></div>
                            <div style={{ padding: '1rem 1.4rem', minWidth: 100, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)' }}><div style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>Incorrect</div><div style={{ color: 'var(--danger)', fontWeight: 800, fontSize: '1.8rem' }}>{scoreResult.incorrect}</div></div>
                        </div>
                    ) : (
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>Your answers were submitted. The host is returning your score.</p>
                    )}
                    <p style={{ color: 'var(--text-tertiary)', fontSize: '0.83rem' }}>Room results are temporary and are not saved as permanent room records in this version.</p>
                </div>

                {isHostFlow && Object.keys(results).length > 0 && (
                    <div className="glass-panel" style={{ padding: '1.25rem' }}>
                        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Participant results</h2>
                        <div style={{ display: 'grid', gap: '0.55rem' }}>
                            {Object.values(results).map((result) => (
                                <div key={result.userId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '0.8rem 0.9rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                                    <span style={{ fontWeight: 600 }}>{result.displayName}</span>
                                    <strong style={{ color: 'var(--accent-primary)' }}>{result.points} / {result.totalQuestions}</strong>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <button onClick={() => navigate('/dashboard')} style={{ ...roomButtonStyle('secondary'), maxWidth: 260, margin: '1.2rem auto 0' }}>Return to dashboard</button>
            </div>
        );
    }

    return (
        <div className="container" style={{ maxWidth: 720, marginTop: '3rem' }}>
            <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
                <XCircle size={30} style={{ color: 'var(--warning)', margin: '0 auto 1rem' }} />
                <h2 style={{ marginBottom: '0.6rem' }}>Room session ended</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>The temporary room is no longer active.</p>
                <button style={roomButtonStyle()} onClick={() => navigate('/dashboard')}>Return to dashboard</button>
            </div>
        </div>
    );
}
