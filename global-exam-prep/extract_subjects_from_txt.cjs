const fs = require('fs');

function extractSubjectsFromFile() {
    try {
        const text = fs.readFileSync('pdf_output.txt', 'utf8');

        // Regex for subjects like "Mathematics-I(09MA2101)" or "Basics of Web Designing (09CE2102)"
        // It matches any text, followed by an optional space, followed by ( CODE )
        const subjectRegex = /(.+?)\s*\(([0-9A-Z]{6,10})\)/g;
        let match;
        const subjects = new Map();

        while ((match = subjectRegex.exec(text)) !== null) {
            let title = match[1].trim();
            const code = match[2].trim();
            
            // Clean up title (remove leading whitespace or numbers if any)
            title = title.replace(/^[\s\d\.]+/, '');

            // Filter out anomalous lines or overly long lines
            if (title.length > 2 && title.length < 80 && !title.toLowerCase().includes('semester')) {
                if (!subjects.has(code)) {
                    subjects.set(code, title);
                }
            }
        }

        console.log(`Extracted ${subjects.size} unique subjects.`);
        
        const outputArr = [];
        for (const [code, title] of subjects.entries()) {
            outputArr.push({ code, title });
        }

        fs.writeFileSync('extracted_subjects_list.json', JSON.stringify(outputArr, null, 2));
        console.log('Saved to extracted_subjects_list.json');

    } catch (e) {
        console.error('Error reading text file:', e);
    }
}

extractSubjectsFromFile();
