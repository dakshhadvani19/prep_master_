const fs = require('fs');
const btechData = JSON.parse(fs.readFileSync('btech_json.json', 'utf8'));
let mockData = fs.readFileSync('src/data/mockData.js', 'utf8');

const startMarker = '"id": "engineering"';
const coursesMarker = '"courses": [';

let engStartIndex = mockData.indexOf(startMarker);
if (engStartIndex === -1) {
    engStartIndex = mockData.indexOf("'id': 'engineering'");
}

if (engStartIndex === -1) {
    console.error('Could not find engineering domain id in mockData.js');
    process.exit(1);
}

let coursesStartIndex = mockData.indexOf(coursesMarker, engStartIndex);
if (coursesStartIndex === -1) {
    console.error('Could not find courses array start in engineering domain');
    process.exit(1);
}

// Find the matching closing bracket for the courses array
let bracketCount = 0;
let i = coursesStartIndex + '"courses": '.length;
let foundEnd = false;

while (i < mockData.length) {
    if (mockData[i] === '[') bracketCount++;
    else if (mockData[i] === ']') {
        bracketCount--;
        if (bracketCount === 0) {
            i++; // include the closing bracket
            foundEnd = true;
            break;
        }
    }
    i++;
}

if (!foundEnd) {
    console.error('Could not find closing bracket for courses array');
    process.exit(1);
}

const coursesEndIndex = i;
const newCoursesContent = '"courses": ' + JSON.stringify(btechData, null, 2);

const updatedData = mockData.substring(0, coursesStartIndex) + newCoursesContent + mockData.substring(coursesEndIndex);
fs.writeFileSync('src/data/mockData.js', updatedData);
console.log('Successfully updated B.Tech courses in mockData.js');
