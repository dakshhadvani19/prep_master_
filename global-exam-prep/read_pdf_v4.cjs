const fs = require('fs');
const pdf = require('pdf-parse');

async function extract() {
    try {
        const dataBuffer = fs.readFileSync('Subjects_Diploma.pdf');
        // pdf-parse sometimes exports as the object itself if it's not a function
        const parse = typeof pdf === 'function' ? pdf : pdf.default;
        if (typeof parse !== 'function') {
            console.log('Keys of pdf export:', Object.keys(pdf));
            throw new Error('pdf-parse is not a function');
        }
        const data = await parse(dataBuffer);
        fs.writeFileSync('pdf_output_full.txt', data.text);
        console.log('Extracted text to pdf_output_full.txt');
    } catch (e) {
        console.error(e);
    }
}

extract();
