export function isUnansweredAnswer(value) {
    return value === undefined
        || value === null
        || value === -1
        || value === '-1'
        || (typeof value === 'string' && value.trim() === '');
}

export function getReviewStatus(question, userAnswers, isObjective) {
    const answer = userAnswers?.[question?.id];
    if (isUnansweredAnswer(answer)) return 'unattempted';
    if (!isObjective) return 'attempted';

    const selectedIndex = Number(answer);
    const correctIndex = Number(question?.answer);
    return Number.isInteger(selectedIndex)
        && selectedIndex >= 0
        && selectedIndex <= 3
        && Number.isInteger(correctIndex)
        && correctIndex >= 0
        && correctIndex <= 3
        && selectedIndex === correctIndex
        ? 'correct'
        : 'wrong';
}

export function filterReviewQuestionIndices(questions, userAnswers, isObjective, filter) {
    const source = Array.isArray(questions) ? questions : [];
    if (!filter || filter === 'all') return source.map((_, index) => index);

    return source.reduce((indices, question, index) => {
        const status = getReviewStatus(question, userAnswers, isObjective);
        const matches = filter === 'attempted'
            ? status === 'correct' || status === 'wrong' || status === 'attempted'
            : status === filter;
        if (matches) indices.push(index);
        return indices;
    }, []);
}

export function getReviewOptionState(optionIndex, correctAnswer, userAnswer) {
    const index = Number(optionIndex);
    const correctIndex = Number(correctAnswer);
    const selectedIndex = Number(userAnswer);
    const hasCorrectAnswer = Number.isInteger(correctIndex) && correctIndex >= 0 && correctIndex <= 3;
    const hasUserAttempt = !isUnansweredAnswer(userAnswer);
    const isCorrect = hasCorrectAnswer && index === correctIndex;
    const isUserChoice = hasUserAttempt && index === selectedIndex;

    return {
        isCorrect,
        isUserChoice,
        isWrongChoice: isUserChoice && !isCorrect,
    };
}
