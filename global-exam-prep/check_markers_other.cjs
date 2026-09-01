const fs = require('fs');
const PDFParser = require('pdf2json');

const pdfParser = new PDFParser(null, 1);

pdfParser.on('pdfParser_dataError', errData => console.error(errData.parserError));
pdfParser.on('pdfParser_dataReady', pdfData => {
    const rawText = pdfParser.getRawTextContent();
    const markers = [];
    const regex = /[-]+Page \((\d+)\) Break[-]+/g;
    let match;
    while ((match = regex.exec(rawText)) !== null) {
        markers.push({ label: match[1], index: match.index });
    }
    console.log('File: Subjects_Diploma.pdf, Markers found:', markers.length);
    process.exit(0);
});

pdfParser.loadPDF('Subjects_Diploma.pdf');
setTimeout(() => { console.log('Timeout reached'); process.exit(1); }, 60000);
