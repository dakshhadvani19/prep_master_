const fs = require('fs');
const pdf = require('pdf-parse');

async function run() {
    try {
        let dataBuffer = fs.readFileSync('Subjects_Diploma.pdf');
        let extractor = typeof pdf === 'function' ? pdf : (pdf.default || pdf.PDFParse);
        if (!extractor) {
          console.log('Extractor not found. Keys:', Object.keys(pdf));
          return;
        }
        const data = await extractor(dataBuffer);
        fs.writeFileSync('pdf_output_full.txt', data.text);
        console.log('Extracted to pdf_output_full.txt');
        console.log('Pages:', data.numpages);
    } catch (e) {
        console.error(e);
    }
}
run();
