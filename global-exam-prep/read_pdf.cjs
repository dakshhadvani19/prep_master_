const fs = require('fs');
const pdf = require('pdf-parse');
const path = require('path');

const pdfPath = path.join(__dirname, 'Subjects_Diploma.pdf');
let dataBuffer = fs.readFileSync(pdfPath);

pdf(dataBuffer).then(function(data) {
    fs.writeFileSync('pdf_output.txt', data.text);
    console.log('PDF text extracted to pdf_output.txt');
}).catch(e => console.error(e));
