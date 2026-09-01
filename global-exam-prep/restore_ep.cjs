const fs = require('fs');
const ep = `

export const examPrompts = {
  'mid-1': {
    title: 'Mid-Term 1 (Theory)',
    timeMinutes: 60,
    totalMarks: 30,
    type: 'subjective',
    description: 'Strict evaluation reflecting Marwadi University\\'s first internal evaluation covering the initial 40% syllabus.'
  },
  'mid-2': {
    title: 'Mid-Term 2 (MCQ / Objective)',
    timeMinutes: 45,
    totalMarks: 30,
    type: 'objective',
    description: 'High-accuracy objective examination format conforming to university grading patterns.'
  },
  'final': {
    title: 'Final Examination (End Semester Review)',
    timeMinutes: 180,
    totalMarks: 100,
    type: 'subjective',
    description: 'End Semester University Examination (ESUE) mapping exactly to standard university blue-print and weightage.'
  }
};`;

const mockPath = 'src/data/mockData.js';
fs.appendFileSync(mockPath, ep);
console.log('Successfully restored examPrompts in mockData.js');
