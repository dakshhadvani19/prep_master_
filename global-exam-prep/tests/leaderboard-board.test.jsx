import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('../src/utils/supabaseExam', () => ({
    getLeaderboardRankings: vi.fn(),
}));

const { getLeaderboardRankings } = await import('../src/utils/supabaseExam');
const LeaderboardBoard = (await import('../src/components/LeaderboardBoard.jsx')).default;

const SUBJECT = {
    subjectId: 1001131010601,
    subjectName: 'Calculus',
    courseId: 1,
    sem: 1,
};

function makeBoard(overrides = {}) {
    return {
        subject: {
            subjectId: SUBJECT.subjectId,
            subjectName: SUBJECT.subjectName,
            courseId: SUBJECT.courseId,
            semester: SUBJECT.sem,
        },
        filters: { examType: null, difficulty: null, attemptType: null },
        filterOptions: {
            examTypes: ['Mid-Term 2 (MCQ / Objective)'],
            difficulties: ['medium'],
            attemptTypes: ['test_room'],
        },
        source: 'published',
        participantCount: 130,
        availableEntries: 100,
        entries: [
            { rank: 1, position: 1, studentId: 11, displayName: 'Student Alpha', points: 160, maxPoints: 200, percentage: 80, totalTests: 4, topPercent: 1, isTop100: true },
            { rank: 2, position: 2, studentId: 12, displayName: 'Student Beta', points: 150, maxPoints: 187.5, percentage: 80, totalTests: 3, topPercent: 2, isTop100: true },
            { rank: 2, position: 3, studentId: 13, displayName: 'Student Gamma', points: 150, maxPoints: 187.5, percentage: 80, totalTests: 3, topPercent: 2, isTop100: true },
            { rank: 4, position: 4, studentId: 14, displayName: 'Student Delta', points: 100, maxPoints: 125, percentage: 80, totalTests: 2, topPercent: 4, isTop100: true },
        ],
        viewer: {
            rank: 121,
            position: 121,
            studentId: 99,
            displayName: 'Current Student',
            points: 75,
            maxPoints: 100,
            percentage: 75,
            totalTests: 2,
            topPercent: 94,
            isTop100: false,
        },
        pagination: { limit: 25, offset: 0, returned: 4, hasMore: true },
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    getLeaderboardRankings.mockResolvedValue({
        leaderboard: makeBoard(),
        error: null,
    });
});

describe('verified leaderboard board', () => {
    it('shows competition ranks, weighted points, and the current student outside the Top 100', async () => {
        render(<LeaderboardBoard subject={SUBJECT} />);

        const table = await screen.findByTestId('lb-rankings-table');
        expect(within(table).getByText('Student Alpha')).toBeInTheDocument();
        expect(within(table).getByText('Student Beta')).toBeInTheDocument();
        expect(within(table).getByText('Student Gamma')).toBeInTheDocument();
        expect(within(table).getAllByText('#2')).toHaveLength(2);
        expect(within(table).getByText('#4')).toBeInTheDocument();

        const viewer = screen.getByTestId('lb-viewer-summary');
        expect(viewer).toHaveTextContent('Current Student');
        expect(viewer).toHaveTextContent('#121');
        expect(viewer).toHaveTextContent('Outside the published Top 100');
        expect(viewer).toHaveTextContent('Top 94%');

        expect(getLeaderboardRankings).toHaveBeenCalledWith({
            subjectId: SUBJECT.subjectId,
            examType: null,
            difficulty: null,
            attemptType: null,
            limit: 25,
            offset: 0,
        });
    });

    it('applies category filters and paginates through the verified API', async () => {
        render(<LeaderboardBoard subject={SUBJECT} />);
        await screen.findByTestId('lb-rankings-table');

        fireEvent.change(screen.getByLabelText('Filter by difficulty'), {
            target: { value: 'medium' },
        });
        await waitFor(() => {
            expect(getLeaderboardRankings).toHaveBeenLastCalledWith(expect.objectContaining({
                subjectId: SUBJECT.subjectId,
                difficulty: 'medium',
                offset: 0,
                limit: 25,
            }));
        });

        fireEvent.click(screen.getByRole('button', { name: /next/i }));
        await waitFor(() => {
            expect(getLeaderboardRankings).toHaveBeenLastCalledWith(expect.objectContaining({
                subjectId: SUBJECT.subjectId,
                difficulty: 'medium',
                offset: 25,
                limit: 25,
            }));
        });
    });

    it('shows a friendly error instead of provider or database details', async () => {
        getLeaderboardRankings.mockResolvedValue({
            leaderboard: null,
            error: 'We could not load this leaderboard right now. Please try again.',
        });

        render(<LeaderboardBoard subject={SUBJECT} />);

        const alert = await screen.findByTestId('lb-ranking-error');
        expect(alert).toHaveTextContent('We could not load this leaderboard right now. Please try again.');
        expect(alert).not.toHaveTextContent(/postgres|postgrest|private\./i);
        expect(screen.queryByTestId('lb-rankings-table')).toBeNull();
    });
});
