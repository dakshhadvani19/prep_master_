const fs = require('fs');

const topicBanks = [
    {
        keywords: ['math', 'calculus', 'algebra', 'probability', 'statistics'],
        topics: ['Linear Algebra & Matrices', 'Differential Calculus', 'Integral Calculus', 'Vector Calculus', 'Ordinary Differential Equations', 'Complex Variables', 'Probability Distributions']
    },
    {
        keywords: ['physics'],
        topics: ['Mechanics & Properties of Matter', 'Optics & Lasers', 'Waves and Oscillations', 'Electromagnetism', 'Quantum Mechanics Basics', 'Solid State Physics']
    },
    {
        keywords: ['chemistry'],
        topics: ['Atomic and Molecular Structure', 'Spectroscopic Techniques', 'Thermodynamics & Kinetics', 'Periodic Properties', 'Stereochemistry', 'Polymer Chemistry']
    },
    {
        keywords: ['programming', 'c++', 'java', 'python', 'software', 'web tech', 'dotnet', '.net'],
        topics: ['Introduction to Programming', 'Control Structures & Data Types', 'Functions and Arrays', 'Object-Oriented Concepts (Classes, Objects, Inheritance, Polymorphism)', 'Exception Handling & Debugging', 'File I/O & Database Connectivity']
    },
    {
        keywords: ['data structure', 'algorithm'],
        topics: ['Time & Space Complexity', 'Arrays, Strings & Linked Lists', 'Stacks & Queues', 'Trees (BST, AVL) & Graphs', 'Sorting & Searching Algorithms', 'Hashing Techniques']
    },
    {
        keywords: ['database', 'dbms', 'sql'],
        topics: ['Entity-Relationship Model', 'Relational Model & Algebra', 'SQL Queries & Subqueries', 'Database Normalization', 'Transaction Management', 'Concurrency Control']
    },
    {
        keywords: ['electrical', 'dc circuit', 'ac circuit', 'power', 'motor', 'transformer'],
        topics: ['DC Circuits & Network Theorems', 'Single Phase & Three Phase AC Circuits', 'Magnetic Circuits & Transformers', 'Electrical Machines (Motors & Generators)', 'Power Converters Basics', 'Electrical Installations & Safety']
    },
    {
        keywords: ['electronic', 'digital', 'logic', 'microprocessor', 'vlsi'],
        topics: ['Semiconductor Diodes & Applications', 'Bipolar Junction Transistors', 'Operational Amplifiers', 'Digital Logic Gates & Boolean Algebra', 'Combinational & Sequential Circuits', 'Microprocessor Architecture']
    },
    {
        keywords: ['mechanical', 'thermodynamics', 'manufacturing', 'fluid', 'machine', 'workshop', 'drawing'],
        topics: ['Laws of Thermodynamics', 'Heat & Mass Transfer', 'Fluid Mechanics & Hydraulics', 'Manufacturing Processes', 'Engineering Materials & Metallurgy', 'Kinematics of Machinery', 'Engineering Graphics']
    },
    {
        keywords: ['civil', 'mechanic', 'structure', 'geotech', 'survey', 'construction', 'concrete'],
        topics: ['Engineering Statics & Dynamics', 'Mechanics of Solids', 'Surveying & Geomatics', 'Concrete Technology', 'Geotechnical Engineering', 'Transportation Engineering']
    },
    {
        keywords: ['communication', 'english', 'verbal', 'presentation'],
        topics: ['Vocabulary Building', 'Basic Grammar & Syntax', 'Reading Comprehension', 'Writing Skills (Reports, Emails)', 'Oral Communication & Presentation Skills']
    },
    {
        keywords: ['environment', 'disaster'],
        topics: ['Ecosystems & Biodiversity', 'Natural Resources Control', 'Environmental Pollution', 'Social Issues and Environment', 'Disaster Management & Preparedness']
    },
    {
        keywords: ['management', 'entrepreneurship', 'economic', 'business', 'ethics'],
        topics: ['Principles of Management', 'Organizational Behavior', 'Financial Accounting & Economics', 'Entrepreneurial Ecosystem', 'Business Law & Ethics', 'Project Management']
    },
    {
        keywords: ['network', 'security', 'cyber', 'cryptography'],
        topics: ['OSI & TCP/IP Models', 'Routing & Switching', 'Network Protocols', 'Cryptography Basics', 'Network Security Attacks & Countermeasures', 'Cyber Laws']
    },
    {
        keywords: ['artificial intelligence', 'machine learning', 'data science', 'ai', 'deep learning'],
        topics: ['Introduction to AI & Search Algorithms', 'Knowledge Representation', 'Supervised & Unsupervised Learning', 'Neural Networks Basics', 'Evaluation Metrics', 'Data Preprocessing']
    }
];

const fallbackTopics = [
    'Unit 1: Introduction & Fundamentals',
    'Unit 2: Core Concepts & Principles',
    'Unit 3: Applied Methodologies',
    'Unit 4: Advanced Topics & Case Studies',
    'Unit 5: Recent Trends & Technologies'
];


async function run() {
    try {
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const dataBuffer = new Uint8Array(fs.readFileSync('Subjects_Diploma__.pdf'));
        const loadingTask = pdfjsLib.getDocument(dataBuffer);
        const pdfDocument = await loadingTask.promise;

        const numPages = pdfDocument.numPages;
        console.log(`Total PDF pages: ${numPages}. Reading from page 180 to end...`);

        if (numPages < 180) {
            console.warn("The PDF has less than 180 pages!");
            return;
        }

        let fullText = '';
        for (let i = 180; i <= numPages; i++) {
            const page = await pdfDocument.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }

        const subjectRegex = /(.+?)\s*\(([0-9A-Z]{6,10})\)/g;
        let match;
        const newSubjects = new Map();

        while ((match = subjectRegex.exec(fullText)) !== null) {
            let title = match[1].trim();
            const code = match[2].trim();
            
            title = title.replace(/^[\s\d\.]+/, '');

            if (title.length > 2 && title.length < 150 && !title.toLowerCase().includes('semester')) {
                if (!newSubjects.has(code)) {
                    newSubjects.set(code, title);
                }
            }
        }

        console.log(`Extracted ${newSubjects.size} unique subjects from page 180 onwards.`);

        const predictedSyllabus = JSON.parse(fs.readFileSync('predicted_ai_syllabus.json', 'utf8'));
        let addedCount = 0;

        for (const [code, title] of newSubjects.entries()) {
            if (!predictedSyllabus[code]) {
                const titleLower = title.toLowerCase();
                let selectedTopics = fallbackTopics;

                for (const bank of topicBanks) {
                    if (bank.keywords.some(kw => titleLower.includes(kw))) {
                        selectedTopics = bank.topics;
                        break;
                    }
                }

                predictedSyllabus[code] = {
                    title: title,
                    topics: selectedTopics,
                    aiPromptContext: `UGC/AICTE aligned standard topics for ${title}`
                };
                addedCount++;
            }
        }

        fs.writeFileSync('predicted_ai_syllabus.json', JSON.stringify(predictedSyllabus, null, 2));
        console.log(`Successfully added ${addedCount} newly predicted subjects to predicted_ai_syllabus.json.`);

    } catch (e) {
        console.error('Error during update:', e);
    }
}

run();
