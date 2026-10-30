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

const AVAILABLE_FILTERS = {
    examTypes: ['Mid-Term 1', 'Mid-Term 2 (MCQ / Objective)', 'ESE'],
    difficulties: ['easy', 'medium', 'hard'],
    attemptTypes: ['exam', 'test_room'],
};

const TOP_ENTRIES = [
    { rank: 1, position: 1, studentId: 11, displayName: 'Student Alpha', points: 160, maxPoints: 200, percentage: 80, totalTests: 4, topPercent: 1, isTop100: true },
    { rank: 2, position: 2, studentId: 12, displayName: 'Student Beta', points: 150, maxPoints: 187.5, percentage: 80, totalTests: 3, topPercent: 2, isTop100: true },
    { rank: 2, position: 3, studentId: 13, displayName: 'Student Gamma', points: 150, maxPoints: 187.5, percentage: 80, totalTests: 3, topPercent: 2, isTop100: true },
    { rank: 4, position: 4, studentId: 14, displayName: 'Student Delta', points: 100, maxPoints: 125, percentage: 80, totalTests: 2, topPercent: 4, isTop100: true },
    ...Array.from({ length: 8 }, (_, index) => {
        const position = index + 5;
        return {
            rank: position,
            position,
            studentId: 10 + position,
            displayName: `Student ${position}`,
            points: 100 - position,
            maxPoints: 125,
            percentage: 80 - position,
            totalTests: 2,
            topPercent: position,
            isTop100: true,
        };
    }),
];

function makeBoard(overrides = {}) {
    return {
        subject: {
            subjectId: SUBJECT.subjectId,
            subjectName: SUBJECT.subjectName,
            courseId: SUBJECT.courseId,
            semester: SUBJECT.sem,
        },
        filters: { examType: null, difficulty: null, attemptType: null },
        filterOptions: AVAILABLE_FILTERS,
        source: 'published',
        participantCount: 130,
        availableEntries: 100,
        entries: TOP_ENTRIES,
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
        pagination: { limit: 10, offset: 0, returned: 10, hasMore: true },
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

describe('verified Top 10 leaderboard board', () => {
    it('renders only ten rows, keeps competition ranks and shows a percentile only outside the Top 10', async () => {
        render(<LeaderboardBoard subject={SUBJECT} />);

        const table = await screen.findByTestId('lb-rankings-table');
        expect(within(table).getByText('Student Alpha')).toBeInTheDocument();
        expect(within(table).getByText('Student Beta')).toBeInTheDocument();
        expect(within(table).getByText('Student Gamma')).toBeInTheDocument();
        expect(within(table).getAllByText('#2')).toHaveLength(2);
        expect(within(table).getByText('#4')).toBeInTheDocument();
        expect(within(table).getByText('Student 10')).toBeInTheDocument();
        expect(within(table).queryByText('Student 11')).toBeNull();
        expect(within(table).getAllByRole('row')).toHaveLength(11);
        expect(within(table).getByRole('columnheader', { name: 'Percentage' })).toBeInTheDocument();
        expect(within(table).queryByRole('columnheader', { name: /weighted/i })).toBeNull();
        expect(within(table).getByText('80.00')).toBeInTheDocument();
        expect(within(table).queryByText('80.00%')).toBeNull();

        const viewer = screen.getByTestId('lb-viewer-summary');
        expect(viewer).toHaveTextContent('Current Student');
        expect(viewer).toHaveTextContent('#121');
        expect(viewer).toHaveTextContent('Outside the displayed Top 10');
        expect(viewer).toHaveTextContent('Top 94%');

        const participants = screen.getByTestId('lb-participant-count');
        expect(participants).toHaveTextContent('130 participants');
        expect(participants).not.toHaveTextContent(/published entries|board view/i);
        expect(screen.getByTestId('lb-top10-summary')).toHaveTextContent('Showing 10 of 130 participants');
        expect(screen.queryByRole('button', { name: /next|previous/i })).toBeNull();

        expect(getLeaderboardRankings).toHaveBeenCalledWith({
            subjectId: SUBJECT.subjectId,
            examType: null,
            difficulty: null,
            attemptType: null,
            limit: 10,
            offset: 0,
        });
    });

    it('does not show a Top X percentile badge when the signed-in student is in the displayed Top 10', async () => {
        const board = makeBoard({
            viewer: {
                rank: 1,
                position: 1,
                studentId: 11,
                displayName: 'Student Alpha',
                points: 160,
                maxPoints: 200,
                percentage: 80,
                totalTests: 4,
                topPercent: 1,
                isTop100: true,
            },
        });
        getLeaderboardRankings.mockResolvedValue({ leaderboard: board, error: null });

        render(<LeaderboardBoard subject={SUBJECT} />);

        const viewer = await screen.findByTestId('lb-viewer-summary');
        expect(viewer).toHaveTextContent('Inside the displayed Top 10');
        expect(viewer).not.toHaveTextContent('Top 1%');
        expect(viewer).toHaveTextContent('80.00 percentage');
        expect(viewer).not.toHaveTextContent('80.00%');
    });

    it('shows every filter value supplied by available results and uses the Exam source label', async () => {
        render(<LeaderboardBoard subject={SUBJECT} />);
        await screen.findByTestId('lb-rankings-table');

        const examType = screen.getByLabelText('Filter by exam type');
        const difficulty = screen.getByLabelText('Filter by difficulty');
        const attemptSource = screen.getByLabelText('Filter by attempt source');

        expect(within(examType).getByRole('option', { name: 'All exam types' })).toBeInTheDocument();
        expect(within(examType).getByRole('option', { name: 'Mid-Term 1' })).toBeInTheDocument();
        expect(within(examType).getByRole('option', { name: 'Mid-Term 2 (MCQ / Objective)' })).toBeInTheDocument();
        expect(within(examType).getByRole('option', { name: 'ESE' })).toBeInTheDocument();

        expect(within(difficulty).getByRole('option', { name: 'All difficulties' })).toBeInTheDocument();
        for (const value of ['Easy', 'Medium', 'Hard']) {
            expect(within(difficulty).getByRole('option', { name: value })).toBeInTheDocument();
        }

        expect(within(attemptSource).getByRole('option', { name: 'All attempt sources' })).toBeInTheDocument();
        expect(within(attemptSource).getByRole('option', { name: 'Exam' })).toBeInTheDocument();
        expect(within(attemptSource).getByRole('option', { name: 'Test Room' })).toBeInTheDocument();

        fireEvent.change(examType, { target: { value: 'Mid-Term 1' } });
        await waitFor(() => {
            expect(getLeaderboardRankings).toHaveBeenLastCalledWith(expect.objectContaining({
                subjectId: SUBJECT.subjectId,
                examType: 'Mid-Term 1',
                limit: 10,
                offset: 0,
            }));
        });

        fireEvent.change(difficulty, { target: { value: 'hard' } });
        await waitFor(() => {
            expect(getLeaderboardRankings).toHaveBeenLastCalledWith(expect.objectContaining({
                examType: 'Mid-Term 1',
                difficulty: 'hard',
                limit: 10,
                offset: 0,
            }));
        });

        fireEvent.change(attemptSource, { target: { value: 'exam' } });
        await waitFor(() => {
            expect(getLeaderboardRankings).toHaveBeenLastCalledWith(expect.objectContaining({
                examType: 'Mid-Term 1',
                difficulty: 'hard',
                attemptType: 'exam',
                limit: 10,
                offset: 0,
            }));
        });
    });

    it('does not invent exam types, difficulties or attempt sources that are absent from the results', async () => {
        getLeaderboardRankings.mockResolvedValue({
            leaderboard: makeBoard({
                filterOptions: {
                    examTypes: ['Mid-Term 2 (MCQ / Objective)'],
                    difficulties: ['medium'],
                    attemptTypes: ['test_room'],
                },
            }),
            error: null,
        });

        render(<LeaderboardBoard subject={SUBJECT} />);
        await screen.findByTestId('lb-rankings-table');

        expect(within(screen.getByLabelText('Filter by exam type')).queryByRole('option', { name: 'Mid-Term 1' })).toBeNull();
        expect(within(screen.getByLabelText('Filter by exam type')).queryByRole('option', { name: 'ESE' })).toBeNull();
        expect(within(screen.getByLabelText('Filter by difficulty')).queryByRole('option', { name: 'Hard' })).toBeNull();
        expect(within(screen.getByLabelText('Filter by attempt source')).queryByRole('option', { name: 'Exam' })).toBeNull();
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
