import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock('../src/context/AuthContext', () => ({ useAuth: mocks.useAuth }));

import FeedbackPage from '../src/pages/FeedbackPage';

function renderPage() {
    mocks.useAuth.mockReturnValue({
        studentId: 42,
        session: { access_token: 'verified-session-token' },
    });
    return render(<MemoryRouter><FeedbackPage /></MemoryRouter>);
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('FeedbackPage', () => {
    it('shows only the requested three fields and enforces the description limit', () => {
        renderPage();
        expect(screen.getByText('Feedback Type')).toBeTruthy();
        expect(screen.getByText('Only Rating')).toBeTruthy();
        expect(screen.getByLabelText('Description').getAttribute('maxLength')).toBe('1000');
        expect(screen.queryByText('AI Quality')).toBeNull();
        expect(screen.queryByText('Your Name')).toBeNull();
        expect(screen.queryByText('Your Email')).toBeNull();
        expect(screen.queryByText('Subject')).toBeNull();
    });

    it('offers Other without a separate follow-up field', () => {
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: 'Other' }));
        expect(screen.getByRole('button', { name: 'Other' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.queryByLabelText(/other details/i)).toBeNull();
    });

    it('sends the type, rating, description and verified access token', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 201,
            json: async () => ({ success: true, feedbackId: 101 }),
        });
        vi.stubGlobal('fetch', fetchMock);
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: 'Other' }));
        fireEvent.click(screen.getByRole('button', { name: 'Rate 4 out of 5' }));
        fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'A useful suggestion.' } });
        fireEvent.click(screen.getByRole('button', { name: /Send Feedback/i }));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        const [, options] = fetchMock.mock.calls[0];
        expect(options.headers.Authorization).toBe('Bearer verified-session-token');
        expect(JSON.parse(options.body)).toEqual({
            type: 'other',
            rating: 4,
            description: 'A useful suggestion.',
        });
        expect(await screen.findByText('Your feedback has been saved. We appreciate you taking the time to help improve PrepMaster.')).toBeTruthy();
    });
});
