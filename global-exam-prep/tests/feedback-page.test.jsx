import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
    useAuth: vi.fn(),
}));
vi.mock('../src/context/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('../src/components/AdminFeedbackInbox', () => ({ default: () => <div>ADMIN FEEDBACK INBOX</div> }));

import FeedbackPage from '../src/pages/FeedbackPage';

function renderPage() {
    mocks.useAuth.mockReturnValue({
        studentId: 42,
        currentUser: { uid: 'verified-student-uid' },
        isAdmin: false,
        session: { access_token: 'verified-session-token' },
    });
    return render(<MemoryRouter><FeedbackPage /></MemoryRouter>);
}

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('FeedbackPage', () => {
    it('shows the admin feedback inbox instead of the student submission form', () => {
        mocks.useAuth.mockReturnValue({
            studentId: null,
            currentUser: { uid: 'verified-admin-uid' },
            isAdmin: true,
            session: { access_token: 'verified-admin-token' },
        });

        render(<MemoryRouter><FeedbackPage /></MemoryRouter>);
        expect(screen.getByText('ADMIN FEEDBACK INBOX')).toBeTruthy();
        expect(screen.queryByText('Feedback Type')).toBeNull();
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('shows only Feedback Type and Description, without rating or personal-detail fields', () => {
        renderPage();
        expect(screen.getByText('Feedback Type')).toBeTruthy();
        expect(screen.getByRole('button', { name: /general feedback/i })).toBeTruthy();
        expect(screen.getByRole('button', { name: /bug report/i })).toBeTruthy();
        expect(screen.getByRole('button', { name: /feature request/i })).toBeTruthy();
        expect(screen.getByRole('button', { name: /content issue/i })).toBeTruthy();
        expect(screen.getByRole('button', { name: /other/i })).toBeTruthy();
        expect(screen.getByRole('textbox', { name: /description/i }).getAttribute('maxLength')).toBe('1000');
        expect(screen.queryByText('AI Quality')).toBeNull();
        expect(screen.queryByText('Only Rating')).toBeNull();
        expect(screen.queryByLabelText(/rating/i)).toBeNull();
        expect(screen.queryByLabelText(/your name/i)).toBeNull();
        expect(screen.queryByLabelText(/your email/i)).toBeNull();
        expect(screen.queryByLabelText(/^subject/i)).toBeNull();
    });

    it('does not show a sign-in prompt when the student session is valid but studentId has not loaded', async () => {
        mocks.useAuth.mockReturnValue({
            studentId: null,
            currentUser: { uid: 'verified-student-uid' },
            isAdmin: false,
            session: { access_token: 'verified-session-token' },
        });
        globalThis.fetch.mockResolvedValue({
            ok: true,
            status: 201,
            json: async () => ({ success: true, feedbackId: 103 }),
        });

        render(<MemoryRouter><FeedbackPage /></MemoryRouter>);
        expect(screen.queryByText(/sign in with a student account/i)).toBeNull();

        fireEvent.change(screen.getByRole('textbox', { name: /description/i }), {
            target: { value: 'The profile ID is still loading.' },
        });
        const submitButton = screen.getByRole('button', { name: /send feedback/i });
        expect(submitButton).not.toBeDisabled();
        fireEvent.click(submitButton);

        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
        const [, options] = globalThis.fetch.mock.calls[0];
        expect(options.headers.Authorization).toBe('Bearer verified-session-token');
        expect(JSON.parse(options.body)).toEqual({
            type: 'general',
            description: 'The profile ID is still loading.',
        });
        expect(await screen.findByText(/saved successfully/i)).toBeTruthy();
    });

    it('shows the Other helper and submits only type and description with the bearer token', async () => {
        globalThis.fetch.mockResolvedValue({
            ok: true,
            status: 201,
            json: async () => ({ success: true, feedbackId: 101 }),
        });
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: /other/i }));
        expect(screen.getByText(/does not fit the other categories/i)).toBeTruthy();

        fireEvent.change(screen.getByRole('textbox', { name: /description/i }), {
            target: { value: 'A useful suggestion.' },
        });
        fireEvent.click(screen.getByRole('button', { name: /send feedback/i }));
        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));

        const [url, options] = globalThis.fetch.mock.calls[0];
        expect(url).toBe('/api/feedback');
        expect(options.method).toBe('POST');
        expect(options.headers.Authorization).toBe('Bearer verified-session-token');
        expect(JSON.parse(options.body)).toEqual({
            type: 'other',
            description: 'A useful suggestion.',
        });
        expect(JSON.parse(options.body)).not.toHaveProperty('rating');
        expect(await screen.findByText(/saved successfully/i)).toBeTruthy();
    });

    it('shows the loading state until the API confirms that feedback was saved', async () => {
        let resolveResponse;
        globalThis.fetch.mockImplementation(() => new Promise((resolve) => {
            resolveResponse = resolve;
        }));

        renderPage();
        fireEvent.change(screen.getByRole('textbox', { name: /description/i }), {
            target: { value: 'Wait for the server response.' },
        });
        fireEvent.click(screen.getByRole('button', { name: /send feedback/i }));

        const loadingButton = await screen.findByRole('button', { name: /sending/i });
        expect(loadingButton).toBeDisabled();
        expect(screen.queryByText(/saved successfully/i)).toBeNull();

        resolveResponse({
            ok: true,
            status: 201,
            json: async () => ({ success: true, feedbackId: 102 }),
        });
        expect(await screen.findByText(/saved successfully/i)).toBeTruthy();
    });

    it('enforces the 1,000-character limit in the browser', () => {
        renderPage();
        const field = screen.getByRole('textbox', { name: /description/i });
        fireEvent.change(field, { target: { value: 'x'.repeat(1001) } });
        expect(field.value).toHaveLength(1000);
        expect(screen.getByText('1000 / 1000 characters')).toBeTruthy();
    });

    it('blocks signed-out visitors and shows the sign-in action', () => {
        mocks.useAuth.mockReturnValue({ studentId: null, session: null });
        render(<MemoryRouter><FeedbackPage /></MemoryRouter>);
        expect(screen.getByText(/sign in with a student account/i)).toBeTruthy();
        expect(screen.getByRole('button', { name: /send feedback/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy();
    });
});
