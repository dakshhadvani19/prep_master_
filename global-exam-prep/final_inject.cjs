const fs = require('fs');
const curated = JSON.parse(fs.readFileSync('curated_non_engineering_v2.json', 'utf8'));

const mockPath = 'src/data/mockData.js';
let content = fs.readFileSync(mockPath, 'utf8');

// Helper to remove "Faculty of" 
const cleanTitle = (t) => t.replace(/^Faculty of /i, '').trim();

// Group by domain
const byDomain = {};
curated.forEach(c => {
    if (!byDomain[c.domain]) byDomain[c.domain] = [];
    byDomain[c.domain].push({
        id: c.id,
        title: c.title,
        subjects: c.subjects,
        scenarios: c.scenarios || []
    });
});

// We need to preserve existing data but replace the whole "courses" array for target domains
Object.keys(byDomain).forEach(domainId => {
    console.log(`Processing domain: ${domainId}`);
    
    // Find the domain start
    const domainSearch = new RegExp(`"id":\\s*"${domainId}"`);
    const match = content.match(domainSearch);
    if (!match) {
        console.log(`  Domain ${domainId} not found in mockData.js`);
        return;
    }

    const startIdx = match.index;
    const coursesIdx = content.indexOf('"courses":', startIdx);
    if (coursesIdx === -1) return;

    const openingBracketIdx = content.indexOf('[', coursesIdx);
    let depth = 1;
    let endBracketIdx = openingBracketIdx + 1;
    
    while (depth > 0 && endBracketIdx < content.length) {
        if (content[endBracketIdx] === '[') depth++;
        else if (content[endBracketIdx] === ']') depth--;
        endBracketIdx++;
    }

    const newCoursesJson = JSON.stringify(byDomain[domainId], null, 2).replace(/^/gm, '        ');
    content = content.slice(0, openingBracketIdx) + newCoursesJson.trim() + content.slice(endBracketIdx);
    
    // Clean the domain title if needed
    const titleIdx = content.lastIndexOf('"title":', openingBracketIdx);
    if (titleIdx > startIdx) {
        const nextQuote = content.indexOf('"', titleIdx + 8);
        const endQuote = content.indexOf('"', nextQuote + 1);
        const oldTitle = content.slice(nextQuote + 1, endQuote);
        content = content.slice(0, nextQuote + 1) + cleanTitle(oldTitle) + content.slice(endQuote);
    }
});

fs.writeFileSync(mockPath, content);
console.log('Final injection successful');
