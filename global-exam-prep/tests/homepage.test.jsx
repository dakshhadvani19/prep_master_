/**
 * Homepage + shell smoke test.
 *
 * The homepage is the entry point to authentication, so it is checked with the
 * REAL LandingPage, the REAL Layout shell and the REAL router — nothing is mocked
 * except Supabase itself and `src/firebase.js` (still imported by data layers).
 * It proves the three things the handoff depends on:
 *   1. `/` renders without a runtime error,
 *   2. the auth buttons land on the correct auth screen/tab (email and Google),
 *   3. no link in the homepage or the navbar points at a route that does not
 *      exist — with the one documented exception list, so a new dead link fails.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const holder = vi.hoisted(() => ({ entry: '/' }));

vi.mock('../src/supabase', async () => (await import('./supabaseMock.js')).supabaseModuleMock());
vi.mock('../src/firebase', () => ({
  auth: { currentUser: null }, db: {}, storage: {}, firebaseConfigError: null,
}));
vi.mock('firebase/firestore', () => ({
  doc: (db, ...p) => ({ path: p.join('/') }), collection: (db, ...p) => ({ path: p.join('/') }),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  setDoc: vi.fn(async () => {}), updateDoc: vi.fn(async () => {}), deleteDoc: vi.fn(async () => {}),
  query: vi.fn(), where: vi.fn(), increment: (n) => n, runTransaction: vi.fn(),
  onSnapshot: vi.fn(() => () => {}), serverTimestamp: vi.fn(() => 'ts'),
}));

vi.mock('react-router-dom', async (orig) => {
  const actual = await orig();
  return { ...actual, BrowserRouter: ({ children }) => (
    <actual.MemoryRouter key={holder.entry} initialEntries={[holder.entry]}>{children}</actual.MemoryRouter>) };
});

// Leaf pages the homepage links to: stand-ins are enough, the point is that the
// ROUTER resolves the link (a 404 would render the NotFound page instead).
vi.mock('../src/pages/Dashboard', () => ({ default: () => <div>DASHBOARD</div> }));
vi.mock('../src/pages/ReviewPage', () => ({ default: () => <div>REVIEW</div> }));
vi.mock('../src/pages/SyllabusAdmin', () => ({ default: () => <div>ADMIN</div> }));
vi.mock('../src/pages/ExamPortal', () => ({ default: () => <div>EXAM</div> }));
vi.mock('../src/pages/CourseExplorer', () => ({ default: () => <div>COURSES</div> }));
vi.mock('../src/pages/SearchResults', () => ({ default: () => <div>SEARCH</div> }));
vi.mock('../src/pages/FeedbackPage', () => ({ default: () => <div>FEEDBACK</div> }));
vi.mock('../src/pages/UserGuide', () => ({ default: () => <div>GUIDE</div> }));
vi.mock('../src/pages/SubjectDetails', () => ({ default: () => <div>SUBJECTS</div> }));

const { state, resetSupabaseStub, lastCall } = await import('./supabaseMock.js');
const App = (await import('../src/App.jsx')).default;

/**
 * Every internal destination App.jsx actually serves, plus the two features that
 * are linked from the navbar but not built yet (they must render the friendly 404
 * page, not crash). A new link outside this list means a dead link was added.
 */
const KNOWN = new Set([
  '/', '/signup', '/login', '/register', '/dashboard', '/search', '/feedback', '/guide',
  '/leaderboards', '/subscriptions',
]);

function pathOf(href) {
  return String(href).split('?')[0];
}
function activeTab() {
  const tabs = screen.queryAllByRole('tab');
  const on = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
  return on ? on.textContent.trim() : null;
}

async function at(url) {
  holder.entry = url;
  const view = render(<App />);
  await waitFor(() => expect(view.container.firstChild).toBeTruthy());
  return view;
}

beforeEach(() => {
  cleanup();
  resetSupabaseStub();
  holder.entry = '/';
  sessionStorage.clear();
  localStorage.clear();
  Object.defineProperty(window, 'location', {
    configurable: true, writable: true,
    value: { ...window.location, origin: 'http://localhost:5173', href: 'http://localhost:5173/', assign: vi.fn() },
  });
});

describe('homepage', () => {
  it('renders the real homepage without a runtime error', async () => {
    // Every route is React.lazy + Suspense, so "the chunk actually arrived" is
    // part of what "the homepage loads" means — waiting for the hero copy is the
    // assertion, not a warm-up.
    const { container } = await at('/');
    await waitFor(() => expect(document.body.textContent).toMatch(/syllabus-matched mock examinations/i));
    expect(container.querySelector('.hero-actions')).toBeTruthy();
    expect(container.querySelector('h1')).toBeTruthy();
    // the shell is there too, with both auth entries
    expect(container.querySelector('a[href="/signup?mode=login"]')).toBeTruthy();
    expect(container.querySelector('a[href="/signup?mode=signup"]')).toBeTruthy();
  }, 20000);

  it('"Create Free Account" opens the sign-up tab of the auth screen', async () => {
    await at('/');
    const cta = await screen.findByRole('button', { name: /Create Free Account/i });
    fireEvent.click(cta);
    await waitFor(() => expect(activeTab()).toBe('Create account'));
    // that tab opens on the method picker (SRS flow); the details form is one more
    // click in, so assert the picker, not a form that is not there yet
    expect(screen.getByRole('button', { name: /Continue with Email/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Continue with Email/i }));
    await waitFor(() => expect(document.querySelector('.auth-form input')).toBeTruthy());
  }, 20000);

  it('the homepage Google CTA opens sign-up and starts the Supabase OAuth redirect', async () => {
    await at('/');
    const googleCta = await screen.findByRole('button', { name: /Google/i });
    fireEvent.click(googleCta);

    await waitFor(() => expect(lastCall('signInWithOAuth')).toBeTruthy());
    expect(lastCall('signInWithOAuth').provider).toBe('google');
    expect(lastCall('signInWithOAuth').options.redirectTo).toContain('/signup?mode=signup');
    // and the student is asked to confirm before anything is created
    expect(sessionStorage.getItem('prepmaster_google_signup_pending')).toBe('1');
  }, 20000);

  it('a guest following the shell dashboard link is sent to Log in, not left stranded', async () => {
    await at('/dashboard');
    await waitFor(() => expect(activeTab()).toBe('Log in'));
    expect(screen.queryByText('404')).toBeNull();
  }, 20000);

  it('every link on the homepage and in the navbar points at a route that exists', async () => {
    const { container } = await at('/');
    await waitFor(() => expect(document.body.textContent).toMatch(/syllabus-matched mock examinations/i));
    const hrefs = [...container.querySelectorAll('a[href]')]
      .map((a) => a.getAttribute('href'))
      .filter((h) => h && h.startsWith('/'));

    expect(hrefs.length).toBeGreaterThan(0);
    const dynamic = [/^\/domains\/[^/]+\/courses$/, /^\/courses\/[^/]+\/subjects$/, /^\/exams\/[^/]+\/[^/]+\/[^/]+$/, /^\/review\/[^/]+$/];
    const dead = hrefs.filter((h) => !KNOWN.has(pathOf(h)) && !dynamic.some((re) => re.test(pathOf(h))));
    expect(dead, `links with no matching route: ${dead.join(', ')}`).toEqual([]);

    // the two unbuilt features must degrade to the 404 page, never a crash
    for (const path of ['/leaderboards', '/subscriptions']) {
      cleanup();
      await at(path);
      expect(document.body.textContent).toMatch(/404|Page not found/i);
    }
  }, 20000);

  it('the auth page is reachable by its legacy aliases without a redirect loop', async () => {
    for (const entry of ['/login', '/register', '/signup?mode=login', '/signup?mode=signup']) {
      cleanup();
      await at(entry);
      await waitFor(() => expect(activeTab()).toBeTruthy());
      expect(screen.queryByText('404')).toBeNull();
    }
    // a signed-in student visiting the auth page is bounced to the app, not stuck
    cleanup();
    state.session = { user: { id: 'u1', email: 'raja@x.com', app_metadata: {}, user_metadata: {}, identities: [{ provider: 'email' }] }, access_token: 't' };
    state.profile = {
      student_id: 1, auth_uid: 'u1', full_name: 'Raja', email: 'raja@x.com',
      is_spam: false, role: 'student', created_at: '2026-01-01T00:00:00.000Z',
    };
    await at('/signup?mode=login');
    await waitFor(() => expect(screen.getByText('DASHBOARD')).toBeInTheDocument(), { timeout: 9000 });
  }, 30000);
});
