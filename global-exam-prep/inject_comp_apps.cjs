const fs = require('fs');
const path = require('path');

const mockDataPath = path.resolve('src/data/mockData.js');
const domainDataPath = path.resolve('comp_apps_domain.json');

const newDomain = JSON.parse(fs.readFileSync(domainDataPath, 'utf8'));
let content = fs.readFileSync(mockDataPath, 'utf8');

// Find the end of export const domains = [ ... ];
// It ends at line 30371 in the current view
const closingBracketIndex = content.lastIndexOf('];');

if (closingBracketIndex !== -1) {
    const domainString = ',\n  ' + JSON.stringify(newDomain, null, 2);
    const updatedContent = content.slice(0, closingBracketIndex) + domainString + '\n' + content.slice(closingBracketIndex);
    fs.writeFileSync(mockDataPath, updatedContent);
    console.log('Successfully injected Computer Applications domain into mockData.js');
} else {
    console.error('Could not find the end of domains array');
    process.exit(1);
}
