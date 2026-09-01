const fs = require('fs');
const rawData = JSON.parse(fs.readFileSync('non_engineering_courses.json', 'utf8'));

const curatedCourses = [];

rawData.forEach(item => {
    let currentCourse = null;
    
    // Check if the top level is already a course we want to keep
    const initialTitle = item.title;
    currentCourse = {
        id: item.id,
        title: initialTitle,
        subjects: [],
        scenarios: item.scenarios || []
    };

    item.subjects.forEach(subject => {
        const title = subject.title.trim().toUpperCase();
        
        // Detect transitions to new courses
        if (title === 'BBA' || title === 'B.SC' || title === 'BSC' || title === 'BS AI & ML' || title === 'BS AI/ML' || title === 'BCA') {
            // Save the previous course if it had subjects
            if (currentCourse.subjects.length > 0) {
                curatedCourses.push(currentCourse);
            }
            
            // Start a new course
            currentCourse = {
                id: subject.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                title: subject.title,
                subjects: [],
                scenarios: []
            };
        } else {
            currentCourse.subjects.push(subject);
        }
    });
    
    // Push the last course
    if (currentCourse.subjects.length > 0) {
        curatedCourses.push(currentCourse);
    }
});

fs.writeFileSync('curated_non_engineering.json', JSON.stringify(curatedCourses, null, 2));
console.log(`Split lumped data into ${curatedCourses.length} distinct courses.`);
curatedCourses.forEach(c => console.log(`- ${c.title} (${c.subjects.length} subjects)`));
