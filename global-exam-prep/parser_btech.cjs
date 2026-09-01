const fs = require('fs');

const lines = fs.readFileSync('pdf_output.txt', 'utf8').split('\n');

const courses = [];
let currentCourse = null;
let currentSem = null;

const btechKeywords = ["B tech in", "BS in", "BS / B . tech in", "B . tech in"];
const ignoreKeywords = [
    "Elective", 
    "Department Elective", 
    "Professional Elective", 
    "Program Elective", 
    "Open Elective", 
    "Institute Elective",
    "Skill based Component",
    "Theory Component",
    "Audit Component",
    "Core Courses",
    "Skill Component"
];

const courseTitleMap = {
    "Computer Engineering": "btech-ce",
    "IT": "btech-it",
    "Electrical Engineering": "btech-electrical",
    "AI/ML": "btech-aiml",
    "AI/Data science": "btech-aids",
    "BioInformatics": "btech-bioinfo",
    "ICT": "btech-ict",
    "Mechanical Engineering": "btech-mechanical",
    "Civil Engineering": "btech-civil",
    "Information and Communication Technology": "btech-ict"
};

let inBTech = false;

for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    if (line.includes("Page (") && line.includes("Break")) continue;

    // Detect Course Start
    let foundCourse = false;
    for (const kw of btechKeywords) {
        if (line.toLowerCase().includes(kw.toLowerCase())) {
            inBTech = true;
            let title = line.replace(new RegExp(kw, 'i'), '').trim();
            // Clean up title
            title = title.replace(/^in\s+/i, '').trim();
            
            let id = courseTitleMap[title] || `btech-${title.toLowerCase().replace(/[^a-z0-h]/g, '')}`;
            
            // Special handling for common names
            if (title.toLowerCase().includes("computer engineering")) id = "btech-ce";
            if (title.toLowerCase().includes("information technology") || title.toLowerCase() === "it") id = "btech-it";
            
            currentCourse = {
                id: id,
                title: "B.Tech - " + title,
                subjects: []
            };
            courses.push(currentCourse);
            currentSem = null;
            foundCourse = true;
            break;
        }
    }
    if (foundCourse) continue;

    if (!inBTech) {
        // Only start B.Tech parsing after the first B.Tech keyword is found
        // or if we detect "B tech" section starts.
        // The first B.Tech starts at line 332 in the file.
        continue;
    }

    // Detect Semester
    if (line.toLowerCase().startsWith("sem ")) {
        currentSem = parseInt(line.split(' ')[1]);
        continue;
    }

    if (currentCourse && currentSem) {
        // Check if it's an elective placeholder or keyword to skip
        const isIgnore = ignoreKeywords.some(kw => line.toLowerCase().includes(kw.toLowerCase()));
        
        // However, if the line has a subject code (XXXX), we might want to keep it?
        // But the user said "except that text like Elective... cuz those are not subjects".
        // Lines like "Department Elective – 1(01CE05XX/ 01IT05XX)" should be skipped.
        // Real subjects have real codes like (01CE1101).
        
        if (isIgnore && (line.includes("XX") || !/\(\d{2}[A-Z]{2}\d{4}\)/.test(line))) {
            continue;
        }

        // Subject format: Name (Code)
        const match = line.match(/(.+?)\s*\((.+?)\)/);
        if (match) {
            const title = match[1].trim();
            const code = match[2].trim();
            
            // Final check on title for ignore keywords just in case regex was too broad
            const isActualIgnore = ignoreKeywords.some(kw => title.toLowerCase() === kw.toLowerCase());
            if (isActualIgnore) continue;

            const subject = {
                id: code.toLowerCase(),
                title: title,
                sem: currentSem,
                exams: ["mid-1", "mid-2", "final"]
            };
            currentCourse.subjects.push(subject);
        }
    }
}

fs.writeFileSync('btech_json.json', JSON.stringify(courses, null, 2));
console.log(`Extracted ${courses.length} B.Tech courses.`);
