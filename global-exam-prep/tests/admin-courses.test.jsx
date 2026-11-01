import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const catalogMocks = vi.hoisted(() => ({
    fetchCoursesForDomain: vi.fn(),
    fetchCourseAndSubjects: vi.fn(),
    manageAdminSubject: vi.fn(),
}));

vi.mock('../src/utils/catalogApi', async importOriginal => {
    const actual = await importOriginal();
    return {
        ...actual,
        fetchCoursesForDomain: catalogMocks.fetchCoursesForDomain,
        fetchCourseAndSubjects: catalogMocks.fetchCourseAndSubjects,
    };
});

vi.mock('../src/utils/adminSubjectApi.js', () => ({
    manageAdminSubject: catalogMocks.manageAdminSubject,
}));

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
    return render(<MemoryRouter><AdminCo¶»§q«^