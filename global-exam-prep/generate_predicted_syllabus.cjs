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

function generateSyllabus() {
    try {
        const rawData = fs.readFileSync('extracted_subjects_list.json', 'utf8');
        const subjects = JSON.parse(rawData);

        const predictedSyllabus = {};

        subjects.forEach(subject => {
            const titleLower = subject.title.toLowerCase();
            let selectedTopics = fallbackTopics;

            // Find matching category
            for (const bank of topicBanks) {
                if (bank.keywords.some(kw => titleLower.includes(kw))) {
                    selectedTopics = bank.topics;
                    break;
                }
            }

            predictedSyllabus[subject.code] = {
                title: subject.title,
                topics: selectedTopics,
                aiPromptContext: `UGC/AICTE aligned standard topics for ${subject.title}`
            };
        });

        fs.writeFileSync('predicted_ai_syllabus.json', JSON.stringify(predictedSyllabus, null, 2));
        console.log(`Successfully generated predicted syllabus for ${subjects.length} subjects.`);
        console.log('Saved to predicted_ai_syllabus.json');

    } catch (e) {
        console.error('Error generating syllabus:', e);
    }
}

generateSyllabus();
