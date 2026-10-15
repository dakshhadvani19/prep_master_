/**
 * The former static generator fabricated generic answer options from topic labels.
 * That cannot reliably establish a single defensible answer or plausible distractors.
 * The active exam flow now requires a validated set from generateQuestionsFromText.
 *
 * Keep this export temporarily for compatibility with any old import, but fail clearly
 * rather than silently serving placeholder questions.
 */
export const generateExamQuestions = () => {
    throw new Error(
        'Static placeholder question generation is disabled. Generate questions from verified study material and pass the validated set to the exam interface.'
    );
};
