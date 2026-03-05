import { universitySyllabus, examTemplates } from './universitySyllabus.js';

// Seeded random number generator so an exam generation is somewhat deterministic
// if we use a specific seed, but Math.random() is fine since ExamPortal caches the result
// in its state on mount.
function _shuffle(array) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

const generateDistractors = (correctAnswer, category, difficulty) => {
    // Generate specialized distinct distractors based on difficulty
    if (difficulty === 'hard') {
        return [
            `A highly plausible edge-case involving ${category}`,
            `Inverse or corrupted boundary of ${correctAnswer}`,
            `Technically accurate but theoretically irrelevant to ${category}`
        ];
    } else if (difficulty === 'medium') {
        return [
            `A standard misconception related to ${correctAnswer}`,
            `Common failure state of ${category}`,
            `Opposite mechanism of ${correctAnswer}`
        ];
    } else {
        return [
            `Syntax/Logic error related to ${category}`,
            `Basic invalid property`,
            `Out of scope definition for ${correctAnswer}`
        ];
    }
};

export const generateExamQuestions = (subjectId, examType, difficulty) => {
    // Find syllabus, fallback to generic CS/Engineering outline if not explicitly defined
    const syllabus = universitySyllabus[subjectId] || universitySyllabus['ce101'];
    const questions = [];

    let validChapters = syllabus.chapters;
    // Mid 1 usually covers the first 50-60% of the syllabus
    if (examType === 'mid-1') {
        validChapters = syllabus.chapters.slice(0, Math.ceil(syllabus.chapters.length / 2));
    }

    if (examType === 'mid-2') {
        // Generate robust MCQ set (30 MCQ for standard exams)
        const count = difficulty === 'hard' ? 40 : difficulty === 'medium' ? 30 : 25;
        const templates = examTemplates.mcq[difficulty] || examTemplates.mcq.medium;

        const pool = [];
        validChapters.forEach(chapter => {
            chapter.concepts.forEach(concept => {
                templates.forEach(template => {
                    pool.push({ chapter, concept, template });
                });
            });
        });
        _shuffle(pool);

        for (let i = 0; i < count; i++) {
            const { chapter, concept, template } = pool[i % pool.length];

            let text = `[Objective] ` + template.replace('{chapter}', chapter.title).replace('{concept}', concept);

            const correctOption = `The rigorous definition/mechanism of ${concept}`;
            const wrongOptions = generateDistractors(correctOption, chapter.title, difficulty);

            const allOptions = [correctOption, ...wrongOptions];
            const sortedOptions = allOptions.map(value => ({ value, sort: Math.random() }))
                .sort((a, b) => a.sort - b.sort)
                .map(({ value }) => value);

            questions.push({
                id: i + 1,
                text,
                options: sortedOptions,
                answer: sortedOptions.indexOf(correctOption)
            });
        }
    } else {
        // Subjective (Mid 1 or Final)
        // Mid 1: typically 4 questions of 7 marks = 28 ~ 30 marks
        // Final: typically 7 questions, varying 7/14 marks totaling ~70-100 marks
        const count = examType === 'final' ? 7 : 4;
        const templates = examType === 'final' ? examTemplates.theory.final : examTemplates.theory.mid1;

        const pool = [];
        validChapters.forEach(chapter => {
            chapter.concepts.forEach(concept => {
                templates.forEach(template => {
                    pool.push({ chapter, concept, template });
                });
            });
        });
        _shuffle(pool);

        let runningMarks = 0;

        for (let i = 0; i < count; i++) {
            const { chapter, concept, template } = pool[i % pool.length];

            let tag = examType === 'final' ? `[End Semester Exam]` : `[Mid Sem 1]`;
            let rawText = template.replace('{chapter}', chapter.title).replace('{concept}', concept);

            // Extract the [X Marks] specifically to pass it into the object properly, then remove it from rawText
            let marks = 7;
            if (rawText.includes('[14 Marks]')) {
                marks = 14;
                rawText = rawText.replace(' [14 Marks]', '');
            } else if (rawText.includes('[7 Marks]')) {
                marks = 7;
                rawText = rawText.replace(' [7 Marks]', '');
            } else {
                marks = examType === 'final' ? 14 : 7;
            }

            let text = `${tag} Q${i + 1}. ${rawText}`;
            runningMarks += marks;

            questions.push({
                id: i + 1,
                marks,
                text
            });
        }
    }

    return questions;
};
