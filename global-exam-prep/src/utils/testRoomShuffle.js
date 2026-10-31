/**
 * Utilities for per-participant Test Room question/option shuffling.
 * Display order is separate from canonical question and option indexes.
 */

export function shuffleArray(items, random = Math.random) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
}

function normalizeOptions(options) {
    if (!Array.isArray(options)) return [];
    return options.map((option, index) => {
        if (option && typeof option === 'object') {
            const originalOptionIndex = Number.isInteger(option.originalOptionIndex)
                ? option.originalOptionIndex
                : index;
            return {
                text: String(option.text ?? option.label ?? ''),
                originalOptionIndex,
            };
        }
        return { text: String(option ?? ''), originalOptionIndex: index };
    });
}

/**
 * Attach immutable canonical indexes before creating a participant-specific view.
 * Correct answers are retained only in the host's local canonical copy.
 */
export function buildCanonicalRoomQuestions(questions) {
    if (!Array.isArray(questions)) return [];
    return questions.map((question, canonicalIndex) => ({
        id: String(question?.id || ('room_q' + canonicalIndex)),
        canonicalIndex,
        text: String(question?.text || ''),
        options: normalizeOptions(question?.options),
        ...(Number.isInteger(question?.answer) ? { answer: question.answer } : {}),
    }));
}

/** Student-safe canonical questions. Correct answers and review metadata are omitted. */
export function makeSafeRoomQuestions(questions) {
    return buildCanonicalRoomQuestions(questions).map(({ id, canonicalIndex, text, options }) => ({
        id,
        canonicalIndex,
        text,
        options,
    }));
}

/**
 * Shuffle the question list and each question's options independently while
 * preserving canonical question/option identities for answer mapping.
 */
export function shuffleRoomQuestions(questions, random = Math.random) {
    const canonical = buildCanonicalRoomQuestions(questions);
    return shuffleArray(
        canonical.map((question) => ({
            ...question,
            options: shuffleArray(question.options, random),
        })),
        random,
    );
}

/**
 * Convert a participant's displayed choices into canonical order. The input map
 * is canonicalQuestionIndex -> original option index; -1 means unanswered.
 */
export function toCanonicalAnswerArray(answers, questionCount) {
    return Array.from({ length: questionCount }, (_, index) => {
        const raw = answers?.[index] ?? answers?.[String(index)];
        return Number.isInteger(raw) && raw >= 0 && raw <= 3 ? raw : -1;
    });
}

/** Score canonical option indexes against the host-only answer key. */
export function scoreRoomAnswers(questions, answerArray) {
    const canonical = buildCanonicalRoomQuestions(questions);
    let correct = 0;
    let attempted = 0;

    canonical.forEach((question, index) => {
        const selected = Array.isArray(answerArray)
            ? answerArray[index]
            : answerArray?.[question.canonicalIndex];
        if (!Number.isInteger(selected) || selected < 0) return;
        attempted += 1;
        if (selected === question.answer) correct += 1;
    });

    return {
        correct,
        incorrect: attempted - correct,
        attempted,
        unattempted: Math.max(0, canonical.length - attempted),
        points: correct,
        totalQuestions: canonical.length,
    };
}
