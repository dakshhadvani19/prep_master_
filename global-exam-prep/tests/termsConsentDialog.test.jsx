/**
 * Tests for TermsConsentDialog.jsx — mandatory Terms & Conditions acknowledgement.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TermsConsentDialog from '../src/components/TermsConsentDialog';

beforeEach(() => {
    sessionStorage.clear();
});

afterEach(() => {
    sessionStorage.clear();
});

describe('TermsConsentDialog', () => {
    it('renders with checkbox unchecked and Start disabled', () => {
        render(
            <TermsConsentDialog
                examMode="auto"
                onStart={vi.fn()}
                startLabel="Start Exam"
            />,
        );

        const checkbox = screen.getByRole('checkbox');
        expect(checkbox.checked).toBe(false);

        const startButton = screen.getByRole('button', { name: /Accept Terms & Conditions to Start/i });
        expect(startButton).toBeDisabled();
    });

    it('enables Start when checkbox is checked', () => {
        const onStart = vi.fn();
        render(
            <TermsConsentDialog
                examMode="auto"
                onStart={onStart}
                startLabel="Start Exam"
            />,
        );

        const checkbox = screen.getByRole('checkbox');
        fireEvent.click(checkbox);

        const startButton = screen.getByRole('button', { name: 'Start Exam' });
        expect(startButton).not.toBeDisabled();
        expect(sessionStorage.getItem('prepmaster_terms_version')).toBe('1');
    });

    it('calls onStart when Start is clicked after acceptance', () => {
        const onStart = vi.fn();
        render(
            <TermsConsentDialog
                examMode="auto"
                onStart={onStart}
                startLabel="Start Exam"
            />,
        );

        const checkbox = screen.getByRole('checkbox');
        fireEvent.click(checkbox);

        const startButton = screen.getByRole('button', { name: 'Start Exam' });
        fireEvent.click(startButton);

        expect(onStart).toHaveBeenCalledTimes(1);
    });

    it('does not call onStart when Start is clicked without acceptance', () => {
        const onStart = vi.fn();
        render(
            <TermsConsentDialog
                examMode="auto"
                onStart={onStart}
                startLabel="Start Exam"
            />,
        );

        const startButton = screen.getByRole('button', { name: /Accept Terms & Conditions to Start/i });
        fireEvent.click(startButton);

        expect(onStart).not.toHaveBeenCalled();
    });

    it('shows disabled state while processing', () => {
        render(
            <TermsConsentDialog
                examMode="auto"
                autoProcessing={true}
                onStart={vi.fn()}
                startLabel="Start Exam"
            />,
        );

        const checkbox = screen.getByRole('checkbox');
        fireEvent.click(checkbox);

        const startButton = screen.getByRole('button', { name: 'Generating Questions…' });
        expect(startButton).toBeDisabled();
    });

    it('renders upload mode label correctly', () => {
        render(
            <TermsConsentDialog
                examMode="upload"
                onStart={vi.fn()}
                startLabel="Generate Questions & Start Exam"
            />,
        );

        const startButton = screen.getByRole('button', { name: /Accept Terms & Conditions to Start/i });
        expect(startButton).toBeDisabled();
    });

    it('persists acceptance in sessionStorage', () => {
        render(
            <TermsConsentDialog
                examMode="auto"
                onStart={vi.fn()}
                startLabel="Start Exam"
            />,
        );

        const checkbox = screen.getByRole('checkbox');
        fireEvent.click(checkbox);

        expect(sessionStorage.getItem('prepmaster_terms_version')).toBe('1');
    });
});
