const fs = require('fs');

const txt = fs.readFileSync('pdf_output_76_plus_new.txt', 'utf8');
const lines = txt.split('\n');

const courses = [];
let currentCourse = null;
let currentSem = null;
let currentSubjects = [];
let scenarioSubjects = [];

function finalizeSem() {
    if (currentSem && currentSubjects.length > 0) {
        currentCourse.subjects.push(...currentSubjects);
    }
    currentSubjects = [];
}

function finalizeCourse() {
    finalizeSem();
    if (currentCourse) {
        if (scenarioSubjects.length > 0) {
            currentCourse.scenarios = scenarioSubjects;
        }
        courses.push(currentCourse);
    }
    scenarioSubjects = [];
}

lines.forEach(line => {
    const t = line.trim();
    if (t.includes('----------------Page') || t.includes('Break')) return;
    if (t.length === 0) return;

    // Detect Course Start (B.B.A, B.Com, Pharmacy, etc.)
    // We look for patterns like "B.B.A" or "B.Com" or specific headers
    if ((t.startsWith('B.') && (t.includes('B.A') || t.includes('Com') || t.includes('Phar') || t.includes('LLB'))) || 
        t === 'BACHELOR OF COMMERCE' || t === 'BACHELOR OF BUSINESS ADMINISTRATION') {
        finalizeCourse();
        currentCourse = {
            id: t.toLowerCase().replace(/[^a-z]/g, '-'),
            title: t,
            subjects: []
        };
        currentSem = null;
    }

    // Detect Semester
    const semMatch = t.match(/Sem\s+(\d+)/i);
    if (semMatch) {
        finalizeSem();
        currentSem = parseInt(semMatch[1]);
    }

    // Detect Offered/Scenario Subjects
    if (t.includes('Following Subjects offered') || t.includes('Offered to this student')) {
        finalizeSem();
        currentSem = 99; // Special marker for scenarios
    }

    // Detect Subjects (usually have a code in brackets)
    const codeMatch = t.match(/(.*?)\s?\((.*?)\)/);
    if (codeMatch && currentCourse) {
        const subject = {
            id: codeMatch[2].toLowerCase(),
            title: codeMatch[1].trim(),
            sem: currentSem || 1,
            exams: ["mid-1", "mid-2", "final"]
        };
        
        if (currentSem === 99) {
            scenarioSubjects.push(subject);
        } else {
            currentSubjects.push(subject);
        }
    }
});

finalizeCourse();

fs.writeFileSync('non_engineering_courses.json', JSON.stringify(courses, null, 2));
console.log('Saved parsed non-engineering courses to non_engineering_courses.json');
