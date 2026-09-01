import * as pdfjs from 'pdfjs-dist';
import fs from 'fs';

async function extract() {
    const data = new Uint8Array(fs.readFileSync('Subjects_Diploma.pdf'));
    const loadingTask = pdfjs.getDocument({data});
    const pdf = await loadingTask.promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += `--- Page ${i} ---\n${pageText}\n\n`;
    }
    fs.writeFileSync('pdf_output_pdfjs.txt', fullText);
    console.log('Extracted to pdf_output_pdfjs.txt');
}

extract().catch(console.error);
