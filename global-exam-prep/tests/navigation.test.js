import { beforeEach, describe, expect, it, vi } from 'vitest';
import { navigateBackOrHome, resolveAuthReturnTarget } from '../src/utils/navigation.js';

describe('safe route navigation', () => {
    beforeEach(() => {
        window.history.replaceState({ idx: 0, key: 'initial' }, '', '/');
    });

    it('uses the previous in-app history entry when one exists', () => {
        window.history.replaceState({ idx: 2, key: 'previous-route' }, '', '/courses/44/subjects');
        const navigate = vi.fn();

        expect(navigateBackOrHome(navigate, false)).toBe(true);
        expect(navigate).toHaveBeenCalledExactlyOnceWith(-1);
    });

    it('returns students to the homepage on a direct route entry', () => {
        const navigate = vi.fn();

        expect(navigateBackOrHome(navigate, false)).toBe(false);
        expect(navigate).toHaveBeenCalledExactlyOnceWith('/', { replace: true });
    });

    it('returns admins to their dashboard on a direct route entry', () => {
        const navigate = vi.fn();

        expect(navigateBackOrHome(navigate, true)).toBe(false);
        expect(navigate).toHaveBeenCalledExactlyOnceWith('/dashboard', { replace: true });
    });

    it('falls back safely when React Router history metadata is missing', () => {
        window.history.replaceState({}, '', '/deep-link');
        const navigate = vi.fn();

        expect(navigateBackOrHome(navigate, false)).toBe(false);
        expect(navigate).toHaveBeenCalledExactlyOnceWith('/', { replace: true });
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
