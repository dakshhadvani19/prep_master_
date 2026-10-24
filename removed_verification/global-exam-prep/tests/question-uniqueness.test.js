import { describe, it, expect, vi } from 'vitest';
import {
  filterUniqueQuestions,
  isNearDuplicate,
  normalizeQuestionText,
} from '../src/utils/questionUniqueness.js';
import {
  generateQuestionsFromText,
  parseGroqQuestions,
  MAX_GENERATION_ROUNDS,
} from '../src/utils/geminiQuestions.js';

function groqPayload(questions) {
  return {
    id: 'chatcmpl-test',
    choices: [{ message: { content: JSON.stringify({ questions }) } }],
  };
}

function mcq(id, text, answer = 0) {
  return {
    id,
    text,
    options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
    answer,
  };
}

function fetchSequence(payloads) {
  let i = 0;
  return vi.fn(async () => {
    const body = payloads[Math.min(i, payloads.length - 1)];
    i += 1;
    return {
      ok: true,
      json: async () => body,
    };
  });
}

describe('normalizeQuestionText', () => {
  it('treats case, punctuation, and whitespace as the same question', () => {
    expect(normalizeQuestionText('  What is OS??')).toBe(
      normalizeQuestionText('what is os')
    );
  });
});

describe('isNearDuplicate', () => {
  it('detects exact duplicates', () => {
    expect(isNearDuplicate('Define deadlock.', 'Define deadlock.')).toBe(true);
  });
  it('detects punctuation/case variants', () => {
    expect(isNearDuplicate('What is a process?', 'what is a process')).toBe(true);
  });
  it('detects high-overlap paraphrases', () => {
    expect(
      isNearDuplicate(
        'Explain the working of the round robin cpu scheduling algorithm in detail',
        'Explain in detail the working of the round robin cpu scheduling algorithm'
      )
    ).toBe(true);
  });
  it('does not treat genuinely different questions as duplicates', () => {
    expect(
      isNearDuplicate(
        'Derive the time complexity of merge sort.',
        'Write a C program to reverse a linked list.'
      )
    ).toBe(false);
  });
});

describe('filterUniqueQuestions', () => {
  it('rejects exact and normalized duplicates against prior batches', () => {
    const accepted = [mcq('a', 'What is paging in OS?')];
    const { kept, rejected } = filterUniqueQuestions(
      [mcq('b', 'what is paging in os!'), mcq('c', 'What is segmentation in OS?')],
      accepted,
      { isObjective: true }
    );
    expect(kept.map((q) => q.text)).toEqual(['What is segmentation in OS?']);
    expect(rejected.some((r) => r.reason === 'duplicate_text')).toBe(true);
  });

  it('rejects duplicate IDs', () => {
    const accepted = [mcq('q1', 'Define a thread.')];
    const { kept, rejected } = filterUniqueQuestions(
      [mcq('q1', 'Define a process.')],
      accepted,
      { isObjective: true }
    );
    expect(kept).toHaveLength(0);
    expect(rejected[0].reason).toBe('duplicate_id');
  });

  it('rejects MCQs with missing or duplicate options', () => {
    const { kept, rejected } = filterUniqueQuestions(
      [{ id: 'x', text: 'A valid looking stem that is long enough?', options: ['A', 'A', 'B'], answer: 0 }],
      [],
      { isObjective: true }
    );
    expect(kept).toHaveLength(0);
    expect(rejected[0].reason).toBe('invalid_options');
  });
});

describe('parseGroqQuestions', () => {
  it('reads {questions: []} objects', () => {
    expect(parseGroqQuestions(groqPayload([mcq('1', 'Hello world question?')]))).toHaveLength(1);
  });
  it('throws on malformed payloads', () => {
    expect(() => parseGroqQuestions({ choices: [{ message: { content: 'not json' } }] })).toThrow(
      /invalid formatting/i
    );
  });
});

describe('generateQuestionsFromText', () => {
  it('returns a valid distinct set and remaps sequential IDs', async () => {
    const questions = [
      mcq('x', 'Explain demand paging with an example.'),
      mcq('y', 'Compare preemptive and non-preemptive scheduling.'),
    ];
    const fetchFn = fetchSequence([groqPayload(questions)]);
    const out = await generateQuestionsFromText(
      { text: 'Operating systems syllabus: paging, scheduling.', count: 2, isObjective: true },
      { fetchFn, maxRounds: 2 }
    );
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('ai_q0');
    expect(out[1].id).toBe('ai_q1');
    expect(out[0].text).not.toBe(out[1].text);
  });

  it('drops in-response duplicates and fills from a replacement batch', async () => {
    const first = groqPayload([
      mcq('1', 'What is virtual memory in operating systems?'),
      mcq('2', 'what is virtual memory in operating systems'),
    ]);
    const second = groqPayload([
      mcq('3', 'What is virtual memory in operating systems?'),
      mcq('4', 'Describe the working of the banker’s deadlock avoidance algorithm.'),
    ]);
    const fetchFn = fetchSequence([first, second]);
    const out = await generateQuestionsFromText(
      { text: 'OS: virtual memory, deadlock.', count: 2, isObjective: true },
      { fetchFn, maxRounds: 4 }
    );
    expect(out).toHaveLength(2);
    expect(out.map((q) => q.text)).toEqual([
      'What is virtual memory in operating systems?',
      'Describe the working of the banker’s deadlock avoidance algorithm.',
    ]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('shares exclusion state across batches for large MCQ counts', async () => {
    const batchA = Array.from({ length: 10 }, (_, i) =>
      mcq(`a${i}`, `Topic A unique question number ${i} about memory management.`)
    );
    const batchB = [
      mcq('dup', 'Topic A unique question number 0 about memory management.'),
      ...Array.from({ length: 10 }, (_, i) =>
        mcq(`b${i}`, `Topic B unique question number ${i} about file systems.`)
      ),
    ];
    const fetchFn = fetchSequence([groqPayload(batchA), groqPayload(batchB)]);
    const out = await generateQuestionsFromText(
      { text: 'OS chapters: memory, files.', count: 20, isObjective: true, difficulty: 'medium' },
      { fetchFn, maxRounds: 4 }
    );
    expect(out).toHaveLength(20);
    const texts = new Set(out.map((q) => q.text));
    expect(texts.size).toBe(20);
  });

  it('stops after the retry limit and errors if unique questions are insufficient', async () => {
    const same = groqPayload([
      mcq('1', 'Define an operating system.'),
      mcq('2', 'define an operating system!'),
    ]);
    const fetchFn = fetchSequence([same, same, same, same, same]);
    await expect(
      generateQuestionsFromText(
        { text: 'OS intro only.', count: 3, isObjective: true },
        { fetchFn, maxRounds: MAX_GENERATION_ROUNDS }
      )
    ).rejects.toThrow(/could not generate 3 unique/i);
    expect(fetchFn.mock.calls.length).toBeLessThanOrEqual(MAX_GENERATION_ROUNDS);
  });

  it('keeps exam marking: 7 marks for mid theory, 14 for final-sized sets', async () => {
    const qs = [
      { id: '1', text: 'Explain process states with a diagram.' },
      { id: '2', text: 'Compare threads and processes with examples.' },
      { id: '3', text: 'Describe context switching in a uniprocessor system.' },
      { id: '4', text: 'Write short notes on system calls used for process control.' },
    ];
    const fetchFn = fetchSequence([groqPayload(qs)]);
    const mid = await generateQuestionsFromText(
      { text: 'OS theory.', count: 4, isObjective: false },
      { fetchFn }
    );
    expect(mid.every((q) => q.marks === 7)).toBe(true);

    const finalQs = qs.concat([
      { id: '5', text: 'Discuss deadlock prevention versus deadlock avoidance.' },
      { id: '6', text: 'Explain multilevel feedback queue scheduling.' },
      { id: '7', text: 'Compare paging and segmentation with diagrams.' },
    ]);
    const fetchFn2 = fetchSequence([groqPayload(finalQs)]);
    const fin = await generateQuestionsFromText(
      { text: 'OS theory.', count: 7, isObjective: false },
      { fetchFn: fetchFn2 }
    );
    expect(fin.every((q) => q.marks === 14)).toBe(true);
    expect(fin).toHaveLength(7);
  });
});
