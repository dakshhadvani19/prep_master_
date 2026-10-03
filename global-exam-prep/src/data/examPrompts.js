/** Exam-type metadata used by the student subject picker. Kept tiny so catalog pages do not import mockData.js. */
export const examPrompts = {
  'mid-1': {
    title: 'Mid-Term 1 (Theory)',
    timeMinutes: 60,
    totalMarks: 30,
    type: 'subjective',
    description: "Strict evaluation reflecting Marwadi University's first internal evaluation covering the initial 40% syllabus.",
  },
  'mid-2': {
    title: 'Mid-Term 2 (MCQ / Objective)',
    timeMinutes: 45,
    totalMarks: 30,
    type: 'objective',
    description: 'High-accuracy objective examination format conforming to university grading patterns.',
  },
  'final': {
    title: 'Final Examination (End Semester Review)',
    timeMinutes: 180,
    totalMarks: 100,
    type: 'subjective',
    description: 'End Semester University Examination (ESUE) mapping exactly to standard university blue-print and weightage.',
  },
};

export const DEFAULT_EXAM_TYPES = ['mid-1', 'mid-2', 'final'];