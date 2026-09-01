const fs = require('fs');
const pdf = require('pdf-parse');

async function extract() {
    try {
        const dataBuffer = fs.readFileSync('Subjects_Diploma.pdf');
        const data = await (typeof pdf === 'function' ? pdf(dataBuffer) : (pdf.PDFParse ? pdf.PDFParse(dataBuffer) : pdf.default(dataBuffer)));
        fs.writeFileSync('pdf_output_final.txt', data.text);
        console.log('Extracted text to pdf_output_final.txt');
        console.log('Total pages:', data.numpages);
    } catch (e) {
        console.error('Error extracting PDF:', e);
    }
}

extract();
