import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    AlertCircle, ArrowLeft, BookOpen, Check, ChevronRight, Cpu, GraduationCap,
    Layers3, LayoutGrid, BriefcaseBusiness, FlaskConical, Scale, Search, RefreshCw, X,
    Pencil, Plus, Trash2, Save,
} from 'lucide-react';
import { CATALOG_DOMAINS, fetchCourseAndSubjects, fetchCoursesForDomain, resetCatalogCache } from '../utils/catalogApi';
import { getExamTypesForSubject, getSubjectExamInfo } from '../utils/subjectExamPolicy';
import AdminCourseUploads from '../components/AdminCourseUploads.jsx';
import { manageAdminSubject } from '../utils/adminSubjectApi.js';
import './AdminCourses.css';

const DOMAIN_ICONS = {
    engineering: Cpu,
    'computer-apps': LayoutGrid,
    management: BriefcaseBusiness,
    'science-pharmacy': FlaskConical,
    'law-arts': Scale,
    diploma: GraduationCap,
};
const STEPS = [
    { id: 'department', label: 'Department' },
    { id: 'course', label: 'Course' },
    { id: 'semester', label: 'Semester' },
    { id: 'subject', label: 'Subject' },
];

function normalizeSemesterList(values) {
    if (!Array.isArray(values)) return [];
    return [...new Set(values.map(Number).filter(Number.isInteger).filter(value => value >= 0 && value <= 20))]
        .sort((a, b) => a - b);
}

function StageHeading({ eyebrow, title, description, count }) {
    return (
        <div className="ac-stage-heading">
            <div>
                <span className="a¶»§q«^