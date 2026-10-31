const LAUNCH_STEPS = [
    { id: 'loading-content', label: 'Loading workspace' },
    { id: 'authorizing-user', label: 'Authorizing account' },
    { id: 'loading-profile', label: 'Loading account context' },
    { id: 'preparing-workspace', label: 'Preparing your experience' },
];

const STAGE_COPY = {
    'loading-content': {
        eyebrow: 'PREPMASTER / INITIALIZING',
        title: 'Loading your workspace',
        detail: 'Gathering the pieces needed to open PrepMaster.',
    },
    'restoring-session': {
        eyebrow: 'PREPMASTER / SESSION',
        title: 'Restoring your session',
        detail: 'Checking whether you already have an active session.',
    },
    'authorizing-user': {
        eyebrow: 'PREPMASTER / ACCESS',
        title: 'Authorizing your account',
        detail: 'Confirming whether this account belongs to a student or an administrator.',
    },
    'loading-profile': {
        eyebrow: 'PREPMASTER / PROFILE',
        title: 'Loading account context',
        detail: 'Retrieving the student profile linked to this verified account.',
    },
    'preparing-workspace': {
        eyebrow: 'PREPMASTER / FINALIZING',
        title: 'Packaging everything together',
        detail: 'Setting up the right workspace and preparing your first screen.',
    },
    'identity-error': {
        eyebrow: 'PREPMASTER / VERIFICATION',
        title: 'We could not verify this account',
        detail: 'Your workspace has not been opened because account access could not be confirmed.',
    },
};

export default function AuthLaunchScreen({ stage = 'loading-content', error = '', onRetry, onSignOut }) {
    const failed = stage === 'identity-error';
    const copy = STAGE_COPY[stage] || STAGE_COPY['loading-content'];
    const activeIndex = Math.max(0, LAUNCH_STEPS.findIndex((step) => step.id === stage));

    return (
        <main
            className="pm-launch-screen"
            role={failed ? 'alert' : 'status'}
            aria-live="polite"
            aria-busy={!failed}
        >
            <div className="pm-launch-glow pm-launch-glow--blue" aria-hidden="true" />
            <div className="pm-launch-glow pm-launch-glow--violet" aria-hidden="true" />
            <div className="pm-launch-glow pm-launch-glow--gold" aria-hidden="true" />

            <section className="pm-launch-panel" aria-label="Preparing PrepMaster">
                <div className="pm-launch-brand" aria-label="PrepMaster">
                    <span className="pm-launch-brand__prep">PREP</span>
                    <span className="pm-launch-brand__master">MASTER</span>
                    <span className="pm-launch-brand__mark" aria-hidden="true" />
                </div>

                <div className="pm-launch-orbit" aria-hidden="true">
                    <span className="pm-launch-orbit__core" />
                    <span className="pm-launch-orbit__ring pm-launch-orbit__ring--outer" />
                    <span className="pm-launch-orbit__ring pm-launch-orbit__ring--inner" />
                    <span className="pm-launch-orbit__spark pm-launch-orbit__spark--blue" />
                    <span className="pm-launch-orbit__spark pm-launch-orbit__spark--gold" />
                </div>

                <div className="pm-launch-copy" key={stage}>
                    <p className="pm-launch-eyebrow">{copy.eyebrow}</p>
                    <h1 className="pm-launch-title">{copy.title}</h1>
                    <p className="pm-launch-detail">{failed ? (error || copy.detail) : copy.detail}</p>
                </div>

                {failed ? (
                    <div className="pm-launch-error-actions">
                        <button type="button" className="pm-launch-retry" onClick={onRetry}>
                            Try verification again
                        </button>
                        <button type="button" className="pm-launch-signout" onClick={onSignOut}>
                            Sign out
                        </button>
                    </div>
                ) : (
                    <div className="pm-launch-steps" aria-label="Startup progress">
                        {LAUNCH_STEPS.map((step, index) => {
                            const complete = index < activeIndex;
                            const current = index === activeIndex;
                            return (
                                <div
                                    className={
                                        'pm-launch-step'
                                        + (complete ? ' is-complete' : '')
                                        + (current ? ' is-current' : '')
                                    }
                                    key={step.id}
                                >
                                    <span className="pm-launch-step__track" aria-hidden="true">
                                        <span className="pm-launch-step__fill" />
                                    </span>
                                    <span className="pm-launch-step__label">{step.label}</span>
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="pm-launch-footnote">
                    <span className="pm-launch-footnote__dot" />
                    <span>{failed ? 'No access level has been assumed.' : 'A secure, account-specific workspace is being prepared.'}</span>
                </div>
            </section>
        </main>
    );
}
