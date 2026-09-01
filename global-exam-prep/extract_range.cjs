const fs = require('fs');
const pdf = require('pdf-parse');

async function extractPdf(data, options) {
    if (typeof pdf === 'function') {
        return await pdf(data, options);
    }
    // If it's a class or has a default constructor
    const Extractor = pdf.PDFParse || pdf.default || pdf;
    try {
        return await Extractor(data, options);
    } catch (e) {
        // Last resort: try calling as simple function anyway
        return await pdf(data, options);
    }
}



async function run() {
    try {
        const buf = fs.readFileSync('Subjects_Diploma.pdf');
        
        // Custom pager to split text by pages and extract range
        function render_page(pageData) {
            let render_options = {
                normalizeWhitespace: true,
                disableCombineTextItems: false
            };
            return pageData.getTextContent(render_options)
                .then(function(textContent) {
                    let lastY, text = '';
                    for (let item of textContent.items) {
                        if (lastY !== item.transform[5] || !lastY) {
                            text += '\n';
                        }
                        text += item.str + ' ';
                        lastY = item.transform[5];
                    }
                    return `--- PAGE ${pageData.pageIndex + 1} BREAK ---\n` + text;
                });
        }

        const data = await extractPdf(buf, { pagerender: render_page });
        const allPages = data.text.split(/--- PAGE \d+ BREAK ---/);
        
        // Pages 76 to 150 (1-indexed)
        // Note: allPages[0] is empty or preamble before first break
        const filteredText = allPages.slice(76, 151).join('\n\n');
        
        fs.writeFileSync('pdf_output_range_76_150.txt', filteredText);
        console.log('Extracted pages 76-150 to pdf_output_range_76_150.txt');
        console.log('Total pages in PDF:', data.numpages);
        console.log('Pages extracted:', Math.min(data.numpages, 150) - 76 + 1);
    } catch (e) {
        console.error('Error:', e);
    }
}
run();