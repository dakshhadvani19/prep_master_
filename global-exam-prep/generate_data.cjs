const fs = require('fs');

const domains = [
    {
        id: 'engineering',
        title: 'Faculty of Engineering & Technology',
        icon: 'Cpu',
        description: 'B.Tech in Computer Science, AI & ML, Mechanical, Civil, Electrical, and Chemical.',
        courses: [
            {
                id: 'btech-ce',
                title: 'B.Tech - Computer Engineering',
                semesters: 8,
                subjects: [
                    { id: 'ce101', title: 'Mathematics-I (Calculus and Linear Algebra)', sem: 1 },
                    { id: 'ce102', title: 'Programming for Problem Solving (C)', sem: 1 },
                    { id: 'ce103', title: 'Basic Electrical Engineering', sem: 2 },
                    { id: 'ce104', title: 'Engineering Graphics & Design', sem: 2 },
                    { id: 'ce105', title: 'Data Structures', sem: 3 },
                    { id: 'ce106', title: 'Database Management Systems', sem: 3 },
                    { id: 'ce107', title: 'Digital Fundamentals', sem: 3 },
                    { id: 'ce108', title: 'Discrete Mathematics', sem: 4 },
                    { id: 'ce109', title: 'Operating System', sem: 4 },
                    { id: 'ce110', title: 'Computer Organization & Architecture', sem: 4 },
                    { id: 'ce111', title: 'Design and Analysis of Algorithms', sem: 5 },
                    { id: 'ce112', title: 'Software Engineering', sem: 5 },
                    { id: 'ce113', title: 'Computer Networks', sem: 5 },
                    { id: 'ce114', title: 'Theory of Computation', sem: 6 },
                    { id: 'ce115', title: 'Advanced Java Programming', sem: 6 },
                    { id: 'ce116', title: 'Cyber Security', sem: 7 },
                    { id: 'ce117', title: 'Compiler Design', sem: 7 }
                ]
            },
            {
                id: 'btech-aiml',
                title: 'B.Tech - Artificial Intelligence & Machine Learning',
                semesters: 8,
                subjects: [
                    { id: 'aiml101', title: 'Mathematics-I', sem: 1 },
                    { id: 'aiml102', title: 'Programming for Problem Solving', sem: 1 },
                    { id: 'aiml103', title: 'Data Structures', sem: 3 },
                    { id: 'aiml104', title: 'Database Management Systems', sem: 3 },
                    { id: 'aiml105', title: 'Object Oriented Programming using C++', sem: 3 },
                    { id: 'aiml106', title: 'Probability and Statistics', sem: 4 },
                    { id: 'aiml107', title: 'Operating System', sem: 4 },
                    { id: 'aiml108', title: 'Python for Data Science', sem: 4 },
                    { id: 'aiml109', title: 'Artificial Intelligence', sem: 5 },
                    { id: 'aiml110', title: 'Design and Analysis of Algorithms', sem: 5 },
                    { id: 'aiml111', title: 'Software Engineering', sem: 5 },
                    { id: 'aiml112', title: 'Machine Learning', sem: 6 },
                    { id: 'aiml113', title: 'Data Mining and Data Warehousing', sem: 6 },
                    { id: 'aiml114', title: 'Deep Learning', sem: 7 },
                    { id: 'aiml115', title: 'Natural Language Processing', sem: 7 }
                ]
            },
            {
                id: 'btech-ee',
                title: 'B.Tech - Electrical Engineering',
                semesters: 8,
                subjects: [
                    { id: 'ee101', title: 'Basic Civil Engineering', sem: 1 },
                    { id: 'ee102', title: 'Basic Electrical Engineering', sem: 1 },
                    { id: 'ee103', title: 'Mathematics-II', sem: 2 },
                    { id: 'ee104', title: 'Electrical Circuit Analysis', sem: 3 },
                    { id: 'ee105', title: 'Analog Electronics', sem: 3 },
                    { id: 'ee106', title: 'Electrical Machines-I', sem: 4 },
                    { id: 'ee107', title: 'Digital Electronics', sem: 4 },
                    { id: 'ee108', title: 'Control Systems', sem: 5 },
                    { id: 'ee109', title: 'Power Electronics', sem: 5 },
                    { id: 'ee110', title: 'Electrical Machines-II', sem: 5 },
                    { id: 'ee111', title: 'Power System-I', sem: 6 },
                    { id: 'ee112', title: 'Microcontroller and Interfacing', sem: 6 },
                    { id: 'ee113', title: 'Switchgear and Protection', sem: 7 },
                    { id: 'ee114', title: 'Power System Operation and Control', sem: 7 },
                    { id: 'ee115', title: 'Renewable Energy Engineering', sem: 8 }
                ]
            },
            {
                id: 'btech-me',
                title: 'B.Tech - Mechanical Engineering',
                semesters: 8,
                subjects: [
                    { id: 'me101', title: 'Basic Mechanical Engineering', sem: 1 },
                    { id: 'me102', title: 'Engineering Graphics & Design', sem: 2 },
                    { id: 'me103', title: 'Material Science and Metallurgy', sem: 3 },
                    { id: 'me104', title: 'Engineering Thermodynamics', sem: 3 },
                    { id: 'me105', title: 'Kinematics of Machines', sem: 4 },
                    { id: 'me106', title: 'Fluid Mechanics and Machines', sem: 4 },
                    { id: 'me107', title: 'Dynamics of Machines', sem: 5 },
                    { id: 'me108', title: 'Machine Design', sem: 5 },
                    { id: 'me109', title: 'Heat Transfer', sem: 5 },
                    { id: 'me110', title: 'Production Technology', sem: 6 },
                    { id: 'me111', title: 'Computer Aided Design (CAD)', sem: 6 },
                    { id: 'me112', title: 'Operations Research', sem: 7 },
                    { id: 'me113', title: 'Refrigeration & Air Conditioning', sem: 7 },
                    { id: 'me114', title: 'Automobile Engineering', sem: 8 },
                    { id: 'me115', title: 'Renewable Energy Engineering', sem: 8 }
                ]
            },
            {
                id: 'btech-civil',
                title: 'B.Tech - Civil Engineering',
                semesters: 8,
                subjects: [
                    { id: 'cv101', title: 'Basic Civil Engineering', sem: 1 },
                    { id: 'cv102', title: 'Environmental Sciences', sem: 2 },
                    { id: 'cv103', title: 'Building and Town Planning', sem: 3 },
                    { id: 'cv104', title: 'Surveying', sem: 3 },
                    { id: 'cv105', title: 'Geotechnics & Applied Geology', sem: 4 },
                    { id: 'cv106', title: 'Fluid Mechanics and Hydraulics', sem: 4 },
                    { id: 'cv107', title: 'Structural Analysis-I', sem: 4 },
                    { id: 'cv108', title: 'Highway Engineering', sem: 5 },
                    { id: 'cv109', title: 'Hydrology and Water Resources Engineering', sem: 5 },
                    { id: 'cv110', title: 'Design of Reinforced Concrete Structures', sem: 6 },
                    { id: 'cv111', title: 'Water and Wastewater Engineering', sem: 6 },
                    { id: 'cv112', title: 'Advanced Surveying', sem: 6 },
                    { id: 'cv113', title: 'Design of Steel Structures', sem: 7 },
                    { id: 'cv114', title: 'Construction Project Management', sem: 7 },
                    { id: 'cv115', title: 'Irrigation Engineering', sem: 8 }
                ]
            }
        ]
    },
    {
        id: 'computer-app',
        title: 'Faculty of Computer Applications',
        icon: 'Monitor',
        description: 'BCA and MCA programs focusing on software development and applications.',
        courses: [
            {
                id: 'bca',
                title: 'Bachelor of Computer Applications (BCA)',
                semesters: 6,
                subjects: [
                    { id: 'bca101', title: 'Communication Skills in English', sem: 1 },
                    { id: 'bca102', title: 'Mathematics for BCA', sem: 1 },
                    { id: 'bca103', title: 'Programming in C', sem: 1 },
                    { id: 'bca104', title: 'Computer Fundamentals and Organization', sem: 1 },
                    { id: 'bca105', title: 'Data Structures', sem: 2 },
                    { id: 'bca106', title: 'Database Management Systems', sem: 2 },
                    { id: 'bca107', title: 'Internet & Web Designing', sem: 2 },
                    { id: 'bca108', title: 'Object Oriented Concepts using C++', sem: 3 },
                    { id: 'bca109', title: 'Operations Research', sem: 3 },
                    { id: 'bca110', title: 'Programming in Core Java', sem: 4 },
                    { id: 'bca111', title: 'Computer Networks', sem: 4 },
                    { id: 'bca112', title: 'System Analysis & Design', sem: 4 },
                    { id: 'bca113', title: '.NET Technologies', sem: 5 },
                    { id: 'bca114', title: 'PHP & MySQL', sem: 5 },
                    { id: 'bca115', title: 'Software Engineering', sem: 6 }
                ]
            },
            {
                id: 'mca',
                title: 'Master of Computer Applications (MCA)',
                semesters: 4,
                subjects: [
                    { id: 'mca101', title: 'Programming for Problem Solving using OOP', sem: 1 },
                    { id: 'mca102', title: 'Relational Database Management System', sem: 1 },
                    { id: 'mca103', title: 'Computer Networks', sem: 1 },
                    { id: 'mca104', title: 'Software Engineering', sem: 1 },
                    { id: 'mca105', title: 'Python Programming', sem: 2 },
                    { id: 'mca106', title: 'Design & Analysis of Algorithms', sem: 2 },
                    { id: 'mca107', title: 'Cloud Computing', sem: 2 },
                    { id: 'mca108', title: 'Advanced Java', sem: 2 },
                    { id: 'mca109', title: 'Machine Learning', sem: 3 },
                    { id: 'mca110', title: 'Full Stack Web Development', sem: 3 },
                    { id: 'mca111', title: 'Information Security', sem: 3 },
                    { id: 'mca112', title: 'Mobile Application Development', sem: 3 },
                    { id: 'mca113', title: 'Big Data Tools', sem: 4 },
                    { id: 'mca114', title: 'Block Chain Technology', sem: 4 },
                    { id: 'mca115', title: 'Internet of Things (IoT)', sem: 4 }
                ]
            }
        ]
    },
    {
        id: 'management',
        title: 'Faculty of Management Studies',
        icon: 'Briefcase',
        description: 'BBA & MBA in Analytics, Digital Marketing, International Business.',
        courses: [
            {
                id: 'bba-gen',
                title: 'BBA - General Management',
                semesters: 6,
                subjects: [
                    { id: 'bba101', title: 'Principles of Management', sem: 1 },
                    { id: 'bba102', title: 'Financial Accounting', sem: 1 },
                    { id: 'bba103', title: 'Micro Economics', sem: 1 },
                    { id: 'bba104', title: 'Business Communication', sem: 1 },
                    { id: 'bba105', title: 'Marketing Management', sem: 2 },
                    { id: 'bba106', title: 'Cost Accounting', sem: 2 },
                    { id: 'bba107', title: 'Macro Economics', sem: 2 },
                    { id: 'bba108', title: 'Organizational Behavior', sem: 3 },
                    { id: 'bba109', title: 'Human Resource Management', sem: 3 },
                    { id: 'bba110', title: 'Corporate Accounting', sem: 3 },
                    { id: 'bba111', title: 'Financial Management', sem: 4 },
                    { id: 'bba112', title: 'Business Statistics', sem: 4 },
                    { id: 'bba113', title: 'Business Law', sem: 5 },
                    { id: 'bba114', title: 'Research Methodology', sem: 5 },
                    { id: 'bba115', title: 'Strategic Management', sem: 6 }
                ]
            },
            {
                id: 'mba',
                title: 'Master of Business Administration (MBA)',
                semesters: 4,
                subjects: [
                    { id: 'mba101', title: 'Managerial Communication', sem: 1 },
                    { id: 'mba102', title: 'Accounting for Managers', sem: 1 },
                    { id: 'mba103', title: 'Managerial Economics', sem: 1 },
                    { id: 'mba104', title: 'Quantitative Analysis', sem: 1 },
                    { id: 'mba105', title: 'Marketing Management', sem: 2 },
                    { id: 'mba106', title: 'Financial Management', sem: 2 },
                    { id: 'mba107', title: 'Human Resource Management', sem: 2 },
                    { id: 'mba108', title: 'Production and Operations Management', sem: 2 },
                    { id: 'mba109', title: 'Strategic Management', sem: 3 },
                    { id: 'mba110', title: 'Business Ethics & Corporate Governance', sem: 3 },
                    { id: 'mba111', title: 'Consumer Behavior', sem: 3 },
                    { id: 'mba112', title: 'Investment Banking', sem: 3 },
                    { id: 'mba113', title: 'Project Management', sem: 4 },
                    { id: 'mba114', title: 'International Business', sem: 4 },
                    { id: 'mba115', title: 'Logistics and Supply Chain Management', sem: 4 }
                ]
            }
        ]
    },
    {
        id: 'science-pharmacy',
        title: 'Faculty of Science & Pharmacy',
        icon: 'FlaskConical',
        description: 'B.Sc, M.Sc, and B.Pharma programs.',
        courses: [
            {
                id: 'bpharma',
                title: 'Bachelor of Pharmacy (B.Pharma)',
                semesters: 8,
                subjects: [
                    { id: 'phm101', title: 'Human Anatomy and Physiology-I', sem: 1 },
                    { id: 'phm102', title: 'Pharmaceutical Analysis-I', sem: 1 },
                    { id: 'phm103', title: 'Pharmaceutics-I', sem: 1 },
                    { id: 'phm104', title: 'Pharmaceutical Inorganic Chemistry', sem: 1 },
                    { id: 'phm105', title: 'Biochemistry', sem: 2 },
                    { id: 'phm106', title: 'Pathophysiology', sem: 2 },
                    { id: 'phm107', title: 'Pharmaceutical Organic Chemistry-II', sem: 3 },
                    { id: 'phm108', title: 'Physical Pharmaceutics-I', sem: 3 },
                    { id: 'phm109', title: 'Pharmaceutical Microbiology', sem: 3 },
                    { id: 'phm110', title: 'Medicinal Chemistry-I', sem: 4 },
                    { id: 'phm111', title: 'Pharmacology-I', sem: 4 },
                    { id: 'phm112', title: 'Pharmacognosy and Phytochemistry-I', sem: 4 },
                    { id: 'phm113', title: 'Industrial Pharmacy-I', sem: 5 },
                    { id: 'phm114', title: 'Biopharmaceutics and Pharmacokinetics', sem: 6 },
                    { id: 'phm115', title: 'Novel Drug Delivery System', sem: 7 }
                ]
            }
        ]
    },
    {
        id: 'law-arts',
        title: 'Faculty of Law & Arts',
        icon: 'Scale',
        description: 'BA, BA LLB (Hons), B.Com LLB (Hons), and LLM.',
        courses: [
            {
                id: 'ballb',
                title: 'BA LLB (Hons) - 5 Years Integrated',
                semesters: 10,
                subjects: [
                    { id: 'law101', title: 'General English', sem: 1 },
                    { id: 'law102', title: 'History-I', sem: 1 },
                    { id: 'law103', title: 'Law of Torts including Motor Vehicle Accidents', sem: 1 },
                    { id: 'law104', title: 'Law of Crimes-I (Indian Penal Code)', sem: 2 },
                    { id: 'law105', title: 'Law of Contract-I', sem: 2 },
                    { id: 'law106', title: 'Constitutional Law-I', sem: 3 },
                    { id: 'law107', title: 'Family Law-I', sem: 3 },
                    { id: 'law108', title: 'Jurisprudence', sem: 4 },
                    { id: 'law109', title: 'Company Law', sem: 5 },
                    { id: 'law110', title: 'Environmental Law', sem: 5 },
                    { id: 'law111', title: 'Public International Law', sem: 6 },
                    { id: 'law112', title: 'Property Law', sem: 6 },
                    { id: 'law113', title: 'Civil Procedure Code and Limitation Act', sem: 7 },
                    { id: 'law114', title: 'Law of Evidence', sem: 8 },
                    { id: 'law115', title: 'Drafting, Pleading and Conveyance', sem: 9 }
                ]
            }
        ]
    },
    {
        id: 'diploma-studies',
        title: 'Faculty of Diploma Studies',
        icon: 'Wrench',
        description: 'Diploma in Computer, Mechanical, Civil, Electrical, and Chemical Engineering.',
        courses: [
            {
                id: 'diploma-ce',
                title: 'Diploma in Computer Engineering',
                semesters: 6,
                subjects: [
                    { id: 'dce101', title: 'Basic Mathematics', sem: 1 },
                    { id: 'dce102', title: 'Environment Conservation & Hazard Management', sem: 1 },
                    { id: 'dce103', title: 'Fundamental of Computer Application', sem: 1 },
                    { id: 'dce104', title: 'Advanced Mathematics', sem: 2 },
                    { id: 'dce105', title: 'Static Web Page Designing', sem: 2 },
                    { id: 'dce106', title: 'Programming in C', sem: 2 },
                    { id: 'dce107', title: 'Data Structures', sem: 3 },
                    { id: 'dce108', title: 'Database Management Systems', sem: 3 },
                    { id: 'dce109', title: 'Computer Organization & Architecture', sem: 3 },
                    { id: 'dce110', title: 'Object Oriented Programming using C++', sem: 4 },
                    { id: 'dce111', title: 'Computer Networks', sem: 4 },
                    { id: 'dce112', title: 'Dynamic Web Page Development', sem: 5 },
                    { id: 'dce113', title: 'Java Programming', sem: 5 },
                    { id: 'dce114', title: 'Network Management & Administration', sem: 6 },
                    { id: 'dce115', title: 'Project', sem: 6 }
                ]
            },
            {
                id: 'diploma-me',
                title: 'Diploma in Mechanical Engineering',
                semesters: 6,
                subjects: [
                    { id: 'dme101', title: 'Basic Mathematics', sem: 1 },
                    { id: 'dme102', title: 'Engineering Drawing', sem: 1 },
                    { id: 'dme103', title: 'Engineering Physics', sem: 2 },
                    { id: 'dme104', title: 'Basic Mechanical Engineering', sem: 2 },
                    { id: 'dme105', title: 'Material Science & Metallurgy', sem: 3 },
                    { id: 'dme106', title: 'Thermodynamics', sem: 3 },
                    { id: 'dme107', title: 'Manufacturing Engineering-I', sem: 3 },
                    { id: 'dme108', title: 'Fluid Mechanics & Hydraulic Machines', sem: 4 },
                    { id: 'dme109', title: 'Theory of Machines', sem: 4 },
                    { id: 'dme110', title: 'Thermal Engineering-I', sem: 4 },
                    { id: 'dme111', title: 'Thermal Engineering-II', sem: 5 },
                    { id: 'dme112', title: 'Design of Machine Elements', sem: 5 },
                    { id: 'dme113', title: 'Computer Aided Design', sem: 6 },
                    { id: 'dme114', title: 'Industrial Management', sem: 6 },
                    { id: 'dme115', title: 'Project', sem: 6 }
                ]
            },
            {
                id: 'diploma-cv',
                title: 'Diploma in Civil Engineering',
                semesters: 6,
                subjects: [
                    { id: 'dcv101', title: 'Basic Mathematics', sem: 1 },
                    { id: 'dcv102', title: 'Engineering Drawing', sem: 1 },
                    { id: 'dcv103', title: 'Basic Physics (Group-1)', sem: 2 },
                    { id: 'dcv104', title: 'Applied Mechanics', sem: 2 },
                    { id: 'dcv105', title: 'Construction Materials', sem: 3 },
                    { id: 'dcv106', title: 'Surveying', sem: 3 },
                    { id: 'dcv107', title: 'Hydraulics', sem: 3 },
                    { id: 'dcv108', title: 'Advanced Surveying', sem: 4 },
                    { id: 'dcv109', title: 'Structural Mechanics', sem: 4 },
                    { id: 'dcv110', title: 'Water Supply & Sanitary Engineering', sem: 4 },
                    { id: 'dcv111', title: 'Design of Steel Structures', sem: 5 },
                    { id: 'dcv112', title: 'Estimating & Costing', sem: 5 },
                    { id: 'dcv113', title: 'Highway Engineering', sem: 5 },
                    { id: 'dcv114', title: 'Design of Reinforced Concrete Structures', sem: 6 },
                    { id: 'dcv115', title: 'Construction Quality Control', sem: 6 }
                ]
            },
            {
                id: 'diploma-ee',
                title: 'Diploma in Electrical Engineering',
                semesters: 6,
                subjects: [
                    { id: 'dee101', title: 'Basic Mathematics', sem: 1 },
                    { id: 'dee102', title: 'Engineering Drawing', sem: 1 },
                    { id: 'dee103', title: 'DC Circuits', sem: 2 },
                    { id: 'dee104', title: 'Basic Mechanical Engineering', sem: 2 },
                    { id: 'dee105', title: 'AC Circuits', sem: 3 },
                    { id: 'dee106', title: 'Electrical Machines-I', sem: 3 },
                    { id: 'dee107', title: 'Electrical Instrumentation', sem: 3 },
                    { id: 'dee108', title: 'Transmission & Distribution', sem: 4 },
                    { id: 'dee109', title: 'Electrical Machines-II', sem: 4 },
                    { id: 'dee110', title: 'Wiring Estimating, Costing & Contracting', sem: 5 },
                    { id: 'dee111', title: 'Power Electronics', sem: 5 },
                    { id: 'dee112', title: 'Microprocessor and Controller', sem: 5 },
                    { id: 'dee113', title: 'Switchgear & Protection', sem: 6 },
                    { id: 'dee114', title: 'Utilization of Electrical Energy', sem: 6 },
                    { id: 'dee115', title: 'Project', sem: 6 }
                ]
            },
            {
                id: 'diploma-ch',
                title: 'Diploma in Chemical Engineering',
                semesters: 6,
                subjects: [
                    { id: 'dch101', title: 'Basic Mathematics', sem: 1 },
                    { id: 'dch102', title: 'Basic Chemistry', sem: 1 },
                    { id: 'dch103', title: 'Process Calculation', sem: 2 },
                    { id: 'dch104', title: 'Fluid Flow Operation', sem: 3 },
                    { id: 'dch105', title: 'Chemical Process Industries-I', sem: 3 },
                    { id: 'dch106', title: 'Heat Transfer', sem: 4 },
                    { id: 'dch107', title: 'Chemical Process Industries-II', sem: 4 },
                    { id: 'dch108', title: 'Mass Transfer-I', sem: 5 },
                    { id: 'dch109', title: 'Chemical Reaction Engineering', sem: 5 },
                    { id: 'dch110', title: 'Mass Transfer-II', sem: 6 },
                    { id: 'dch111', title: 'Petrochemical Technology', sem: 6 },
                    { id: 'dch112', title: 'Fertilizer Technology', sem: 6 },
                    { id: 'dch113', title: 'Plant Safety & Maintenance', sem: 5 },
                    { id: 'dch114', title: 'Thermodynamics', sem: 4 },
                    { id: 'dch115', title: 'Pollution Control & Effluent Treatment', sem: 6 }
                ]
            }
        ]
    }
];

// Append exams array
domains.forEach(d => {
    d.courses.forEach(c => {
        c.subjects.forEach(s => {
            s.exams = ['mid-1', 'mid-2', 'final'];
        });
    });
});

let mockDataJs = `export const domains = ${JSON.stringify(domains, null, 2)};\n\n`;
mockDataJs += `export const examPrompts = {
  'mid-1': {
    title: 'Mid-Term 1 (Theory)',
    timeMinutes: 60,
    totalMarks: 30,
    type: 'subjective',
    description: 'Strict evaluation reflecting Marwadi University\\'s first internal evaluation covering the initial 40% syllabus.'
  },
  'mid-2': {
    title: 'Mid-Term 2 (MCQ / Objective)',
    timeMinutes: 45,
    totalMarks: 30,
    type: 'objective',
    description: 'High-accuracy objective examination format conforming to university grading patterns.'
  },
  'final': {
    title: 'Final Examination (End Semester Review)',
    timeMinutes: 180,
    totalMarks: 100,
    type: 'subjective',
    description: 'End Semester University Examination (ESUE) mapping exactly to standard university blue-print and weightage.'
  }
};
`;

fs.writeFileSync('src/data/mockData.js', mockDataJs);

// Generate huge explicit syllabus intelligently 
const universitySyllabus = {};

// Generator function
function generateChapters(subjectTitle) {
    if (subjectTitle.includes('Programming') || subjectTitle.includes('C++') || subjectTitle.includes('Java')) {
        return [
            { title: "Introduction & Syntax", concepts: ["Data Types", "Variables", "Control Structures", "Operators", "Console I/O"] },
            { title: "Object Oriented Concepts", concepts: ["Classes", "Objects", "Inheritance", "Polymorphism", "Encapsulation"] },
            { title: "Advanced Topics", concepts: ["Exception Handling", "File I/O", "Multithreading", "Memory Management", "Collections"] },
            { title: "Frameworks & Implementation", concepts: ["Design Patterns", "GUI Building", "Database Connectivity", "Applets"] }
        ];
    } else if (subjectTitle.includes('Design') || subjectTitle.includes('CAD')) {
        return [
            { title: "Fundamentals of Design", concepts: ["Design Process", "Materials Selection", "Stress Analysis", "Safety Factors"] },
            { title: "Component Design", concepts: ["Shafts and Keys", "Couplings", "Springs", "Fasteners", "Welded Joints"] },
            { title: "Advanced Design", concepts: ["Gears Design", "Bearings", "Clutches and Brakes", "Pressure Vessels"] },
            { title: "Computer Aided Practices", concepts: ["AutoCAD Basics", "SolidWorks", "Finite Element Basics", "Optimization"] }
        ];
    } else if (subjectTitle.includes('Mathematics') || subjectTitle.includes('Math')) {
        return [
            { title: "Calculus", concepts: ["Limits", "Derivatives", "Integrals", "Differential Equations", "Taylor Series"] },
            { title: "Linear Algebra", concepts: ["Matrices", "Determinants", "Eigenvalues", "Vector Spaces", "Transformations"] },
            { title: "Numerical Methods", concepts: ["Root Finding", "Interpolation", "Numerical Integration", "Curve Fitting"] },
            { title: "Probability", concepts: ["Distributions", "Bayes Theorem", "Statistics Basics", "Random Variables"] }
        ];
    }

    // Generic highly technical filler
    return [
        { title: `Fundamentals of ${subjectTitle}`, concepts: ["Core Principles", "Historical Context", "System Architecture", "Basic Definitions", "Analytical Approach"] },
        { title: `Advanced Analysis in ${subjectTitle}`, concepts: ["Mathematical Modeling", "Performance Metrics", "Asymptotic Bounds", "Optimization Strategies", "Component Analysis"] },
        { title: `Practical Applications`, concepts: ["Industry Standards", "Implementation Challenges", "Case Studies", "Prototyping", "Integration"] },
        { title: `Edge Cases & Constraints`, concepts: ["Failure States", "Boundary Conditions", "Fault Tolerance", "Scalability", "Security Concerns"] }
    ];
}

domains.forEach(d => {
    d.courses.forEach(c => {
        c.subjects.forEach(s => {
            universitySyllabus[s.id] = { chapters: generateChapters(s.title) };
        });
    });
});

let syllabusOutput = `export const universitySyllabus = ${JSON.stringify(universitySyllabus, null, 4)};\n\n`;
syllabusOutput += `export const examTemplates = {
    mcq: {
        easy: [
            "Which of the following defines {concept} in {chapter}?",
            "Identify the correct application of {concept}.",
            "In {chapter}, what is the main purpose of {concept}?",
            "The term '{concept}' is best described by which statement?",
            "Which principle strictly applies to {concept}?"
        ],
        medium: [
            "Given a standard university scenario in {chapter}, how does {concept} affect the outcome?",
            "Evaluate the difference between {concept} and conventional methods in {chapter}.",
            "When executing {concept}, which parameter is considered critical?",
            "Which statement mathematically/theoretically validates {concept}?",
            "What is the expected behavior when {concept} operates within {chapter} limits?"
        ],
        hard: [
            "Analyze the failure state of {concept} under an edge-case condition in {chapter}. Which assumption breaks?",
            "Determine the asymptotic bounds or limits of {concept}. Which statement is absolutely true?",
            "If {concept} is improperly scaled up in a real-world application of {chapter}, what is the cascading impact?",
            "Which undocumented or complex side-effect of {concept} must an advanced engineer/professional mitigate?",
            "Evaluate a mixed paradigm incorporating {concept}. Which constraint fundamentally contradicts standard {chapter} theory?"
        ]
    },
    theory: {
        mid1: [
            "(a) Define {concept}. (b) Explain its importance in the context of {chapter} with a diagram. [7 Marks]",
            "Differentiate the key mechanisms behind {concept}. Demonstrate an application in {chapter}. [7 Marks]",
            "Write a detailed technical note on {concept}. Illustrate its primary phases. [7 Marks]",
            "Examine the core working principles of {concept} found in module {chapter}. [7 Marks]",
            "State and mathematically/logically prove the properties related to {concept}. [7 Marks]"
        ],
        final: [
            "Design an extensive structural/architectural framework in {chapter} utilizing {concept} effectively to handle heavy loads. Explain all assumptions. [14 Marks]",
            "Critically analyze {concept} against modern industrial/commercial standards. Discuss specific trade-offs and suggest an improvement. [14 Marks]",
            "A complex scenario in {chapter} fails precisely due to a bottleneck at {concept}. Detail a root cause analysis and step-by-step mitigation strategy. [14 Marks]",
            "Derive the foundational models/theorems of {concept} from first principles and discuss any edge-case limitations present in {chapter}. [14 Marks]",
            "Propose a comprehensive implementation plan integrating {concept} to resolve an unmet engineering/business need within {chapter}. Justify your selections. [14 Marks]"
        ]
    }
};`;

fs.writeFileSync('src/data/universitySyllabus.js', syllabusOutput);
console.log("Success! Generated 15 subjects per course across 12+ courses mapping to Marwadi University.");
