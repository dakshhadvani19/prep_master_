const fs = require('fs');
const mockPath = 'src/data/mockData.js';

let content = fs.readFileSync(mockPath, 'utf8');

// The file has export const domains = [ ... ];
// Instead of complex parsing, I will simply find the string boundaries or use a simpler ast/regex approach.

// Since the file is regular JS file, parsing it as proper JS, modifying the array, and writing back is easiest via string replacement or eval if we map it carefully.
// Actually, I can use regex to remove `{ id: "diploma-studies", ... }` 
// But a safer way:
let lines = content.split('\n');
let insideDiplomaStudies = false;
let braceDepth = 0;
let newLines = [];
let removed = 0;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!insideDiplomaStudies && line.includes('"id": "diploma-studies"')) {
        // We found the start of the diploma-studies domain block! It actually started slightly earlier at `{`
        // We look at the previous line for `{`
        let backTrack = newLines.length - 1;
        while (backTrack >= 0 && !newLines[backTrack].includes('{')) {
            backTrack--;
        }
        
        // Remove from backTrack onwards
        newLines.splice(backTrack);
        
        insideDiplomaStudies = true;
        braceDepth = 1; // It started at {
        let textRest = line.substring(line.indexOf('"id"')); 
        // We count braces in the deleted lines if we really wanted to, but we know it starts cleanly.
        removed++;
        continue;
    }

    if (insideDiplomaStudies) {
         if (line.includes('{')) braceDepth += (line.match(/\{/g) || []).length;
         if (line.includes('}')) braceDepth -= (line.match(/\}/g) || []).length;
         
         removed++;
         if (braceDepth <= 0) {
             insideDiplomaStudies = false;
             // We might leave a trailing comma, we can clean that
             if (line.includes('},')) {
                 // skip comma
             } else if (lines[i+1].trim() === '},') {
                 i++; // skip next too
             } else if (lines[i+1].trim() === ',') {
                 i++;
             }
         }
         continue;
    }

    // Process renames
    let processedLine = line;
    if (line.includes('"title": "Diploma Programs"')) {
         processedLine = line.replace('"Diploma Programs"', '"Diploma in Engineering"');
    }

    newLines.push(processedLine);
}

// Clean up any double commas if left over
let finalContent = newLines.join('\n');
finalContent = finalContent.replace(/,\s*,/g, ',');
finalContent = finalContent.replace(/{\s*,/g, '{');
finalContent = finalContent.replace(/\[\s*,/g, '[');
finalContent = finalContent.replace(/,\s*\]/, '\n]');

fs.writeFileSync(mockPath, finalContent);
console.log('Removed diploma-studies & renamed diploma to Diploma in Engineering');
