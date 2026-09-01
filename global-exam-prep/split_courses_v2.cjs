const fs = require('fs');
const rawData = JSON.parse(fs.readFileSync('non_engineering_courses.json', 'utf8'));

const curatedCourses = [];

const domainMap = {
    'b-com': 'management',
    'bba': 'management',
    'b-pharm': 'science-pharmacy',
    'b-sc': 'science-pharmacy',
    'bs-ai-ml': 'science-pharmacy',
    'bca': 'computer-app',
    'b-com-llb--hons-': 'law-arts'
};

rawData.forEach(item => {
    let currentCourse = {
        id: item.id,
        title: item.title,
        subjects: [],
        scenarios: item.scenarios || []
    };

    item.subjects.forEach(subject => {
        const title = subject.title.trim().toUpperCase();
        
        // Refined transition detection
        let newCourseTitle = null;
        if (title === 'BBA') newCourseTitle = 'BBA';
        else if (title === 'B.SC' || title === 'BSC' || title === 'BACHELOR OF SCIENCE') newCourseTitle = 'B.Sc';
        else if (title === 'BS AI & ML' || title === 'BS AI/ML') newCourseTitle = 'BS AI & ML';
        else if (title === 'BCA') newCourseTitle = 'BCA';

        if (newCourseTitle && newCourseTitle !== currentCourse.title) {
            if (currentCourse.subjects.length > 5) { // Avoid splitting on random mentions
                const domain = domainMap[currentCourse.id] || domainMap[currentCourse.title.toLowerCase()] || 'unknown';
                curatedCourses.push({ ...currentCourse, domain });
            }
            
            currentCourse = {
                id: newCourseTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                title: newCourseTitle,
                subjects: [],
                scenarios: []
            };
        } else {
            currentCourse.subjects.push(subject);
        }
    });
    
    const finalDomain = domainMap[currentCourse.id] || domainMap[currentCourse.title.toLowerCase()] || 'law-arts';
    curatedCourses.push({ ...currentCourse, domain: finalDomain });
});

// Consolidate duplicates (e.g., if BBA appeared multiple times)
const consolidated = {};
curatedCourses.forEach(c => {
    if (consolidated[c.title]) {
        consolidated[c.title].subjects = consolidated[c.title].subjects.concat(c.subjects);
    } else {
        consolidated[c.title] = c;
    }
});

const finalResult = Object.values(consolidated);

fs.writeFileSync('curated_non_engineering_v2.json', JSON.stringify(finalResult, null, 2));
console.log(`Final curated courses: ${finalResult.length}`);
finalResult.forEach(c => console.log(`- ${c.title} (${c.subjects.length} subjects, Domain: ${c.domain})`));
