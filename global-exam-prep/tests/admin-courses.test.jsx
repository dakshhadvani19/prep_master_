import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const catalogMocks = vi.hoisted(() => ({
    fetchCoursesForDomain: vi.fn(),
    fetchCourseAndSubjects: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
    getSession: vi.fn(),
    from: vi.fn(),
    upload: vi.fn(),
    remove: vi.fn(),
}));

vi.mock('../src/supabase.js', () => ({
    supabase: {
        auth: { getSession: supabaseMocks.getSession },
        storage: { from: supabaseMocks.from },
    },
}));

vi.mock('../src/utils/catalogApi', async importOriginal => {
    const actual = await importOriginal();
    return {
        ...actual,
        fetchCoursesForDomain: catalogMocks.fetchCoursesForDomain,
        fetchCourseAndSubjects: catalogMocks.fetchCourseAndSubjects,
    };
});

const AdminCourses = (await import('../src/pages/AdminCourses.jsx')).default;

const course = {
    courseId: 1,
    courseName: 'B.Tech - Computer Engineering',
    sems: [0, 1, 2],
    domainId: 'engineering',
};
const subjects = [
    { subjectId: 101, subjectName: 'Computer Workshop', courseId: 1, sem: 0, isDepartmentalSubject: true },
    { subjectId: 102, subjectName: 'Calculus', courseId: 1, sem: 1, isDepartmentalSubject: false },
    { subjectId: 103, subjectName: 'Computer Programming', courseId: 1, sem: 1, isDepartmentalSubject: false },
    { subjectId: 104, subjectName: 'Machine Learning', courseId: 1, sem: 2, isDepartmentalSubject: false },
];

function renderAdmin() {
    return render(<MemoryRouter><AdminCourses /></MemoryRouter>);
}

beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.getSession.mockResolvedValue({
        data: { session: { access_token: 'admin-token', user: { id: 'admin-user' } } },
        error: null,
    });
    supabaseMocks.from.mockReturnValue({
        upload: supabaseMocks.upload,
        remove: supabaseMocks.remove,
    });
    supabaseMocks.upload.mockResolvedValue({ error: null });
    supabaseMocks.remove.mockResolvedValue({ error: null });
    catalogMocks.fetchCoursesForDomain.mockImplementation(async domainId => ({
        domain: { id: domainId, title: 'Engineering & Technology' },
        courses: domainId === 'engineering' ? [course] : [],
        error: null,
    }));
    catalogMocks.fetchCourseAndSubjects.mockResolvedValue({
        course,
        subjects,
        unmapped: [],
        error: null,
    });
});

describe('admin subject and question locator — Phase 1', () => {
    it('starts with all six departments and does not lock any department', () => {
        renderAdmin();
        expect(screen.getByRole('heading', { name: 'Edit subjects' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Engineering & Technology/ })).toBeEnabled();
        expect(screen.getByRole('button', { name: /Computer Applications/ })).toBeEnabled();
        expect(screen.getByRole('button', { name: /Management Studies/ })).toBeEnabled();
        expect(screen.getByRole('button', { name: /Science & Pharmacy/ })).toBeEnabled();
        expect(screen.getByRole('button', { name: /Law & Arts/ })).toBeEnabled();
        expect(screen.getByRole('button', { name: /Diploma in Engineering/ })).toBeEnabled();
        expect(screen.queryByText(/locked|unlock/i)).not.toBeInTheDocument();
        expect(catalogMocks.fetchCoursesForDomain).not.toHaveBeenCalled();
    });

    it('loads courses for the selected department and filters the course list', async () => {
        renderAdmin();
        fireEvent.click(screen.getByRole('button', { name: /Engineering & Technology/ }));

        await waitFor(() => expect(catalogMocks.fetchCoursesForDomain).toHaveBeenCalledWith('engineering'));
        expect(await screen.findByRole('button', { name: /B.Tech - Computer Engineering/ })).toBeInTheDocument();

        fireEvent.change(screen.getByRole('textbox', { name: 'Search courses' }), { target: { value: 'information technology' } });
        expect(screen.getByText('No courses found')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /B.Tech - Computer Engineering/ })).not.toBeInTheDocument();
    });

    it('uses the selected course semesters, including semester zero, and filters subjects by the exact Semester field', async () => {
        renderAdmin();
        fireEvent.click(screen.getByRole('button', { name: /Engineering & Technology/ }));
        fireEvent.click(await screen.findByRole('button', { name: /B.Tech - Computer Engineering/ }));

        await waitFor(() => expect(catalogMocks.fetchCourseAndSubjects).toHaveBeenCalledWith(1));
        expect(await screen.findByTestId('semester-option-0')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('semester-option-0'));

        expect(await screen.findByRole('tab', { name: 'Add subject' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: 'Remove subject' }));
        expect(screen.getByRole('option', { name: /Computer Workshop · 101/ })).toBeInTheDocument();
        expect(screen.queryByRole('option', { name: /Calculus · 102/ })).not.toBeInTheDocument();
    });

    it('shows the add-subject form after Department → Course → Semester selection', async () => {
        renderAdmin();
        fireEvent.click(screen.getByRole('button', { name: /Engineering & Technology/ }));
        fireEvent.click(await screen.findByRole('button', { name: /B.Tech - Computer Engineering/ }));
        fireEvent.click(await screen.findByTestId('semester-option-1'));

        expect(await screen.findByRole('heading', { name: /Add a subject to B.Tech - Computer Engineering/ })).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: /Subject name/ })).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: /Official subject code/ })).toBeInTheDocument();
        expect(screen.getByLabelText(/Departmental subject/)).toBeInTheDocument();
        expect(screen.getByLabelText(/Subject type/)).toBeInTheDocument();
        expect(screen.getByText(/Syllabus file/)).toBeInTheDocument();
        expect(screen.queryByText(/Question locator|Phase 3/i)).not.toBeInTheDocument();
    });

    it('removes a selected subject through the backend operation and refreshes the live catalog', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ ok: true, subjectId: '103', storageCleanupWarning: false }),
        });
        vi.stubGlobal('fetch', fetchMock);
        renderAdmin();
        fireEvent.click(screen.getByRole('button', { name: /Engineering & Technology/ }));
        fireEvent.click(await screen.findByRole('button', { name: /B.Tech - Computer Engineering/ }));
        fireEvent.click(await screen.findByTestId('semester-option-1'));
        fireEvent.click(await screen.findByRole('tab', { name: 'Remove subject' }));

        fireEvent.change(screen.getByRole('combobox', { name: /Choose subject to remove/ }), { target: { value: '103' } });
        fireEvent.click(screen.getByRole('button', { name: 'Remove subject' }));
        expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        const request = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(request).toMatchObject({ action: 'remove', subjectId: 103, courseId: 1, semester: 1 });
        expect(await screen.findByText('Subject removed from the live catalog.')).toBeInTheDocument();
    });

    it('exposes a retry state when catalog reads fail', async () => {
        catalogMocks.fetchCoursesForDomain.mockResolvedValueOnce({
            domain: { id: 'engineering', title: 'Engineering & Technology' },
            courses: [],
            error: new Error('Catalog request failed'),
        });
        renderAdmin();
        fireEvent.click(screen.getByRole('button', { name: /Engineering & Technology/ }));
        expect(await screen.findByText('Catalog request failed')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
        await waitFor(() => expect(catalogMocks.fetchCoursesForDomain).toHaveBeenCalledTimes(2));
    });

    it('does not expose fake in-memory CRUD or course deletion actions', () => {
        renderAdmin();
        expect(screen.queryByRole('button', { name: /Add Course|Remove Course|Edit Course/ })).not.toBeInTheDocument();
        expect(screen.queryByText(/Preview only/)).not.toBeInTheDocument();
    });
});
