const fs = require('fs');
const pdf = require('pdf-parse');

async function check(file) {
    if (!fs.existsSync(file)) {
        console.log(file, 'does not exist');
        return;
    }
    const dataBuffer = fs.readFileSync(file);
    try {
        const data = await pdf(dataBuffer);
        console.log(file, 'Pages:', data.numpages);
    } catch (e) {
        console.error('Error reading', file, e.message);
    }
}

check('Subjects_Diploma.pdf');
check('Subjects_Diploma__.pdf');
