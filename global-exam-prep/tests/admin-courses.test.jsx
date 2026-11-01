import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const catalogMocks = vi.hoisted(() => ({
    fetchCoursesForDomain: vi.fn(),
    fetchCourseAndSubjects: vi.fn(),
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
        expect(screen.getByRole('heading', { name: 'Subject & Question Locator' })).toBeInTheDocument();
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

        expect(await screen.findByRole('button', { name: /Computer Workshop/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Calculus/ })).not.toBeInTheDocument();
    });

    it('locates a subject by name or Subject ID and shows its actual catalog identity and exam policy', async () => {
        renderAdmin();
        fireEvent.click(screen.getByRole('button', { name: /Engineering & Technology/ }));
        fireEvent.click(await screen.findByRole('button', { name: /B.Tech - Computer Engineering/ }));
        fireEvent.click(await screen.findByTestId('semester-option-1'));

        fireEvent.change(await screen.findByRole('textbox', { name: 'Search subjects' }), { target: { value: '103' } });
        const subjectButton = await screen.findByRole('button', { name: /Computer Programming/ });
        fireEvent.click(subjectButton);

        expect(screen.getByRole('heading', { name: 'Computer Programming' })).toBeInTheDocument();
        expect(screen.getByText('103')).toBeInTheDocument();
        expect(screen.getAllByText('1', { selector: 'dd' })).toHaveLength(2);
        expect(screen.getAllByText('Non-departmental')).toHaveLength(2);
        expect(screen.getByText('Final Examination (ESE)')).toBeInTheDocument();
        expect(screen.getByText('Mid-Term 1 (Theory)')).toBeInTheDocument();
        expect(screen.getByText('Mid-Term 2 (MCQ / Objective)')).toBeInTheDocument();
    });

    it('shows the question-bank linkage limitation instead of attributing unlinked TestsData rows to a subject', async () => {
        renderAdmin();
        fireEvent.click(screen.getByRole('button', { name: /Engineering & Technology/ }));
        fireEvent.click(await screen.findByRole('button', { name: /B.Tech - Computer Engineering/ }));
        fireEvent.click(await screen.findByTestId('semester-option-1'));
        fireEvent.click(await screen.findByRole('button', { name: /Calculus/ }));

        expect(screen.getByRole('heading', { name: 'Question locator' })).toBeInTheDocument();
        expect(screen.getByText(/do not carry Course ID, Subject ID or Semester/i)).toBeInTheDocument();
        expect(screen.getByText(/canonical question-bank index/i)).toBeInTheDocument();
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
