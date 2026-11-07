import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    navigateBackOrHome,
    navigateToRoleHome,
    readSubjectSelection,
    mergeSubjectSelectionState,
    resolveAuthReturnTarget,
} from '../src/utils/navigation.js';

describe('safe route navigation', () => {
    beforeEach(() => {
        window.history.replaceState({ idx: 0, key: 'initial' }, '', '/');
    });

    it('uses the previous in-app history entry when one exists', () => {
        window.history.replaceState({ idx: 2, key: 'previous-route' }, '', '/courses/44/subjects');
        const navigate = vi.fn();

        expect(navigateBackOrHome(navigate, false)).toBe(true);
        expect(navigate).toHaveBeenCalledTimes(1);
        expect(navigate).toHaveBeenCalledWith(-1);
    });

    it('returns students to the homepage on a direct route entry', () => {
        const navigate = vi.fn();

        expect(navigateBackOrHome(navigate, false)).toBe(false);
        expect(navigate).toHaveBeenCalledTimes(1);
        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    });

    it('returns admins to their dashboard on a direct route entry', () => {
        const navigate = vi.fn();

        expect(navigateBackOrHome(navigate, true)).toBe(false);
        expect(navigate).toHaveBeenCalledTimes(1);
        expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    });

    it('falls back safely when React Router history metadata is missing', () => {
        window.history.replaceState({}, '', '/deep-link');
        const navigate = vi.fn();

        expect(navigateBackOrHome(navigate, false)).toBe(false);
        expect(navigate).toHaveBeenCalledTimes(1);
        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    });
});

describe('authentication return routes', () => {
    it('preserves a protected deep link query, hash and route state', () => {
        const routeState = { selectedTab: 'history' };

        expect(resolveAuthReturnTarget({
            pathname: '/leaderboards',
            search: '?department=diploma&courseId=44',
            hash: '#rankings',
            state: routeState,
        })).toEqual({
            path: '/leaderboards?department=diploma&courseId=44#rankings',
            state: routeState,
        });
    });

    it('supports direct sign-in links that provide a path string', () => {
        expect(resolveAuthReturnTarget('/feedback')).toEqual({
            path: '/feedback',
            state: null,
        });
    });

    it('uses the dashboard for missing or unsafe return locations', () => {
        expect(resolveAuthReturnTarget(null)).toEqual({ path: '/dashboard', state: null });
        expect(resolveAuthReturnTarget('//example.com')).toEqual({ path: '/dashboard', state: null });
    });
});


describe('navigation return targets and lightweight exam progress', () => {
    beforeEach(() => {
        window.history.replaceState({ idx: 0, key: 'initial' }, '', '/');
    });

    it('restores an explicit source route when there is no earlier history entry', () => {
        const navigate = vi.fn();
        const state = { subjectSelection: { courseId: '44', semester: 6, subjectId: '601' } };

        expect(navigateBackOrHome(navigate, false, {
            returnTo: { path: '/courses/44/subjects', state },
        })).toBe(false);
        expect(navigate).toHaveBeenCalledWith('/courses/44/subjects', {
            replace: true,
            state,
        });
    });

    it('rejects an external return target and falls back to the role home', () => {
        const navigate = vi.fn();

        navigateBackOrHome(navigate, false, {
            returnTo: { path: '//outside.example/redirect' },
        });

        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    });

    it('uses an in-app history entry before the explicit return target', () => {
        window.history.replaceState({ idx: 1 }, '', '/exams/601/mid-1/medium');
        const navigate = vi.fn();

        navigateBackOrHome(navigate, false, {
            returnTo: { path: '/courses/44/subjects' },
        });

        expect(navigate).toHaveBeenCalledWith(-1);
    });

    it('always sends the student Performance History back to the landing page', () => {
        const navigate = vi.fn();

        expect(navigateToRoleHome(navigate, false)).toBe('/');
        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    });

    it('always sends an admin to the dashboard home', () => {
        const navigate = vi.fn();

        expect(navigateToRoleHome(navigate, true)).toBe('/dashboard');
        expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    });

    it('stores only small selection values and restores them for the matching course', () => {
        const priorState = { source: 'catalog', unrelatedFlag: true };
        const nextState = mergeSubjectSelectionState(priorState, 44, {
            semester: '6',
            subjectId: 601,
            examType: 'mid-1',
            mode: 'auto',
            difficulty: 'hard',
        });

        expect(nextState.source).toBe('catalog');
        expect(nextState.unrelatedFlag).toBe(true);
        expect(nextState.subjectSelection).toEqual({
            courseId: '44',
            semester: 6,
            subjectId: '601',
            examType: 'mid-1',
            mode: 'auto',
            difficulty: 'hard',
        });
        expect(readSubjectSelection(nextState, '44')).toEqual(nextState.subjectSelection);
        expect(readSubjectSelection(nextState, 'another-course')).toBeNull();
        expect(JSON.stringify(nextState)).not.toMatch(/questions|syllabus|fileContents/i);
    });

    it('sanitizes invalid saved selection values', () => {
        const restored = readSubjectSelection({
            subjectSelection: {
                courseId: '44',
                semester: 'not-a-semester',
                subjectId: null,
                examType: 'x'.repeat(100),
                mode: 'unknown',
                difficulty: 'extreme',
            },
        }, '44');

        expect(restored).toEqual({
            courseId: '44',
            semester: null,
            subjectId: null,
            examType: null,
            mode: null,
            difficulty: 'medium',
        });
    });
});
