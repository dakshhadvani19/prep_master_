import { describe, expect, it } from 'vitest';
import {
    cleanQuestions,
    buildStartRoomScript,
    buildLobbySnapshot,
    normalizeAnswers,
    normalizeCode,
    hostResumeError,
    roomExpiryForStart,
    roomTtlSeconds,
    resolveFinalization,
    roomJoinError,
    shouldFinalizeStaleHeartbeat,
    safeQuestions,
    scoreAnswers,
} from '../api/test-room-session.js';

const questions = Array.from({ length: 30 }, (_, index) => ({
    id: 'q' + index,
    text: 'Question ' + index,
    options: ['A', 'B', 'C', 'D'].map((text, originalOptionIndex) => ({ text, originalOptionIndex })),
    answer: index % 4,
}));

describe('Test Room lobby fallback contract', () => {
    it('returns safe metadata without exposing attempt ids or answers', () => {
        const snapshot = buildLobbySnapshot({
            roomCode: 'DHUTCGEEZR', hostUid: 'private-host-uid',
            subjectName: 'Fundamentals of Machine Learning', status: 'waiting', durationMinutes: 15,
        }, [{
            userId: 'participant-uid', displayName: 'Participant', role: 'participant',
            status: 'waiting', connected: true, answers: [1, 2], attemptId: 'private-attempt-id',
        }]);
        expect(snapshot.room.roomCode).toBe('DHUTCGEEZR');
        expect(snapshot.room.hostUid).toBeUndefined();
        expect(snapshot.participants).toEqual([{
            userId: 'participant-uid', displayName: 'Participant', role: 'participant',
            status: 'waiting', connected: true, joinedAt: null,
        }]);
        expect(JSON.stringify(snapshot)).not.toMatch(/private-host-uid|private-attempt-id|answers/i);
    });
});

describe('Test Room finalization decisions', () => {
    it('uses the exact deadline boundary for timeout classification', () => {
        expect(resolveFinalization('submit', 10_000, 9_999)).toEqual({
            status: 'submitted',
            reason: 'manual_submit',
        });
        expect(resolveFinalization('submit', 10_000, 10_000)).toEqual({
            status: 'timed_out',
            reason: 'timer_expired',
        });
        expect(resolveFinalization('disconnect', 10_000, 10_001)).toEqual({
            status: 'timed_out',
            reason: 'timer_expired',
        });
    });

    it('keeps manual submit, participant disconnect and host-marked disconnect reasons distinct', () => {
        expect(resolveFinalization('submit', null, 1)).toEqual({
            status: 'submitted',
            reason: 'manual_submit',
        });
        expect(resolveFinalization('disconnect', 0, 1)).toEqual({
            status: 'disconnected',
            reason: 'connection_lost',
        });
        expect(resolveFinalization('mark_disconnected', undefined, 1)).toEqual({
            status: 'disconnected',
            reason: 'participant_connection_lost',
        });
    });
});

describe('Test Room join lifecycle policy', () => {
    it('allows verification/join only while a room is waiting', () => {
        expect(roomJoinError('waiting')).toBeNull();
        expect(roomJoinError('started')).toMatch(/already started.*rejoining is disabled/i);
        expect(roomJoinError('finished')).toMatch(/already ended/i);
    });

    it('normalizes the public code-entry validation for valid and invalid codes', () => {
        expect(normalizeCode('  ABCDE-FGHJK ')).toBe('ABCDEFGHJK');
        expect(normalizeCode('INVALID-ROOM')).toBeNull();
        expect(normalizeCode('')).toBeNull();
    });
});

describe('Test Room start Redis script arguments', () => {
    it('reads TTL and cleanup grace from the arguments actually passed to EVAL', () => {
        const script = buildStartRoomScript();
        expect(script).toContain('local ttl = tonumber(ARGV[3]) or 3600');
        expect(script).toContain('tonumber(ARGV[4]) or 300');
        expect(script).not.toContain('ARGV[5]');
    });
});

describe('Test Room retention policy', () => {
    it('keeps waiting rooms for one hour and started rooms through the test plus cleanup grace', () => {
        const startedAt = 1_000_000;
        expect(roomExpiryForStart(startedAt, 45)).toBe(startedAt + 60 * 60 * 1000);
        expect(roomExpiryForStart(startedAt, 180)).toBe(startedAt + (180 * 60 + 5 * 60) * 1000);
        expect(roomTtlSeconds({ expiresAt: startedAt + 30_000 }, startedAt)).toBe(30);
        expect(roomTtlSeconds({ expiresAt: startedAt - 1 }, startedAt)).toBe(1);
    });
});

describe('Test Room host recovery policy', () => {
    const room = { roomCode: 'ABCDEFGHJK', hostUid: 'host-1', status: 'waiting' };
    const participant = { userId: 'host-1', role: 'host', status: 'waiting', attemptId: 'attempt-1' };
    const attempt = { id: 'attempt-1', status: 'waiting' };

    it('allows recovery only for the owning host with an active waiting attempt', () => {
        expect(hostResumeError(room, participant, attempt, 'host-1')).toBeNull();
    });

    it('rejects non-hosts, started rooms, and stale host attempts', () => {
        expect(hostResumeError(room, participant, attempt, 'other-user')).toMatch(/account that created/i);
        expect(hostResumeError({ ...room, status: 'started' }, participant, attempt, 'host-1')).toMatch(/already started/i);
        expect(hostResumeError(room, { ...participant, status: 'disconnected' }, attempt, 'host-1')).toMatch(/no longer active/i);
        expect(hostResumeError(room, participant, { ...attempt, status: 'cancelled' }, 'host-1')).toMatch(/attempt is no longer active/i);
    });
});

describe('Test Room background-tab heartbeat behavior', () => {
    it('does not treat a hidden tab with throttled timers as a disconnect', () => {
        expect(shouldFinalizeStaleHeartbeat({
            lastHeartbeat: 100,
            tabHidden: true,
        }, 500_000)).toBe(false);
    });

    it('still detects an overdue visible participant or one without visibility state', () => {
        expect(shouldFinalizeStaleHeartbeat({
            lastHeartbeat: 100,
            tabHidden: false,
        }, 36_000)).toBe(true);
        expect(shouldFinalizeStaleHeartbeat({
            lastHeartbeat: 100,
        }, 36_000)).toBe(true);
    });
});

describe('Test Room server-side validation and scoring', () => {
    it('normalizes valid room codes and rejects ambiguous or malformed codes', () => {
        expect(normalizeCode(' abcde-fghjk ')).toBe('ABCDEFGHJK');
        expect(normalizeCode('ABCDEFGHIO')).toBeNull();
        expect(normalizeCode('ABC123')).toBeNull();
        expect(normalizeCode('')).toBeNull();
    });

    it('requires exactly 30 four-option MCQs with a valid canonical answer', () => {
        expect(cleanQuestions(questions)).toHaveLength(30);
        expect(() => cleanQuestions(questions.slice(0, 29))).toThrow(/exactly 30 MCQs/i);
        expect(() => cleanQuestions(questions.map((q, index) => index === 3 ? { ...q, answer: 4 } : q))).toThrow(/valid four-option MCQ/i);
        expect(() => cleanQuestions(questions.map((q, index) => index === 0 ? { ...q, options: ['only one'] } : q))).toThrow(/valid four-option MCQ/i);
    });

    it('never includes correct answers in the participant-safe question payload', () => {
        const safe = safeQuestions(cleanQuestions(questions));
        expect(safe).toHaveLength(30);
        safe.forEach((question) => {
            expect(question).not.toHaveProperty('answer');
            expect(question.options).toHaveLength(4);
            question.options.forEach((option) => {
                expect(option).not.toHaveProperty('answer');
                expect(option).toHaveProperty('originalOptionIndex');
            });
        });
    });

    it('normalizes malformed answers to unanswered rather than accepting invalid indexes', () => {
        expect(normalizeAnswers([0, 4, -1, '2', null], 5)).toEqual([0, null, null, null, null]);
        expect(normalizeAnswers([3], 3)).toEqual([3, null, null]);
    });

    it('scores only on the server-side canonical answer indexes', () => {
        expect(scoreAnswers([2, 1, 0], [2, null, 3])).toEqual({
            correct: 1,
            incorrect: 1,
            attempted: 2,
            unattempted: 1,
            points: 1,
            totalQuestions: 3,
        });
    });
});
