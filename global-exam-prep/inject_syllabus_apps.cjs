const fs = require('fs');
const path = require('path');

const syllabusPath = path.resolve('src/data/universitySyllabus.js');
const newSyllabusDataPath = path.resolve('comp_apps_syllabus.json');

const newSyllabus = JSON.parse(fs.readFileSync(newSyllabusDataPath, 'utf8'));
let content = fs.readFileSync(syllabusPath, 'utf8');

// The file ends with };
const closingBraceIndex = content.lastIndexOf('};');

if (closingBraceIndex !== -1) {
    let newEntriesString = "";
    for (const [key, value] of Object.entries(newSyllabus)) {
        newEntriesString += `    "${key}": ${JSON.stringify(value, null, 8).replace(/\n/g, '\n    ').trim()},\n`;
    }
    
    const updatedContent = content.slice(0, closingBraceIndex) + '    ' + newEntriesString.trim() + '\n' + content.slice(closingBraceIndex);
    fs.writeFileSync(syllabusPath, updatedContent);
    console.log('Successfully injected BCA/MCA syllabus entries into universitySyllabus.js');
} else {
    console.error('Could not find the end of the syllabus object');
    process.exit(1);
}
