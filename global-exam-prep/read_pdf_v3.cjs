const fs = require('fs');
const pdf = require('pdf-parse');

let dataBuffer = fs.readFileSync('Subjects_Diploma.pdf');

pdf(dataBuffer).then(function(data) {
    fs.writeFileSync('pdf_output_v3.txt', data.text);
    console.log('PDF text extracted to pdf_output_v3.txt');
    console.log('Pages:', data.numpages);
}).catch(e => console.error(e));
