const fs = require('fs');
const data = JSON.parse(fs.readFileSync('non_engineering_courses.json', 'utf8'));

data.forEach(course => {
    console.log(`\nAnalyzing top-level course: ${course.title} (ID: ${course.id})`);
    
    let currentCourseName = course.title;
    let subjectsGroupedByCourse = { [currentCourseName]: [] };
    
    course.subjects.forEach(subject => {
        // Detect transitions like "BBA", "B.Sc", "BSC", "B.C.A", etc.
        // Also look for subjects that have weird IDs or titles that match course patterns
        const titleUpper = subject.title.toUpperCase();
        if (titleUpper === 'BBA' || titleUpper === 'B.SC' || titleUpper === 'BSC' || 
            titleUpper === 'BACHELOR OF SCIENCE' || titleUpper === 'BACHELOR OF BUSINESS ADMINISTRATION') {
            console.log(`  -> Detected COURSE TRANSITION: ${subject.title}`);
            currentCourseName = subject.title;
            subjectsGroupedByCourse[currentCourseName] = [];
        } else {
            subjectsGroupedByCourse[currentCourseName].push(subject);
        }
    });

    Object.keys(subjectsGroupedByCourse).forEach(name => {
        console.log(`    - Found course "${name}" with ${subjectsGroupedByCourse[name].length} subjects`);
    });
});
