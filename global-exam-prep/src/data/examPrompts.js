import { EXAM_BLUEPRINTS } from './examBlueprints.js';

/** Exam-type metadata used by the student subject picker and exam screens. */
export const examPrompts = {
  'mid-1': {
    title: 'Mid-Term 1 (Theory)',
    timeMinutes: EXAM_BLUEPRINTS.mid1.timeMinutes,
    totalMarks: EXAM_BLUEPRINTS.mid1.totalMarks,
    type: EXAM_BLUEPRINTS.mid1.type,
    description: '30M theory Mid-1: questions 1 and 2 are 1M each; the remaining questions alternate 4M and 8M (three 4M, two 8M), covering the first 50% of the ordered syllabus.',
  },
  'mid-2': {
    title: 'Mid-Term 2 (MCQ / Objective)',
    timeMinutes: EXAM_BLUEPRINTS.mid2.timeMinutes,
    totalMarks: EXAM_BLUEPRINTS.mid2.totalMarks,
    type: EXAM_BLUEPRINTS.mid2.type,
    description: '30M objective examination with exactly 30 single-mark MCQs.',
  },
  'final': {
    title: 'Final Examination (ESE)',
    timeMinutes: EXAM_BLUEPRINTS.ese.timeMinutes,
    totalMarks: EXAM_BLUEPRINTS.ese.totalMarks,
    type: EXAM_BLUEPRINTS.ese.type,
    description: '60M End Semester Examination: two opening 1M questions, one 2M question, six 4M questions and four 8M questions. The first two answers must each be one word or one concise sentence.',
  },
};

export const DEFAULT_EXAM_TYPES = ['mid-1', 'mid-2', 'final'];
