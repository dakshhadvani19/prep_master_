import fs from 'fs';

const text = fs.readFileSync('pdf_output.txt', 'utf8');
const courses = [];
let currentCourse = null;
let currentSem = 1;

const lines = text.split('\n');

for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('----')) continue;
    
    if (line.includes('Department - Diploma') || line.includes('Theory Component') || line.includes('Skill Component') || line.includes('Audit Component (Zero Credit)') || line.includes('Skill based Component') || line.includes('Elective') || line.includes('Department Elective')) continue;

    if (line.startsWith('Diploma')) {
        let name = line.replace(/\s+/g, ' ').trim();
        // create course
        let idVal = 'dip-' + name.toLowerCase().replace(/[^a-z]/g, '').substring(7, 12);
        currentCourse = {
            id: idVal,
            title: name,
            semesters: 6,
            subjects: []
        };
        courses.push(currentCourse);
        continue;
    }

    if (line.startsWith('Sem ')) {
        const parts = line.split(' ');
        currentSem = parseInt(parts[1], 10);
        continue;
    }

    // It's a subject line: Mathematics-I(09MA2101)
    if (currentCourse && line.length > 3) {
        // extract subject id from parens
        let subjectName = line;
        let subId = currentCourse.id + '-' + currentCourse.subjects.length;
        
        let match = line.match(/(.+?)\((.*?)\)$/);
        if (match) {
            subjectName = match[1].trim();
            subId = match[2].trim().toLowerCase();
        }

        currentCourse.subjects.push({
            id: subId,
            title: subjectName,
            sem: currentSem,
            exams: ["mid-1", "mid-2", "final"]
        });
    }
}

const diplomaDomain = {
    id: "diploma",
    title: "Diploma Programs",
    icon: "GraduationCap",
    description: "Diploma courses across all engineering fields.",
    courses: courses
};

fs.writeFileSync('diploma_json.json', JSON.stringify(diplomaDomain, null, 2));
console.log("Written to diploma_json.json");
