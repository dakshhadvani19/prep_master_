const fs = require('fs');
const PDFParser = require("pdf2json");

const pdfParser = new PDFParser(this, 1);

pdfParser.on("pdfParser_dataError", errData => console.error(errData.parserError));
pdfParser.on("pdfParser_dataReady", pdfData => {
    fs.writeFileSync("pdf_output.txt", pdfParser.getRawTextContent());
    console.log("Done");
});

pdfParser.loadPDF("Subjects_Diploma.pdf");
