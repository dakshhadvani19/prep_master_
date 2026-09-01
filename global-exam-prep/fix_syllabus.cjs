const fs = require('fs');
const path = require('path');

const syllabusPath = path.resolve('src/data/universitySyllabus.js');
const newSyllabusDataPath = path.resolve('comp_apps_syllabus.json');

const newSyllabusData = JSON.parse(fs.readFileSync(newSyllabusDataPath, 'utf8'));
let content = fs.readFileSync(syllabusPath, 'utf8');

// 1. Find the FIRST occurrence of export const universitySyllabus = {
// 2. Find the FIRST occurrence of }; that closes universitySyllabus.
// Based on my view_file, universitySyllabus is the first object exported.
const closingBraceIndex = content.indexOf('\n};');

if (closingBraceIndex === -1) {
    console.error('Could not find the closing brace of universitySyllabus');
    process.exit(1);
}

// Extract the original content up to that closing brace
let baselineContent = content.slice(0, closingBraceIndex);

// Append the new BCA/MCA subjects to the universitySyllabus object
let newEntriesString = "";
for (const [key, value] of Object.entries(newSyllabusData)) {
    newEntriesString += `,\n    "${key}": ${JSON.stringify(value, null, 8).replace(/\n/g, '\n    ').trim()}`;
}

baselineContent += newEntriesString + '\n};';

// Now add the examTemplates
const examTemplatesStr = `

export const examTemplates = {
    mcq: {
        easy: [
            "Which of the following defines {concept} in {chapter}?",
            "Identify the correct application of {concept}.",
            "In {chapter}, what is the main purpose of {concept}?",
            "The term '{concept}' is best described by which statement?",
            "Which principle strictly applies to {concept}?"
        ],
        medium: [
            "Given a scenario in {chapter}, how does {concept} affect the outcome?",
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
};
`;

fs.writeFileSync(syllabusPath, baselineContent + examTemplatesStr);
console.log('Successfully cleaned and fixed universitySyllabus.js');
