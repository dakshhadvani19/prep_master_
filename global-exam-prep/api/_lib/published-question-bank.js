const MAX_RUBRIC_ITEMS = { 1: 1, 2: 2, 4: 6, 8: 12 };

function cleanLines(value) {
    return String(value || '').split(/\r?\n/)
        .map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
        .filter(line => line && !/^generated draft/i.test(line));
}

function allocateRubricMarks(totalMarks, count) {
    const units = Math.round(Number(totalMarks) * 2);
    const base = Math.floor(units / count);
    const remainder = units - base * count;
    return Array.from({ length: count }, (_, index) => (base + (index < remainder ? 1 : 0)) / 2);
}

export function normalizePublishedTheoryRubric(rawRubric, marks, modelAnswer) {
    const maximum = MAX_RUBRIC_ITEMS[Number(marks)];
    if (!maximum || !Number.isInteger(Number(marks))) return [];
    const lines = cleanLines(rawRubric);
    const usefulLines = lines.filter(line => !/[:—-]\s*0(?:\.0+)?\s*marks?\.?$/i.test(line));
    const weighted = usefulLines.map(line => {
        const match = line.match(/^(.+?)\s*[:—-]\s*(\d+(?:\.\d+)?)\s*marks?\.?$/i);
        return match ? { criterion: match[1].trim(), marks: Number(match[2]) } : null;
    });
    let criteria = [];
    if (weighted.length && weighted.every(Boolean)
        && weighted.reduce((sum, item) => sum + item.marks, 0) === Number(marks)
        && weighted.every(item => item.marks > 0 && Number.isInteger(item.marks * 2))) {
        criteria = weighted;
    } else {
        const candidates = (usefulLines.length ? usefulLines : cleanLines(modelAnswer)).slice(0, maximum);
        criteria = (candidates.length ? candidates : ['Accuracy and correctness']).map(criterion => ({ criterion }));
        const allocations = allocateRubricMarks(marks, criteria.length);
        criteria = criteria.map((item, index) => ({ ...item, marks: allocations[index] }));
    }
    if (criteria.length > maximum) {
        const head = criteria.slice(0, maximum - 1);
        const tail = criteria.slice(maximum - 1);
        criteria = [...head, {
            criterion: tail.map(item => item.criterion).join('; '),
            marks: tail.reduce((sum, item) => sum + item.marks, 0),
        }];
    }
    const sum = criteria.reduce((value, item) => value + item.marks, 0);
    if (Math.abs(sum - Number(marks)) > 1e-8) return [];
    return criteria.map(item => ({
        criterion: item.criterion,
        marks: item.marks,
        keyPoints: [item.criterion],
        acceptedAlternatives: [],
    }));
}

function inferAnswerFormat(questionText, modelAnswer) {
    const text = (String(questionText || '') + ' ' + String(modelAnswer || '')).toLowerCase();
    if (/\b(write|implement|program|code)\b/.test(text)) return 'code';
    if (/\b(calculate|solve|derive|compute|numerical)\b/.test(text)) return 'worked_solution';
    if (/\b(draw|diagram|architecture|flowchart)\b/.test(text)) return 'diagram';
    if (/\b(differentiate|compare|distinguish)\b/.test(text)) return 'comparison';
    return 'points';
}

export function buildPublishedExamQuestions({ rows, examInfo, difficulty, markSequence }) {
    if (!Array.isArray(rows) || !rows.length) return null;
    if (examInfo.type === 'objective') {
        if (rows.length !== 30) return null;
        const questions = rows.map((row, index) => {
            const options = Array.isArray(row.options) ? row.options : [];
            const answer = Number(row.correct_option_index);
            if (row.question_type !== 'mcq' || options.length !== 4 || !Number.isInteger(answer) || answer < 0 || answer > 3) return null;
            return { id: 'bank_' + (row.id || index + 1), text: String(row.question_text || '').trim(), options: options.map(String), answer, type: 'mcq', difficulty };
        });
        if (questions.some(question => !question || !question.text)) return null;
        return {
            questions,
            answerKey: Object.fromEntries(questions.map(question => [question.id, question.answer])),
            totalMarks: examInfo.totalMarks,
            timeMinutes: examInfo.timeMinutes,
        };
    }

    if (!Array.isArray(markSequence) || !markSequence.length) return null;
    const used = new Set();
    const selected = [];
    for (const marks of markSequence) {
        const index = rows.findIndex((row, rowIndex) =>
            !used.has(rowIndex) && row.question_type === 'theory'
            && Number(row.marks) === marks && String(row.model_answer || '').trim().length > 0
        );
        if (index < 0) return null;
        used.add(index);
        const row = rows[index];
        const rubric = normalizePublishedTheoryRubric(row.rubric, marks, row.model_answer);
        if (!rubric.length) return null;
        selected.push({
            id: 'bank_' + (row.id || selected.length + 1),
            text: String(row.question_text || '').trim(),
            marks,
            answer: String(row.model_answer).trim(),
            answerFormat: inferAnswerFormat(row.question_text, row.model_answer),
            rubric,
            type: 'subjective',
            difficulty,
        });
    }
    if (selected.some(question => !question.text)) return null;
    return { questions: selected, answerKey: {}, totalMarks: examInfo.totalMarks, timeMinutes: examInfo.timeMinutes };
}

export function toStudentBankQuestions(questions) {
    return questions.map(question => {
        const safe = { ...question };
        delete safe.answer;
        delete safe.answerFormat;
        delete safe.rubric;
        delete safe.correct_option_index;
        return safe;
    });
}
