/** Exam-type metadata used by the student subject picker. Kept tiny so catalog pages do not import mockData.js. */
export const examPrompts = {
  'mid-1': {
    title: 'Mid-Term 1 (Theory)',
    timeMinutes: 60,
    totalMarks: 30,
    type: 'subjective',
    description: "30-mark theory Mid-1 covering the first 50% of the ordered syllabus, with two 1-mark questions and a balanced mix of 4- and 8-mark questions.",
  },
  'mid-2': {
    title: 'Mid-Term 2 (MCQ / Objective)',
    timeMinutes: 45,
    totalMarks: 30,
    type: 'objective',
    description: 'High-accuracy objective examination format conforming to university grading patterns.',
  },
  'final': {
    title: 'Final Examination (ESE — 60 marks)',
    timeMinutes: 180,
    totalMarks: 60,
    type: 'subjective',
    description: '60-mark End Semester Examination: two 1-mark, one 2-mark, four 8-mark and six 4-mark questions, covering the full eligible syllabus.',
  },
};

export const DEFAULT_EXAM_TYPES = ['mid-1', 'mid-2', 'final'];