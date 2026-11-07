/**
 * Navigation helpers shared by student and administrator routes.
 */

/**
 * Go back only when React Router has an earlier in-app history entry.
 * A direct deep link / newly opened tab has index 0 and should return to the
 * correct role home instead of doing nothing or leaving the application.
 */
export function navigateBackOrHome(navigate, isAdmin = false) {
    const historyIndex = typeof window !== 'undefined'
        ? window.history?.state?.idx
        : null;

    if (Number.isInteger(historyIndex) && historyIndex > 0) {
        navigate(-1);
        return true;
    }

    navigate(isAdmin ? '/dashboard' : '/', { replace: true });
    return false;
}

function isSafeInternalPath(path) {
    return typeof path === 'string'
        && path.startsWith('/')
        && !path.startsWith('//');
}

/**
 * Restore the complete route that sent a visitor to Signup.
 * ProtectedRoute passes a React Router Location object; a few direct sign-in
 * actions pass a simple path string. Keep query filters, hashes and route state.
 */
export function resolveAuthReturnTarget(from) {
    if (typeof from === 'string') {
        return isSafeInternalPath(from)
            ? { path: from, state: null }
            : { path: '/dashboard', state: null };
    }

    if (!from || typeof from !== 'object' || !isSafeInternalPath(from.pathname)) {
        return { path: '/dashboard', state: null };
    }

    const search = typeof from.search === 'string' && from.search.startsWith('?')
        ? from.search
        : '';
    const hash = typeof from.hash === 'string' && from.hash.startsWith('#')
        ? from.hash
        : '';

    return {
        path: `${from.pathname}${search}${hash}`,
        state: from.state ?? null,
    };
}
