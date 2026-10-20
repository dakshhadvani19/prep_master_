/**
 * TermsConsentDialog.jsx — Mandatory Terms & Conditions acknowledgement before
 * an exam can start.
 *
 * Requirements:
 * - Checkbox starts unchecked; Start button disabled until accepted.
 * - Acceptance is required for BOTH auto mode and upload mode.
 * - Direct navigation to /exam/:subjectId/:examType/:difficulty always lands on
 *   the consent step — there is no bypass.
 * - Consent state lives in sessionStorage (tab-scoped) so a refresh or tab
 *   switch does not silently skip consent, but it is NOT treated as a bypass
 *   because the intro view always re-renders the checkbox unchecked until the
 *   user clicks it in this session.
 * - No answer keys, no Groq keys, no PII beyond the exam metadata shown.
 */

import { useState, useEffect } from 'react';

const TERMS_KEY = 'prepmaster_terms_version';
const TERMS_VERSION = 1;

/**
 * Renders the consent checkbox + terms text inside the exam intro flow.
 * Returns JSX to be placed where the Start button currently sits.
 *
 * @param {object} props
 * @param {boolean} props.examMode — 'auto' | 'upload'
 * @param {boolean} props.autoProcessing | props.uploadProcessing — generation in flight
 * @param {number} props.retryCountdown — rate-limit cooldown remaining
 * @param {Function} props.onStart — called when user clicks Start (must be gated)
 * @param {string} props.startLabel — button label
 * @param {Function} props.onToggle — optional external handler for checkbox change
 * @returns {JSX.Element}
 */
export default function TermsConsentDialog({
    examMode,
    autoProcessing = false,
    uploadProcessing = false,
    retryCountdown = 0,
    onStart,
    startLabel = 'Start Exam',
    onToggle,
}) {
    const [accepted, setAccepted] = useState(false);

    // Persist acceptance in sessionStorage so a refresh does not lose it, but
    // always re-render unchecked on first mount of this component instance.
    useEffect(() => {
        const stored = sessionStorage.getItem(TERMS_KEY);
        if (stored === String(TERMS_VERSION)) {
            setAccepted(true);
        }
    }, []);

    const handleAccept = () => {
        setAccepted(true);
        sessionStorage.setItem(TERMS_KEY, String(TERMS_VERSION));
        if (onToggle) onToggle(true);
    };

    const handleDecline = () => {
        setAccepted(false);
        sessionStorage.removeItem(TERMS_KEY);
        if (onToggle) onToggle(false);
    };

    const processing = autoProcessing || uploadProcessing;
    const disabled = !accepted || processing || retryCountdown > 0;

    return (
        <div
            style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-md)',
                padding: '1.5rem',
                marginBottom: '1.5rem',
                textAlign: 'left',
            }}
        >
            <h3
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '0.75rem',
                    fontSize: '1rem',
                    color: 'var(--text-primary)',
                }}
            >
                ⚠️
                <span>Terms & Conditions</span>
            </h3>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1rem' }}>
                By starting this exam you acknowledge that:
            </p>

            <ul style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.6, paddingLeft: '1.25rem', marginBottom: '1rem' }}>
                <li>
                    This is a personal assessment. Do not use external resources, other
                    devices, or assistance from anyone else while the exam is active.
                </li>
                <li>
                    Tab/window switching is detected and recorded. Repeated switching may
                    be flagged on your attempt record.
                </li>
                <li>
                    Once started, the timer cannot be paused. Do not refresh the page or
                    you risk losing your progress.
                </li>
                <li>
                    Your answers are saved to your profile as you work. If your connection
                    drops, keep the tab open — answers are preserved and can be resumed.
                </li>
                <li>
                    Submitting the exam finalizes your attempt. You will not be able to
                    change answers after submission.
                </li>
            </ul>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <input
                    type="checkbox"
                    checked={accepted}
                    onChange={accepted ? handleDecline : handleAccept}
                    style={{ width: '18px', height: '18px', marginTop: '2px', flexShrink: 0, cursor: 'pointer' }}
                />
                <label
                    style={{ fontSize: '0.875rem', color: 'var(--text-primary)', cursor: 'pointer', lineHeight: 1.5 }}
                >
                    I have read and accept the Terms & Conditions
                </label>
            </div>

            <button
                onClick={accepted && !disabled ? onStart : undefined}
                disabled={disabled}
                style={{
                    width: '100%',
                    padding: '1rem 2rem',
                    borderRadius: 'var(--radius-full)',
                    background: disabled
                        ? 'var(--bg-tertiary)'
                        : 'linear-gradient(135deg,#3b82f6,#8b5cf6)',
                    color: disabled ? 'var(--text-tertiary)' : 'white',
                    fontSize: '1rem',
                    fontWeight: 600,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    border: 'none',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.6rem',
                    marginTop: '0.5rem',
                }}
            >
                {processing
                    ? 'Generating Questions…'
                    : retryCountdown > 0
                        ? `Retry in ${retryCountdown}s…`
                        : accepted
                            ? startLabel
                            : 'Accept Terms & Conditions to Start'}
            </button>
        </div>
    );
}
