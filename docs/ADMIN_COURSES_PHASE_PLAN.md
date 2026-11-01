# Admin Courses & Question Management â€” Phase Plan

Last updated: 2026-11-01

## Purpose

Provide administrators with one unrestricted workspace to locate a catalog subject and manage its syllabus and question bank. The route remains /admin/courses and is protected by the existing admin route guard. The existing public Courses and Subjects catalog tables remain the source of truth; this feature does not create parallel course/subject catalogs.

## Phase 1 â€” Hierarchy locator and subject management

Status: **Implemented and verified**

Implemented in global-exam-prep/src/pages/AdminCourses.jsx and AdminCourses.css.

- Department â†’ Course â†’ Semester â†’ Subject navigation.
- All six catalog departments are available; there is no leaderboard completion lock/unlock logic in this admin page.
- Departments use CATALOG_DOMAINS; courses and course semester lists load through fetchCoursesForDomain; subjects and their exact Semester values load through fetchCourseAndSubjects.
- Course search and subject search are supported. Subject search matches both the name and numeric SubjectId.
- Semester values are taken from Courses.Sems, including a legitimate semester value of 0; subject membership is filtered using Subjects.Semester.
- Subject details show canonical SubjectId, CourseId, semester, departmental status and the exam types applicable under subjectExamPolicy.
- Loading, retry, error and empty states are provided.
- Admins can add and edit subjects for an existing CourseId¶»§q«^