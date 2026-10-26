import { describe, expect, it } from 'vitest';
import {
    cleanQuestions,
    normalizeAnswers,
    normalizeCode,
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
