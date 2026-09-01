const fs = require('fs');
const pdf = require('pdf-parse');

async function analyze() {
    const dataBuffer = fs.readFileSync('Subjects_Diploma.pdf');
    const options = {
        pagerender: function(pageData) {
            return pageData.getTextContent().then(function(textContent) {
                let lastY, text = '';
                for (let item of textContent.items) {
                    if (lastY == item.transform[5] || !lastY){
                        text += item.str;
                    }  
                    else{
                        text += '\n' + item.str;
                    }    
                    lastY = item.transform[5];
                }
                return text;
            });
        }
    }
    const data = await pdf(dataBuffer);
    console.log('Total Pages:', data.numpages);
    // Print first 50 chars of each page
    const pages = data.text.split(/--- Page \d+ ---/); // This won't work because pdf-parse doesn't insert these by default
    // We can use a custom render to see page breaks
    console.log('Text length:', data.text.length);
    fs.writeFileSync('pdf_output_full_parse.txt', data.text);
}

analyze().catch(console.error);
