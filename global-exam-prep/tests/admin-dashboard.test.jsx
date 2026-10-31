/**
 * Phase 2 — admin UI shell, role-aware nav, Admin Dashboard.
 *
 * Real App + real Layout + real AdminDashboard / AdminCourses. Leaf student
 * pages are stubbed. Role still comes only from public.admins via AuthContext.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';

vi.mock('../src/supabase', async () => (await import('./supabaseMock.js')).supabaseModuleMock());
const holder = { entry: '/' };

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    BrowserRouter: ({ children }) => (
      <actual.MemoryRouter key={holder.entry} initialEntries={[holder.entry]}>
        {children}
      </actual.MemoryRouter>
    ),
  };
});

vi.mock('../src/pages/LandingPage', () => ({ default: () => <div>LANDING</div> }));
vi.mock('../src/pages/Dashboard', () => ({ default: () => <div>STUDENT DASHBOARD</div> }));
vi.mock('../src/pages/SyllabusAdmin', () => ({ default: () => <div>ADMIN SYLLABUS</div> }));
vi.mock('../src/pages/ExamPortal', () => ({ default: () => <div>EXAM</div> }));
vi.mock('../src/pages/ReviewPage', () => ({ default: () => <div>REVIEW</div> }));
vi.mock('../src/pages/Signup', () => ({ default: () => <div>SIGNUP</div> }));

const { state, resetSupabaseStub, makeSession, authUser, studentRow, adminRow } =
  await import('./supabaseMock.js');
const App = (await import('../src/App.jsx')).default;

function signedInAs({ uid, email, staff, fullName }) {
  state.session = makeSession(authUser({ id: uid, email }));
  if (staff) {
    state.adminRow = adminRow({
      auth_uid: uid, email, full_name: fullName,
      is_super_admin: staff === 'super',
    });
  } else {
    state.profile = studentRow({ auth_uid: uid, email, full_name: fullName });
  }
}

async function at(url) {
  holder.entry = url;
  const view = render(<App />);
  await waitFor(() => expect(view.container.firstChild).toBeTruthy());
  return view;
}

function navLabels() {
  return [...document.querySelectorAll('.nav-desktop a')]
    .map((a) => a.textContent.trim())
    .filter(Boolean);
}

beforeEach(() => {
  cleanup();
  resetSupabaseStub();
  holder.entry = '/';
  sessionStorage.clear();
  localStorage.clear();
});

describe('unauthenticated visitor', () => {
  it('keeps Home and Subscriptions in the navbar', async () => {
    await at('/');
    await waitFor(() => expect(screen.getByText('LANDING')).toBeInTheDocument());
    const labels = navLabels();
    expect(labels).toContain('Home');
    expect(labels).toContain('Subscriptions');
    expect(labels).not.toContain('Courses');
    expect(document.querySelector('a[href="/"]')).toBeTruthy();
    expect(document.querySelector('a[href="/subscriptions"]')).toBeTruthy();
  });
});

describe('student', () => {
  it('keeps Home / Subscriptions and the student dashboard', async () => {
    signedInAs({ uid: 's1', email: 's@x.com', fullName: 'Student One' });
    await at('/dashboard');
    await waitFor(() => expect(screen.getByText('STUDENT DASHBOARD')).toBeInTheDocument());
    const labels = navLabels();
    expect(labels).toContain('Home');
    expect(labels).toContain('Subscriptions');
    expect(labels).not.toContain('Courses');
    expect(screen.queryByText('Admin control center')).toBeNull();
    expect(screen.queryByText('Add Admin')).toBeNull();
  });

  it('cannot open the admin Courses catalog', async () => {
    signedInAs({ uid: 's1', email: 's@x.com', fullName: 'Student One' });
    await at('/admin/courses');
    await waitFor(() => expect(screen.getByText('STUDENT DASHBOARD')).toBeInTheDocument());
    expect(screen.queryByText('Catalog')).toBeNull();
    expect(screen.queryByRole('button', { name: /Add Course/i })).toBeNull();
  });
});

describe('standard admin', () => {
  it('replaces Home→Dashboard and Subscriptions→Courses, lands on Admin Dashboard', async () => {
    signedInAs({ uid: 'a1', email: 'a@x.com', fullName: 'Admin One', staff: 'admin' });
    await at('/dashboard');
    await waitFor(() => expect(screen.getByText('Admin control center')).toBeInTheDocument());
    expect(screen.getByText('Standard Admin')).toBeInTheDocument();
    expect(screen.getByText('Student feedback')).toBeInTheDocument();
    expect(screen.getByText('Spam users')).toBeInTheDocument();
    expect(screen.getByText('Leaderboard & ranking')).toBeInTheDocument();
    expect(screen.queryByText('STUDENT DASHBOARD')).toBeNull();
    expect(screen.queryByText('Add Admin')).toBeNull();
    expect(screen.queryByText('Remove Admin')).toBeNull();
    expect(screen.queryByText('Add Super Admin')).toBeNull();

    const labels = navLabels();
    expect(labels).toContain('Dashboard');
    expect(labels).toContain('Courses');
    expect(labels).toContain('Leaderboards');
    expect(labels).toContain('Feedback');
    expect(labels).not.toContain('Home');
    expect(labels).not.toContain('Subscriptions');
  });

  it('loads student feedback once and supports compact preview, expansion, and all four moderation actions', async () => {
    signedInAs({ uid: 'a1', email: 'a@x.com', fullName: 'Admin One', staff: 'admin' });
    state.feedbackRows = [{
      feedbackId: 91,
      description: 'The new exam attempt page loads quickly but the timer sometimes freezes when I switch between questions and return to the earlier section during practice.',
      type: 'bug',
      isSpam: false,
      isBookmark: false,
      isSeen: false,
      studentId: 4205,
      studentName: 'Student Example',
      studentIsSpam: false,
    }];

    await at('/dashboard');
    await waitFor(() => expect(screen.getByText('Student feedback')).toBeInTheDocument());
    expect(await screen.findByText(/The new exam attempt page loads quickly but the timer sometimes freezes when I switch…/)).toBeInTheDocument();
    expect(screen.getByText('Student Example')).toBeInTheDocument();
    expect(screen.getByText('Student ID: 4205')).toBeInTheDocument();
    expect(screen.queryByText(/Feedback ID/i)).toBeNull();
    expect(screen.queryByText(/between questions and return to the earlier section/)).toBeNull();

    expect(state.calls.filter((call) => call.fn === 'admin_get_feedback_dashboard')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Review full feedback' }));
    expect(screen.getByText(/between questions and return to the earlier section during practice/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));

    async function openActions() {
      fireEvent.click(screen.getByRole('button', { name: 'Feedback actions' }));
      return screen.getByRole('group', { name: 'Feedback actions' });
    }

    const firstMenu = await openActions();
    expect(firstMenu.querySelectorAll('button')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Bookmark feedback' }));
    await waitFor(() => expect(screen.getByText('Bookmarked')).toBeInTheDocument());

    await openActions();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as seen' }));
    await waitFor(() => expect(screen.getByText('Seen')).toBeInTheDocument());

    await openActions();
    fireEvent.click(screen.getByRole('button', { name: 'Mark feedback as spam' }));
    await waitFor(() => expect(screen.getByText('Spam')).toBeInTheDocument());

    await openActions();
    fireEvent.click(screen.getByRole('button', { name: 'Mark student as spam' }));
    await waitFor(() => expect(screen.getByText('1 flagged')).toBeInTheDocument());

    expect(state.calls.filter((call) => call.fn === 'admin_update_feedback_flag').map((call) => call.args.p_action))
      .toEqual(['bookmark', 'seen', 'spam']);
    expect(state.calls.filter((call) => call.fn === 'admin_mark_student_spam')).toHaveLength(1);
    expect(state.spamStudents).toEqual([{ studentId: 4205, studentName: 'Student Example' }]);
  });

  it('has no Home page — / redirects to the Admin Dashboard', async () => {
    signedInAs({ uid: 'a1', email: 'a@x.com', fullName: 'Admin One', staff: 'admin' });
    await at('/');
    await waitFor(() => expect(screen.getByText('Admin control center')).toBeInTheDocument());
    expect(screen.queryByText('LANDING')).toBeNull();
  });

  it('opens Courses for an admin without writing to public.admins', async () => {
    signedInAs({ uid: 'a1', email: 'a@x.com', fullName: 'Admin One', staff: 'admin' });
    await at('/admin/courses');
    await waitFor(() => expect(screen.getByText('Catalog')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Add Course/i })).toBeInTheDocument();
    expect(state.calls.filter((c) => c.table === 'admins' && c.op !== 'select')).toHaveLength(0);
  });
});

describe('super admin', () => {
  it('sees the same admin nav plus Add / Remove / Add Super Admin', async () => {
    signedInAs({ uid: 'r1', email: 'root@x.com', fullName: 'Root', staff: 'super' });
    await at('/dashboard');
    await waitFor(() => expect(screen.getByText('Add Admin')).toBeInTheDocument());
    expect(screen.getAllByText('Super Admin').length).toBeGreaterThan(0);
    expect(screen.getByText('Add Admin')).toBeInTheDocument();
    expect(screen.getByText('Remove Admin')).toBeInTheDocument();
    expect(screen.getByText('Add Super Admin')).toBeInTheDocument();
    const labels = navLabels();
    expect(labels).toContain('Dashboard');
    expect(labels).toContain('Courses');
    expect(labels).not.toContain('Home');
  });

  it('staff modals do not write public.admins, even on confirm', async () => {
    signedInAs({ uid: 'r1', email: 'root@x.com', fullName: 'Root', staff: 'super' });
    await at('/dashboard');
    await waitFor(() => expect(screen.getByText('Add Admin')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Add Admin'));
    fireEvent.change(screen.getByLabelText(/Full name/i), { target: { value: 'New Person' } });
    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'n@x.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirm \(preview\)/i }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Staff added|account yet|not applied|Super Admin/i));
    expect(state.calls.some((c) => c.fn === 'manage_admin_staff' || c.name === 'rpc:manage_admin_staff')).toBe(true);
    expect(state.calls.some((c) => c.table === 'admins' && c.op !== 'select')).toBe(false);
  });

  it('a students.role of admin plus localStorage cannot reveal Super Admin controls', async () => {
    signedInAs({ uid: 's9', email: 'forged@x.com', fullName: 'Forged' });
    state.profile = studentRow({ auth_uid: 's9', email: 'forged@x.com', role: 'admin' });
    localStorage.setItem('isAdmin', 'true');
    localStorage.setItem('role', 'superAdmin');
    await at('/dashboard');
    await waitFor(() => expect(screen.getByText('STUDENT DASHBOARD')).toBeInTheDocument());
    expect(screen.queryByText('Add Admin')).toBeNull();
    expect(screen.queryByText('Admin control center')).toBeNull();
  });
});
