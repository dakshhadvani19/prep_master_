import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
    currentUser: { uid: 'student-1', displayName: 'Student One', email: 'student@example.com' },
    performance: null,
    performanceError: null,
    getDashboardPerformanceSummary: vi.fn(),
    getMyAttempts: vi.fn(),
    reconcileTestRoomAttempts: vi.fn(),
}));

vi.mock('../src/context/AuthContext', () => ({
    useAuth: () => ({ currentUser: mocks.currentUser }),
}));

vi.mock('../src/utils/examHistoryStorage', () => ({
    getExamHistory: () => [],
}));

vi.mock('../src/utils/supabaseExam', () => ({
    getDashboardPerformanceSummary: (...args) => mocks.getDashboardPerformanceSummary(...args),
    getMyAttempts: (...args) => mocks.getMyAttempts(...args),
    reconcileTestRoomAttempts: (...args) => mocks.reconcileTestRoomAttempts(...args),
}));

import Dashboard from '../src/pages/Dashboard.jsx';

function summary() {
    return {
        hasResults: true,
        dataBasis: 'verified_completed_attempts',
        summary: {
            totalAttempts: 3,
            totalScore: 72,
            totalMaxMarks: 90,
            overallPercentage: 80,
            subjectsAttempted: 2,
        },
        subjectPerformance: [{
            subjectId: 1001,
            subjectName: 'Data Structures',
            semester: 3,
            attempts: 2,
            totalScore: 48,
            totalMaxMarks: 60,
            percentage: 80,
        }],
        recentResults: [],
    };
}

function renderDashboard() {
    return render(<MemoryRouter><Dashboard /></MemoryRouter>);
}

beforeEach(() => {
    mocks.currentUser = { uid: 'student-1', displayName: 'Student One', email: 'student@example.com' };
    mocks.performanceError = null;
    mocks.performance = summary();
    mocks.getDashboardPerformanceSummary.mockReset();
    mocks.getDashboardPerformanceSummary.mockImplementation(async () => ({
        performance: mocks.performance,
        error: mocks.performanceError,
    }));
    mocks.getMyAttempts.mockReset();
    mocks.getMyAttempts.mockResolvedValue({ attempts: [], error: null });
    mocks.reconcileTestRoomAttempts.mockReset();
    mocks.reconcileTestRoomAttempts.mockResolvedValue({ ok: true, error: null });
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('student dashboard verified performance summary', () => {
    it('renders only the verified summary aggregates and subject breakdown', async () => {
        renderDashboard();

        expect(await screen.findByRole('heading', { name: 'Performance overview' })).toBeInTheDocument();
        expect(await screen.findByText('Completed exams')).toBeInTheDocument();
        expect(screen.getByText('3', { selector: '.sd-metric strong' })).toBeInTheDocument();
        expect(screen.getByText('80.00')).toBeInTheDocument();
        expect(screen.getByText('Data Structures')).toBeInTheDocument();
        expect(screen.getByRole('progressbar', { name: /Data Structures overall percentage/i })).toHaveAttribute('aria-valuenow', '80');
        expect(screen.queryByText(/top 10|your rank|live/i)).toBeNull();
    });

    it('shows an honest empty state when no verified results exist', async () => {
        mocks.performance = {
            hasResults: false,
            summary: { totalAttempts: 0, totalScore: 0, totalMaxMarks: 0, overallPercentage: null, subjectsAttempted: 0 },
            subjectPerformance: [],
            recentResults: [],
        };
        renderDashboard();

        expect(await screen.findByText('No verified results yet')).toBeInTheDocument();
        expect(screen.getByText(/complete a scored exam/i)).toBeInTheDocument();
        expect(screen.queryByText('80.00')).toBeNull();
    });

    it('shows a friendly error and allows retry without exposing database errors', async () => {
        mocks.performance = null;
        mocks.performanceError = 'We could not load your performance summary right now. Please try again.';
        renderDashboard();

        expect(await screen.findByRole('alert')).toHaveTextContent(/performance data is unavailable/i);
        expect(screen.getByRole('alert')).not.toHaveTextContent(/postgres|supabase|42501/i);

        mocks.performanceError = null;
        mocks.performance = summary();
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(await screen.findByText('Data Structures')).toBeInTheDocument();
        expect(mocks.getDashboardPerformanceSummary).toHaveBeenCalledTimes(2);
    });
});
