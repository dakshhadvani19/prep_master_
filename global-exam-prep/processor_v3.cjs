const fs = require('fs');

const text = fs.readFileSync('pdf_output_76_plus_new.txt', 'utf8');
const lines = text.split('\n');

const courses = [];
// Initialize with a default course to catch early subjects if they don't have a header
let currentCourse = {
    id: 'bba',
    title: 'BBA',
    subjects: [],
    scenarios: []
};
courses.push(currentCourse);

let currentSem = 0;
let inScenarios = false;

// Degree headers to look for (Exact or partial match)
const degreeHeaders = [
    'BBA',
    'BBA (HONS)',
    'B.Com',
    'BBA ( Business Analytics )',
    'BBA ( Digital Marketing )',
    'BBA ( International Business)',
    'BBA in Global Business Management',
    'BBA Aviation',
    'MBA',
    'MBA Business Analytics',
    'Master In Global Business Management',
    'B.Sc in Chemistry',
    'B.Sc in Microbiology',
    'B.Sc in Agricultural Honors',
    'M.Sc in Chemistry',
    'M.Sc in MicorBiology',
    'M.Sc in PGDMLT',
    'B.Pharm',
    'M.Pharm Pharmaceutics',
    'M.Pharm Pharmaceutical Quality Assurence',
    'M.Pharm Regulatory Affairs',
    'BA LLB (Hons)',
    'B.Com LLB (HONS)',
    'BA in Socialogy Psychology Political Science'
];

function isDegreeHeader(line) {
    const cleanLine = line.trim();
    if (!cleanLine) return false;
    // Check if it's exactly one of the headers or matches the pattern
    return degreeHeaders.some(h => cleanLine === h) || (cleanLine.includes('B.Sc in') || cleanLine.includes('M.Sc in') || cleanLine.includes('BBA ('));
}

lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Detect new course
    if (isDegreeHeader(trimmed) && !trimmed.startsWith('*')) {
        currentCourse = {
            id: trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            title: trimmed,
            subjects: [],
            scenarios: []
        };
        courses.push(currentCourse);
        currentSem = 0;
        inScenarios = false;
        return;
    }

    if (!currentCourse) return;

    // Detect Sem
    const semMatch = trimmed.match(/^Sem\s*(\d+)/i);
    if (semMatch) {
        currentSem = parseInt(semMatch[1]);
        inScenarios = false;
        return;
    }

    // Detect Scenarios start
    if (trimmed.startsWith('*') || trimmed.toLowerCase().includes('following subjects')) {
        inScenarios = true;
        return;
    }

    // Detect Subject
    // Format: Title(ID)
    const subjectMatch = trimmed.match(/^(.*?)\((.*?)\)\s*$/);
    if (subjectMatch) {
        const title = subjectMatch[1].trim();
        const id = subjectMatch[2].trim();
        
        const subject = {
            id: id,
            title: title,
            sem: currentSem,
            exams: ['mid-1', 'mid-2', 'final']
        };

        if (inScenarios) {
            currentCourse.scenarios.push(subject);
        } else {
            currentCourse.subjects.push(subject);
        }
    } else if (inScenarios && currentCourse.scenarios.length > 0) {
        // Handle wrap-around titles if necessary (skipped for now for simplicity, matching common patterns)
    } else if (currentCourse.subjects.length > 0) {
        // Potentially a multi-line title or a noise line
    }
});

// Final mapping to domains
const domainMap = {
    'law-arts': ['ba-llb', 'b-com-llb', 'ba-in-socialogy', 'laws'],
    'management': ['bba', 'b-com', 'mba', 'global-business'],
    'science-pharmacy': ['b-pharm', 'b-sc', 'm-sc', 'pgdmlt', 'm-pharm']
};

const categorized = {
    'management': [],
    'science-pharmacy': [],
    'law-arts': []
};

courses.forEach(c => {
    let assigned = false;
    for (const [domain, keywords] of Object.entries(domainMap)) {
        if (keywords.some(k => c.id.includes(k))) {
            categorized[domain].push(c);
            assigned = true;
            break;
        }
    }
    // Specific overrides or default fallback
    if (c.title.includes('BA LLB') || c.title.includes('B.Com LLB') || c.title.includes('BA in')) {
         if (!assigned) {
            categorized['law-arts'].push(c);
            assigned = true;
         }
    }

    if (!assigned) {
        if (c.id.includes('bba') || c.id.includes('b-com') || c.id.includes('mba')) {
             categorized['management'].push(c);
        } else {
             categorized['science-pharmacy'].push(c);
        }
    }
});

fs.writeFileSync('granulated_non_eng.json', JSON.stringify(categorized, null, 2));
console.log(`Extracted ${courses.length} degrees.`);
Object.keys(categorized).forEach(d => console.log(`${d}: ${categorized[d].length} courses`));
