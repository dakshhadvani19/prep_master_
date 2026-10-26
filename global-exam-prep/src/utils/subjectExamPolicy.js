import { DEFAULT_EXAM_TYPES, examPrompts } from '../data/examPrompts';

const DEPARTMENTAL_EXAM_TYPES = ['mid-1', 'mid-2'];

export function normalizeDepartmentalFlag(value) {
    return value === true || value === 'true';
}

export function getExamTypesForSubject(isDepartmentalSubject) {
    return normalizeDepartmentalFlag(isDepartmentalSubject)
        ? [...DEPARTMENTAL_EXAM_TYPES]
        : [...DEFAULT_EXAM_TYPES];
}

export function getSubjectExamInfo(examType, isDepartmentalSubject, prompts = examPrompts) {
    const base = prompts[examType];
    if (!base) return base;
    if (normalizeDepartmentalFlag(isDepartmentalSubject) && examType === 'mid-1') {
        return {
            ...base,
            title: 'Mid-Term 1 (MCQ / Objective)',
            timeMinutes: 45,
            totalMarks: 30,
            type: 'objective',
            description: 'Departmental Mid-1: exactly 30 multiple-choice questions.',
        };
    }
    return base;
}
