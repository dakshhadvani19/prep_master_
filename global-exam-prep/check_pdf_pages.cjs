const fs = require('fs');
const pdf = require('pdf-parse');

let dataBuffer = fs.readFileSync('Subjects_Diploma__.pdf');

pdf(dataBuffer).then(function(data) {
    console.log('Pages:', data.numpages);
}).catch(e => console.error(e));
