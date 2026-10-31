import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../src/supabase', async () => (await import('./supabaseMock.js')).supabaseModuleMock());

const { state, resetSupabaseStub, makeSession, authUser, adminRow } = await import('./supabaseMock.js');
const AdminFeedbackInbox = (await import('../src/components/AdminFeedbackInbox.jsx')).default;

function signInAdmin() {
    state.session = makeSession(authUser({ id: 'admin-1', email: 'admin@example.com' }));
    state.adminRow = adminRow({
        auth_uid: 'admin-1',
        email: 'admin@example.com',
        full_name: 'Inbox Admin',
    });
}

beforeEach(() => {
    cleanup();
    resetSupabaseStub();
    signInAdmin();
});

afterEach(() => {
    cleanup();
});

describe('AdminFeedbackInbox', () => {
    it('loads all feedback in one dashboard request and displays only the requested student details', async () => {
        state.feedbackRows = [{
            feedbackId: 91,
            description: 'The new exam attempt page loads quickly but the timer sometimes freezes when I switch between questions and return to the earlier section during practice.',
            type: 'bug',
            isSpam: false,
            isBookmark: false,
            isSeen: false,
            studentId: 4205,
            studentName: 'Student Example',
            studentIsSpam: false,
        }];

        render(<AdminFeedbackInbox />);

        expect(await screen.findByText(/The new exam attempt page loads quickly but the timer sometimes freezes when I switch…/)).toBeInTheDocument();
        expect(screen.getByText('Student Example')).toBeInTheDocument();
        expect(screen.getByText('Student ID: 4205')).toBeInTheDocument();
        expect(screen.queryByText(/Feedback ID/i)).toBeNull();
        expect(screen.queryByText(/between questions and return to the earlier section/)).toBeNull();
        expect(state.calls.filter((call) => call.fn === 'admin_get_feedback_dashboard')).toHaveLength(1);

        fireEvent.click(screen.getByRole('button', { name: 'Review full feedback' }));
        expect(screen.getByText(/between questions and return to the earlier section during practice/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    });

    it('persists all four moderation actions and updates the inbox after success', async () => {
        state.feedbackRows = [{
            feedbackId: 92,
            description: 'A suggestion from the student.',
            type: 'other',
            isSpam: false,
            isBookmark: false,
            isSeen: false,
            studentId: 4206,
            studentName: 'Another Student',
            studentIsSpam: false,
        }];

        render(<AdminFeedbackInbox />);
        await screen.findByText('A suggestion from the student.');

        async function openActions() {
            fireEvent.click(screen.getByRole('button', { name: 'Feedback actions' }));
            return screen.getByRole('group', { name: 'Feedback actions' });
        }

        const firstMenu = await openActions();
        expect(firstMenu.querySelectorAll('button')).toHaveLength(4);

        fireEvent.click(screen.getByRole('button', { name: 'Bookmark feedback' }));
        await waitFor(() => expect(screen.getByText('Bookmarked')).toBeInTheDocument());

        await openActions();
        fireEvent.click(screen.getByRole('button', { name: 'Mark as seen' }));
        await waitFor(() => expect(screen.getByText('Seen')).toBeInTheDocument());

        await openActions();
        fireEvent.click(screen.getByRole('button', { name: 'Mark feedback as spam' }));
        await waitFor(() => expect(screen.getByText('Spam')).toBeInTheDocument());

        await openActions();
        fireEvent.click(screen.getByRole('button', { name: 'Mark student as spam' }));
        const spamStudentCount = document.querySelector('.admin-feedback-inbox__spam .admin-feedback-inbox__section-head > span');
        expect(spamStudentCount).not.toBeNull();
        await waitFor(() => expect(spamStudentCount).toHaveTextContent('1'));

        expect(state.calls.filter((call) => call.fn === 'admin_update_feedback_flag').map((call) => call.args.p_action))
            .toEqual(['bookmark', 'seen', 'spam']);
        expect(state.calls.filter((call) => call.fn === 'admin_mark_student_spam')).toHaveLength(1);
        expect(state.spamStudents).toEqual([{ studentId: 4206, studentName: 'Another Student' }]);
    });
});
