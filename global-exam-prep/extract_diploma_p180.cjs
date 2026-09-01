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
    
    // Search for Page (180) Specifically
    let startIndex = -1;
    const targetPattern = '----------------Page (180) Break----------------';
    startIndex = rawText.indexOf(targetPattern);

    if (startIndex === -1) {
        // Fallback: use markers
        const marker180 = markers.find(m => m.label === "180");
        if (marker180) {
            startIndex = marker180.index;
            console.log('Found start via Page (180) marker index');
        } else {
             // Second fallback: count markers
            if (markers.length >= 180) {
                startIndex = markers[179].index;
                console.log('Found start via 180th marker index');
            } else {
                console.log('Page 180 not found. Markers found:', markers.length);
                process.exit(1);
            }
        }
    } else {
        console.log('Found Page (180) Break marker specifically');
    }
    
    let content = rawText.substring(startIndex);
    fs.writeFileSync('diploma_p180_plus.txt', content);
    console.log('Extracted content to diploma_p180_plus.txt (length: ' + content.length + ')');
    process.exit(0);
});

pdfParser.loadPDF('Subjects_Diploma__.pdf');
setTimeout(() => { console.log('Timeout reached. Closing.'); process.exit(1); }, 60000);
