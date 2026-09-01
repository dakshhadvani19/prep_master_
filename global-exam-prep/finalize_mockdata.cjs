const fs = require('fs');
const path = require('path');

const mockDataPath = path.resolve('src/data/mockData.js');
let content = fs.readFileSync(mockDataPath, 'utf8');

// 1. Ensure domain id is "computer-apps" (it should be already from the injection)
// 2. Find the BCA course and add Semester 8 subject.

const bcaSem8Subject = {
  "id": "05BH0801",
  "title": "Major Project",
  "sem": 8,
  "exams": ["mid-1", "mid-2", "final"]
};

// We need to find the "subjects" array of the BCA course.
// It's easier to find the end of the BCA subjects array and append.
// The BCA subjects array ends with many subjects.
// I'll search for the last BCA subject I added: "05BC1706"

const lastSubjectId = "05BC1706";
const lastSubjectIndex = content.lastIndexOf(lastSubjectId);

if (lastSubjectIndex !== -1) {
    // Find the closing brace and comma of that subject
    const subjectClosingIndex = content.indexOf('}', lastSubjectIndex);
    if (subjectClosingIndex !== -1) {
        const insertionPoint = subjectClosingIndex + 1;
        const newSubjectStr = ',\n        ' + JSON.stringify(bcaSem8Subject, null, 2).replace(/\n/g, '\n        ');
        const updatedContent = content.slice(0, insertionPoint) + newSubjectStr + content.slice(insertionPoint);
        fs.writeFileSync(mockDataPath, updatedContent);
        console.log('Successfully added Semester 8 to BCA in mockData.js');
    } else {
        console.error('Could not find closing brace for last subject');
        process.exit(1);
    }
} else {
    console.error('Could not find last BCA subject ID');
    process.exit(1);
}
