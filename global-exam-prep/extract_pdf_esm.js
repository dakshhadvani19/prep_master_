import fs from 'fs';
import pdf from 'pdf-parse';

async function extract() {
    try {
        const dataBuffer = fs.readFileSync('Subjects_Diploma.pdf');
        const data = await pdf(dataBuffer);
        fs.writeFileSync('pdf_output_full.txt', data.text);
        console.log('Extracted text to pdf_output_full.txt');
    } catch (e) {
        console.error(e);
    }
}

extract();
