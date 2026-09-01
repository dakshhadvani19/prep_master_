const fs = require('fs');

const mockDataPath = 'd:/C/Projects/First_Using_Antigravity/global-exam-prep/src/data/mockData.js';
const nonEngPath = 'd:/C/Projects/First_Using_Antigravity/global-exam-prep/non_engineering_courses.json';

const mockDataContent = fs.readFileSync(mockDataPath, 'utf8');
const nonEngCourses = JSON.parse(fs.readFileSync(nonEngPath, 'utf8'));

// Categorize courses
const categories = {
    management: [],
    science_pharmacy: [],
    law_arts: []
};

nonEngCourses.forEach(course => {
    const title = course.title.toUpperCase();
    if (title.includes('B.B.A') || title.includes('B.COM') || title.includes('BUSINESS')) {
        if (title.includes('LLB')) {
             categories.law_arts.push(course);
        } else {
             categories.management.push(course);
        }
    } else if (title.includes('PHARM')) {
        categories.science_pharmacy.push(course);
    } else if (title.includes('B.SC') || title.includes('SCIENCE') || title.includes('BS ')) {
        categories.science_pharmacy.push(course);
    } else if (title.includes('LLB') || title.includes('LAW')) {
        categories.law_arts.push(course);
    } else {
        // Default to management if unsure, or skip
        categories.management.push(course);
    }
});

function formatCourse(course) {
    const semesters = Math.max(...course.subjects.map(s => s.sem || 0), 0);
    let str = `      {\n`;
    str += `        id: "${course.id}",\n`;
    str += `        title: "${course.title}",\n`;
    str += `        semesters: ${semesters},\n`;
    str += `        subjects: [\n`;
    
    course.subjects.forEach((s, i) => {
        str += `          {\n`;
        str += `            id: "${s.id}",\n`;
        str += `            title: "${s.title}",\n`;
        str += `            sem: ${s.sem},\n`;
        str += `            exams: ["mid-1", "mid-2", "final"]\n`;
        str += `          }${i < course.subjects.length - 1 || course.scenarios ? ',' : ''}\n`;
    });

    if (course.scenarios) {
        str += `          // Scenarios / Offered Subjects\n`;
        course.scenarios.forEach((s, i) => {
            str += `          {\n`;
            str += `            id: "${s.id}",\n`;
            str += `            title: "${s.title} (Offered/Scenario)",\n`;
            str += `            sem: "Scenario",\n`;
            str += `            exams: ["mid-1", "mid-2", "final"]\n`;
            str += `          }${i < course.scenarios.length - 1 ? ',' : ''}\n`;
        });
    }

    str += `        ]\n`;
    str += `      }`;
    return str;
}

let updatedContent = mockDataContent;

// 1. Update Management
const managementBody = categories.management.map(formatCourse).join(',\n');
updatedContent = updatedContent.replace(
    /"id": "management",\n\s+"title": "Management Studies",\n\s+"icon": "Briefcase",\n\s+"description": ".*",\n\s+"courses": \[[\s\S]*?\n\s+\]/,
    `"id": "management",\n    "title": "Management Studies",\n    "icon": "Briefcase",\n    "description": "BBA & B.Com programs with various specializations.",\n    "courses": [\n${managementBody}\n    ]`
);

// 2. Update Science & Pharmacy
const sciencePharmacyBody = categories.science_pharmacy.map(formatCourse).join(',\n');
updatedContent = updatedContent.replace(
    /"id": "science-pharmacy",\n\s+"title": "Science & Pharmacy",\n\s+"icon": "Beaker",\n\s+"description": ".*",\n\s+"courses": \[[\s\S]*?\n\s+\]/,
    `"id": "science-pharmacy",\n    "title": "Science & Pharmacy",\n    "icon": "Beaker",\n    "description": "B.Pharm and B.Sc programs.",\n    "courses": [\n${sciencePharmacyBody}\n    ]`
);

// 3. Update Law & Arts
const lawArtsBody = categories.law_arts.map(formatCourse).join(',\n');
updatedContent = updatedContent.replace(
    /"id": "law-arts",\n\s+"title": "Law & Arts",\n\s+"icon": "BookOpen",\n\s+"description": ".*",\n\s+"courses": \[[\s\S]*?\n\s+\]/,
    `"id": "law-arts",\n    "title": "Law & Arts",\n    "icon": "BookOpen",\n    "description": "Legal and Liberal Arts programs.",\n    "courses": [\n${lawArtsBody}\n    ]`
);


fs.writeFileSync(mockDataPath, updatedContent);
console.log('Injected non-engineering courses into mockData.js successfully.');
