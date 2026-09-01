import fs from 'fs';

const mockFile = 'src/data/mockData.js';
const diplomaJson = JSON.parse(fs.readFileSync('diploma_json.json', 'utf8'));

let mockContent = fs.readFileSync(mockFile, 'utf8');

// The mockData exports `export const domains = [ { ... engineering ... } ];`
// We need to inject the diploma domain object into the array.

// we can do this via regex or just completely parsing and stringifying, but mockData might have other exports.
// Let me check if there are other exports.
const hasOther = mockContent.includes('export const universitySyllabus') || mockContent.split('export').length > 2;

if (!hasOther) {
    // We can extract the domains array text and append.
    // Or simpler, let's just use string replace.
    const insertionPoint = mockContent.lastIndexOf('];');
    if (insertionPoint !== -1) {
        const insertText = ',\n' + JSON.stringify(diplomaJson, null, 2) + '\n';
        const newMockContent = mockContent.slice(0, insertionPoint) + insertText + mockContent.slice(insertionPoint);
        fs.writeFileSync(mockFile, newMockContent);
        console.log("Injected Diploma directly into mockData.js");
    } else {
        console.log("Could not find domains array end bracket.");
    }
}
