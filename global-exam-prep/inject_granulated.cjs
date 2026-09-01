const fs = require('fs');

const granulated = JSON.parse(fs.readFileSync('granulated_non_eng.json', 'utf8'));
const mockPath = 'src/data/mockData.js';
let mockContent = fs.readFileSync(mockPath, 'utf8');

// Helper to replace the courses array for a specific domain
function updateDomainCourses(content, domainId, newCourses) {
    const domainSearch = new RegExp(`"id":\\s*"${domainId}"`);
    const match = content.match(domainSearch);
    if (!match) return content;

    const startIdx = match.index;
    const coursesIdx = content.indexOf('"courses":', startIdx);
    if (coursesIdx === -1) return content;

    const openingBracketIdx = content.indexOf('[', coursesIdx);
    
    // Find matching closing bracket for the courses array
    let depth = 1;
    let endBracketIdx = openingBracketIdx + 1;
    while (depth > 0 && endBracketIdx < content.length) {
        if (content[endBracketIdx] === '[') depth++;
        else if (content[endBracketIdx] === ']') depth--;
        endBracketIdx++;
    }

    const newCoursesJson = JSON.stringify(newCourses, null, 2);
    // Indent the new JSON
    const indentedJson = newCoursesJson.split('\n').map(line => '        ' + line).join('\n').trim();

    return content.slice(0, openingBracketIdx) + indentedJson + content.slice(endBracketIdx);
}

// Update each domain
mockContent = updateDomainCourses(mockContent, 'management', granulated['management']);
mockContent = updateDomainCourses(mockContent, 'science-pharmacy', granulated['science-pharmacy']);
mockContent = updateDomainCourses(mockContent, 'law-arts', granulated['law-arts']);

fs.writeFileSync(mockPath, mockContent);
console.log('Successfully injected granulated courses into mockData.js');
