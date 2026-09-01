const fs = require('fs');
const pdf = require('pdf-parse');

async function extractSubjects() {
    try {
        const dataBuffer = fs.readFileSync('Subjects_Diploma__.pdf');
        const data = await (typeof pdf === 'function' ? pdf(dataBuffer) : (pdf.PDFParse ? pdf.PDFParse(dataBuffer) : pdf.default(dataBuffer)));
        const text = data.text;

        const subjectRegex = /([0-9]{2}[A-Z]{2}[0-9]{4})\s+(.+?)(?=\n|$)/g;
        let match;
        const subjects = new Map();

        while ((match = subjectRegex.exec(text)) !== null) {
            const code = match[1].trim();
            const title = match[2].trim();
            if (!subjects.has(code)) {
                subjects.set(code, title);
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
        console.error('Error extracting PDF:', e);
    }
}

extractSubjects();
