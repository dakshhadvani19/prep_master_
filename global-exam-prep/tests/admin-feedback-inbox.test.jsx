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

async function openFeedbackActions() {
    const menuButton = screen.getByRole('button', { name: 'Feedback actions' });
    if (menuButton.getAttribute('aria-expanded') !== 'true') fireEvent.click(menuButton);
    return screen.getByRole('group', { name: 'Feedback and student actions' });
}

async function toggleFlag(name, expected) {
    if (!screen.queryByRole('switch', { name })) await openFeedbackActions();
    fireEvent.click(screen.getByRole('switch', { name }));
    await waitFor(() => expect(screen.getByRole('switch', { name })).toHaveAttribute('aria-checked', String(expected)));
    expect(screen.getByRole('button', { name: 'Feedback actions' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('group', { name: 'Feedback and student actions' })).toBeInTheDocument();
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
    it('keeps moderation switches inside the three-dot menu and expands the full description', async () => {
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
        expect(state.calls.filter((call) => call.fn === 'admin_get_feedback_dashboard')).toHaveLength(1);

        expect(screen.queryByRole('switch', { name: 'Seen' })).not.toBeInTheDocument();
        expect(screen.queryByRole('switch', { name: 'Bookmark' })).not.toBeInTheDocument();
        expect(screen.queryByRole('switch', { name: 'Spam' })).not.toBeInTheDocument();
        expect(screen.queryByRole('switch', { name: 'Student spam' })).not.toBeInTheDocument();

        await openFeedbackActions();
        expect(screen.getByRole('switch', { name: 'Seen' })).toHaveAttribute('aria-checked', 'false');
        expect(screen.getByRole('switch', { name: 'Bookmark' })).toHaveAttribute('aria-checked', 'false');
        expect(screen.getByRole('switch', { name: 'Spam' })).toHaveAttribute('aria-checked', 'false');
        expect(screen.getByRole('switch', { name: 'Student spam' })).toHaveAttribute('aria-checked', 'false');

        fireEvent.click(screen.getByRole('button', { name: 'Review full feedback' }));
        expect(screen.getByText(/between questions and return to the earlier section during practice/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    });

    it('keeps the menu open while toggling feedback flags and student spam on and off', async () => {
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

        await toggleFlag('Bookmark', true);
        await toggleFlag('Seen', true);
        await toggleFlag('Seen', false);
        await toggleFlag('Bookmark', false);
        await toggleFlag('Spam', true);
        await toggleFlag('Spam', false);

        await openFeedbackActions();
        const studentSpamSwitch = screen.getByRole('switch', { name: 'Student spam' });
        expect(studentSpamSwitch).toHaveAttribute('aria-checked', 'false');
        fireEvent.click(studentSpamSwitch);
        await waitFor(() => expect(screen.getByRole('switch', { name: 'Student spam' })).toHaveAttribute('aria-checked', 'true'));
        expect(screen.getByRole('button', { name: 'Feedback actions' })).toHaveAttribute('aria-expanded', 'true');

        const spamStudentCount = document.querySelector('.admin-feedback-inbox__spam .admin-feedback-inbox__section-head > span');
        expect(spamStudentCount).not.toBeNull();
        await waitFor(() => expect(spamStudentCount).toHaveTextContent('1'));

        fireEvent.click(screen.getByRole('switch', { name: 'Student spam' }));
        await waitFor(() => expect(screen.getByRole('switch', { name: 'Student spam' })).toHaveAttribute('aria-checked', 'false'));
        await waitFor(() => expect(spamStudentCount).toHaveTextContent('0'));
        expect(screen.getByRole('button', { name: 'Feedback actions' })).toHaveAttribute('aria-expanded', 'true');

        expect(state.feedbackActionEvents).toHaveLength(6);
        expect(state.feedbackActionEvents.every((event) => event.outcome === 'updated')).toBe(true);
        expect(state.calls.filter((call) => call.fn === 'admin_update_feedback_flag').map((call) => call.args.p_action))
            .toEqual(['bookmark', 'seen', 'seen', 'bookmark', 'spam', 'spam']);
        expect(state.calls.filter((call) => call.fn === 'admin_mark_student_spam')).toHaveLength(2);
        expect(state.spamStudents).toEqual([]);
        expect(state.feedbackRows[0].studentIsSpam).toBe(false);
    });

    it('blocks bookmarking spam feedback, logs the blocked click, and allows unspamming before bookmarking', async () => {
        state.feedbackRows = [{
            feedbackId: 93,
            description: 'This feedback is currently marked as spam.',
            type: 'other',
            isSpam: true,
            isBookmark: false,
            isSeen: false,
            studentId: 4207,
            studentName: 'Third Student',
            studentIsSpam: false,
        }];

        render(<AdminFeedbackInbox />);
        await screen.findByText('This feedback is currently marked as spam.');

        await openFeedbackActions();
        fireEvent.click(screen.getByRole('switch', { name: 'Bookmark' }));
        expect(await screen.findByText('This feedback is marked as spam. Turn Spam off before bookmarking.')).toBeInTheDocument();
        expect(screen.getByRole('switch', { name: 'Bookmark' })).toHaveAttribute('aria-checked', 'false');
        expect(screen.getByRole('button', { name: 'Feedback actions' })).toHaveAttribute('aria-expanded', 'true');
        expect(state.feedbackActionEvents[0]).toMatchObject({
            feedbackId: 93,
            action: 'bookmark',
            previousValue: false,
            requestedValue: true,
            outcome: 'blocked',
        });

        await toggleFlag('Spam', false);
        await toggleFlag('Bookmark', true);

        expect(state.feedbackActionEvents.map((event) => event.outcome)).toEqual(['blocked', 'updated', 'updated']);
        expect(state.feedbackRows[0]).toMatchObject({ isSpam: false, isBookmark: true });
    });

    it('blocks marking bookmarked feedback as spam until the bookmark is removed', async () => {
        state.feedbackRows = [{
            feedbackId: 94,
            description: 'This feedback is bookmarked.',
            type: 'other',
            isSpam: false,
            isBookmark: true,
            isSeen: false,
            studentId: 4208,
            studentName: 'Fourth Student',
            studentIsSpam: false,
        }];

        render(<AdminFeedbackInbox />);
        await screen.findByText('This feedback is bookmarked.');

        await openFeedbackActions();
        fireEvent.click(screen.getByRole('switch', { name: 'Spam' }));
        expect(await screen.findByText('Remove the Bookmark flag before marking this feedback as spam.')).toBeInTheDocument();
        expect(screen.getByRole('switch', { name: 'Spam' })).toHaveAttribute('aria-checked', 'false');
        expect(screen.getByRole('button', { name: 'Feedback actions' })).toHaveAttribute('aria-expanded', 'true');

        await toggleFlag('Bookmark', false);
        await toggleFlag('Spam', true);

        expect(state.feedbackActionEvents.map((event) => event.outcome)).toEqual(['blocked', 'updated', 'updated']);
    });
});
