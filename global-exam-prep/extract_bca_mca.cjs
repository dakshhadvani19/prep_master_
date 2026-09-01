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
    
    // Find Page (175) or closest
    let startIndex = -1;
    const marker175 = markers.find(m => m.label === "175");
    if (marker175) {
        startIndex = marker175.index;
    } else {
        if (markers.length >= 175) {
            startIndex = markers[174].index;
        } else {
            startIndex = 0;
        }
    }
    
    let content = rawText.substring(startIndex);
    fs.writeFileSync('diploma_bca_mca_extract.txt', content);
    console.log('Extracted content to diploma_bca_mca_extract.txt (length: ' + content.length + ')');
    process.exit(0);
});

pdfParser.loadPDF('Subjects_Diploma.pdf');
setTimeout(() => { console.log('Timeout reached'); process.exit(1); }, 60000);
