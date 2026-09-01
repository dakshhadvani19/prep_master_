const fs = require('fs');
const PDFParser = require('pdf2json');

const pdfParser = new PDFParser(null, 1);

pdfParser.on('pdfParser_dataError', errData => console.error(errData.parserError));
pdfParser.on('pdfParser_dataReady', pdfData => {
    const rawText = pdfParser.getRawTextContent();
    
    // Find all page markers
    const markers = [];
    const regex = /[-]+Page \((\d+)\) Break[-]+/g;
    let match;
    while ((match = regex.exec(rawText)) !== null) {
        markers.push({ label: match[1], index: match.index });
    }
    
    console.log('Markers found:', markers.length);
    if (markers.length > 0) {
        console.log('Last marker:', markers[markers.length - 1].label);
    }

    // Try to find Page (76) specifically if labeling is consistent
    let startIndex = rawText.indexOf('----------------Page (76) Break----------------');
    if (startIndex === -1) {
        // Fallback: use the index of the 76th marker if markers exist
        if (markers.length >= 76) {
            startIndex = markers[75].index;
            console.log('Found start via 76th marker index');
        } else {
            console.log('Starting from index 0 as 76th marker not found.');
            startIndex = 0;
        }
    } else {
        console.log('Found Page (76) Break marker specifically');
    }
    
    let content = rawText.substring(startIndex);
    
    fs.writeFileSync('pdf_output_76_plus.txt', content);
    console.log('Extracted content to pdf_output_76_plus.txt (length: ' + content.length + ')');
    process.exit(0);
});


pdfParser.loadPDF('Subjects_Diploma.pdf');
setTimeout(() => { console.log('Timeout reached. Closing.'); process.exit(1); }, 30000);

