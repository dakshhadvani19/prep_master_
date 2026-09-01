const fs = require('fs');

const dataFilePath = './src/data/mockData.js';
let dataContent = fs.readFileSync(dataFilePath, 'utf8');

const engineeringData = [
    { title: 'Calculus', semester: 1 },
    { title: 'Basics of Electrical & Electronics Engineering', semester: 1 },
    { title: 'Computer Programming', semester: 1 },
    { title: 'Engineering Physics', semester: 1 },
    { title: 'Linear Algebra', semester: 2 },
    { title: 'Object Oriented Programming', semester: 2 },
    { title: 'Probability and Statistics', semester: 3 },
    { title: 'Data Structure', semester: 3 },
    { title: 'Database Management System', semester: 3 },
    { title: 'Design and Analysis of Algorithm', semester: 4 },
    { title: 'Advanced Java Programming', semester: 4 },
    { title: 'Software Engineering', semester: 6 },
    { title: 'Compiler Design', semester: 6 },
    { title: 'Computer Security', semester: 6 },
    { title: 'Artificial Intelligence', semester: 7 },
    { title: 'Major Project - I', semester: 7 }
];

const managementData = [
    { title: 'Principles of Management', semester: 1 },
    { title: 'Micro Economics', semester: 1 },
    { title: 'Fundamentals of Accounting', semester: 1 },
    { title: 'Business Laws', semester: 1 },
    { title: 'Macroeconomics', semester: 2 },
    { title: 'Organizational Behavior', semester: 2 },
    { title: 'Marketing Management', semester: 3 },
    { title: 'Financial Management', semester: 3 },
    { title: 'Cost Accounting', semester: 3 },
    { title: 'Production & Operations Management', semester: 4 },
    { title: 'Income Tax', semester: 4 },
    { title: 'Management of Financial Markets', semester: 5 },
    { title: 'Retail Marketing', semester: 5 },
    { title: 'Advertising Management', semester: 6 },
    { title: 'Business Ethics & Corporate Governance', semester: 6 }
];

const pharmacyData = [
    { title: 'Human Anatomy and Physiology I', semester: 1 },
    { title: 'Pharmaceutical Analysis I', semester: 1 },
    { title: 'Pharmaceutics I', semester: 1 },
    { title: 'Pharmaceutical Organic Chemistry I', semester: 2 },
    { title: 'Pharmaceutical Engineering', semester: 2 },
    { title: 'Physical Pharmaceutics-I', semester: 3 },
    { title: 'Biochemistry', semester: 3 },
    { title: 'Pharmacognosy and Phytochemistry-I', semester: 3 },
    { title: 'Medicinal Chemistry-I', semester: 4 },
    { title: 'Pharmacology-I', semester: 4 },
    { title: 'Pharmaceutical Jurisprudence', semester: 4 },
    { title: 'Medicinal Chemistry-II', semester: 5 },
    { title: 'Pharmacology-II', semester: 5 },
    { title: 'Pharmaceutical Microbiology', semester: 5 },
    { title: 'Biopharmaceutics and Pharmacokinetics', semester: 6 },
    { title: 'Instrumental Methods of Analysis', semester: 7 },
    { title: 'Novel Drug Delivery Systems', semester: 7 },
    { title: 'Biostatistics and Research Methodology', semester: 8 },
    { title: 'Pharmacovigilance', semester: 8 }
];

function buildSubjectArray(dataList, prefix) {
    return dataList.map((item, index) => {
        return "{ id: '" + prefix + (index + 1) + "', title: '" + item.title + "', semester: " + item.semester + ", exams: [ { type: 'mid-1', title: 'Mid-Term 1 (Theory)', timeMinutes: 60, totalMarks: 30, questionsCount: 4 }, { type: 'mid-2', title: 'Mid-Term 2 (MCQ / Objective)', timeMinutes: 45, totalMarks: 30, questionsCount: 30 }, { type: 'final', title: 'Final Examination (End Semester Review)', timeMinutes: 180, totalMarks: 100, questionsCount: 7 } ] }";
    }).join(',\\n');
}

const engSubjects = buildSubjectArray(engineeringData, 'ce1_s');
const engRegex = /(id: 'ce',[\s\S]*?id: 'ce1',[\s\S]*?subjects: \[)([\s\S]*?)(\])/;
dataContent = dataContent.replace(engRegex, "$1" + engSubjects + "$3");

const mgtSubjects = buildSubjectArray(managementData, 'mgt1_s');
const mgtRegex = /(id: 'mgt',[\s\S]*?id: 'mgt1',[\s\S]*?subjects: \[)([\s\S]*?)(\])/;
dataContent = dataContent.replace(mgtRegex, "$1" + mgtSubjects + "$3");

const rxSubjects = buildSubjectArray(pharmacyData, 'rx1_s');
const rxRegex = /(id: 'pharmacy',[\s\S]*?id: 'rx1',[\s\S]*?subjects: \[)([\s\S]*?)(\])/;
dataContent = dataContent.replace(rxRegex, "$1" + rxSubjects + "$3");

fs.writeFileSync(dataFilePath, dataContent, 'utf8');
console.log("Successfully patched Marwadi University subjects.");
