const fs = require('fs');

const content = fs.readFileSync('src/data/mockData.js', 'utf8');
const domainMatch = content.match(/"id":\s*"science-pharmacy"/);
if (domainMatch) {
    const startIdx = domainMatch.index;
    const coursesIdx = content.indexOf('"courses":', startIdx);
    const openingBracketIdx = content.indexOf('[', coursesIdx);
    
    let depth = 1;
    let endBracketIdx = openingBracketIdx + 1;
    while (depth > 0 && endBracketIdx < content.length) {
        if (content[endBracketIdx] === '[') depth++;
        else if (content[endBracketIdx] === ']') depth--;
        endBracketIdx++;
    }
    
    const coursesJson = content.slice(openingBracketIdx, endBracketIdx);
    try {
        const courses = JSON.parse(coursesJson);
        console.log(`Found ${courses.length} courses in science-pharmacy:`);
        courses.forEach(c => console.log(`  - ${c.title}`));
    } catch (e) {
        console.log('Error parsing courses JSON', e);
        console.log(coursesJson.slice(0, 200));
    }
} else {
    console.log('Domain science-pharmacy not found');
}
