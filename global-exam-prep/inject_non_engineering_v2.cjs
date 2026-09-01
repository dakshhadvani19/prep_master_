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
        categories.management.push(course);
    }
});

function formatCourse(course) {
    const semesters = Math.max(...course.subjects.map(s => s.sem || 0), 0);
    let str = `      {\n`;
    str += `        "id": "${course.id}",\n`;
    str += `        "title": "${course.title}",\n`;
    str += `        "semesters": ${semesters},\n`;
    str += `        "subjects": [\n`;
    
    course.subjects.forEach((s, i) => {
        str += `          {\n`;
        str += `            "id": "${s.id}",\n`;
        str += `            "title": "${s.title}",\n`;
        str += `            "sem": ${s.sem},\n`;
        str += `            "exams": ["mid-1", "mid-2", "final"]\n`;
        str += `          }${i < course.subjects.length - 1 || course.scenarios ? ',' : ''}\n`;
    });

    if (course.scenarios) {
        str += `          // Scenarios / Offered Subjects\n`;
        course.scenarios.forEach((s, i) => {
            str += `          {\n`;
            str += `            "id": "${s.id}",\n`;
            str += `            "title": "${s.title} (Offered/Scenario)",\n`;
            str += `            "sem": "Scenario",\n`;
            str += `            "exams": ["mid-1", "mid-2", "final"]\n`;
            str += `          }${i < course.scenarios.length - 1 ? ',' : ''}\n`;
        });
    }

    str += `        ]\n`;
    str += `      }`;
    return str;
}

function replaceDomain(content, domainId, newCourses, newDesc) {
    const searchStr = `"id": "${domainId}"`;
    const startIndex = content.indexOf(searchStr);
    if (startIndex === -1) {
        console.error(`Domain ${domainId} not found`);
        return content;
    }

    // Find the opening brace of this domain object
    let objStart = content.lastIndexOf('{', startIndex);
    
    // Find the matching closing brace
    let braceCount = 0;
    let objEnd = -1;
    for (let i = objStart; i < content.length; i++) {
        if (content[i] === '{') braceCount++;
        if (content[i] === '}') braceCount--;
        if (braceCount === 0) {
            objEnd = i + 1;
            break;
        }
    }

    if (objEnd === -1) {
        console.error(`Could not find closing brace for ${domainId}`);
        return content;
    }

    // Get original icon and title
    const originalBlock = content.substring(objStart, objEnd);
    const titleMatch = originalBlock.match(/"title": "(.*?)"/);
    const iconMatch = originalBlock.match(/"icon": "(.*?)"/);
    const title = titleMatch ? titleMatch[1] : "";
    const icon = iconMatch ? iconMatch[1] : "";

    const coursesBody = newCourses.map(formatCourse).join(',\n');
    const newBlock = `  {
    "id": "${domainId}",
    "title": "${title}",
    "icon": "${icon}",
    "description": "${newDesc}",
    "courses": [
${coursesBody}
    ]
  }`;

    return content.substring(0, objStart) + newBlock + content.substring(objEnd);
}

let updated = mockDataContent;
updated = replaceDomain(updated, "management", categories.management, "BBA & B.Com programs with various specializations.");
updated = replaceDomain(updated, "science-pharmacy", categories.science_pharmacy, "B.Pharm and B.Sc programs.");
updated = replaceDomain(updated, "law-arts", categories.law_arts, "Legal and Liberal Arts programs.");

fs.writeFileSync(mockDataPath, updated);
console.log('Injected non-engineering courses into mockData.js successfully with proper block replacement.');
