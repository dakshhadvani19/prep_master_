/**
 * Navigation helpers shared by student and administrator routes.
 */

function isSafeInternalPath(path) {
    return typeof path === 'string'
        && path.startsWith('/')
        && !path.startsWith('//');
}

/**
 * Prefer an earlier in-app route. When a route was opened directly and there
 * is no usable history entry, an explicit lightweight return target can still
 * restore the screen that launched it.
 */
export function navigateBackOrHome(navigate, isAdmin = false, options = {}) {
    const returnTo = options?.returnTo ?? null;
    const historyIndex = typeof window !== 'undefined'
        ? window.history?.state?.idx
        : null;

    if (Number.isInteger(historyIndex) && historyIndex > 0) {
        navigate(-1);
        return true;
    }

    if (returnTo && isSafeInternalPath(returnTo.path)) {
        navigate(returnTo.path, {
            replace: true,
            state: returnTo.state ?? null,
        });
        return false;
    }

    navigateToRoleHome(navigate, isAdmin);
    return false;
}

/**
 * Some screens have a fixed semantic destination and should not depend on
 * whichever page happens to be behind them in browser history.
 */
export function navigateToRoleHome(navigate, isAdmin = false) {
    const path = isAdmin ? '/dashboard' : '/';
    navigate(path, { replace: true });
    return path;
}

function normalizeSubjectSelection(selection, courseId) {
    const semesterValue = selection?.semester;
    const semester = semesterValue === null || semesterValue === undefined || semesterValue === ''
        ? null
        : Number(semesterValue);
    const subjectId = selection?.subjectId === null || selection?.subjectId === undefined || selection?.subjectId === ''
        ? null
        : String(selection.subjectId);
    const examType = typeof selection?.examType === 'string' && selection.examType.length <= 64
        ? selection.examType
        : null;
    const mode = ['auto', 'upload'].includes(selection?.mode) ? selection.mode : null;
    const difficulty = ['easy', 'medium', 'hard'].includes(selection?.difficulty)
        ? selection.difficulty
        : 'medium';

    return {
        courseId: String(courseId),
        semester: Number.isInteger(semester) ? semester : null,
        subjectId,
        examType,
        mode,
        difficulty,
    };
}

/** Read a small subject-selection snapshot from a matching course history entry. */
export function readSubjectSelection(locationState, courseId) {
    const saved = locationState?.subjectSelection;
    if (!saved || typeof saved !== 'object' || String(saved.courseId) !== String(courseId)) {
        return null;
    }

    return normalizeSubjectSelection(saved, courseId);
}

/**
 * Merge IDs and option values into route state without discarding unrelated
 * metadata. Generated questions, files and syllabus content are never stored.
 */
export function mergeSubjectSelectionState(locationState, courseId, selection) {
    const safeState = locationState && typeof locationState === 'object' && !Array.isArray(locationState)
        ? locationState
        : {};

    return {
        ...safeState,
        subjectSelection: normalizeSubjectSelection(selection, courseId),
    };
}

/**
 * Restore the complete route that sent a visitor to Signup. ProtectedRoute
 * passes a React Router Location object; direct sign-in actions pass a path.
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
        path: from.pathname + search + hash,
        state: from.state ?? null,
    };
}
