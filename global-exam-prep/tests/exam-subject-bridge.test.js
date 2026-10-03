/**
 * Numeric catalog SubjectId → existing ExamPortal mockData context.
 */
import { describe, it, expect } from 'vitest';
import { domains } from '../src/data/mockData';
import {
  findSubjectContext,
  lookupNumericSubject,
  bridgeEntryCount,
  bridgeHasDuplicateNumericIds,
} from '../src/utils/subjectResolver';

const NUMERIC = '1000001010601';
const SOURCE = '01ma0106';

describe('subject id uniqueness', () => {
  it('does not introduce duplicate numeric SubjectIds in the mapping layer', () => {
    expect(bridgeHasDuplicateNumericIds()).toBe(false);
    expect(bridgeEntryCount()).toBe(2788);
  });
});

describe('ExamPortal numeric / legacy resolution', () => {
  it('numeric SubjectId resolves to the original source subject and course', () => {
    const hit = lookupNumericSubject(NUMERIC);
    expect(hit.sourceSubjectId).toBe(SOURCE);
    expect(hit.courseSourceId).toBe('btech-ce');
    expect(hit.courseId).toBe(1);
    expect(hit.sem).toBe(1);

    const ctx = findSubjectContext(domains, NUMERIC);
    expect(ctx.kind).toBe('numeric');
    expect(ctx.subject.id).toBe(SOURCE);
    expect(ctx.course.id).toBe('btech-ce');
    expect(ctx.domain.id).toBe('engineering');
    expect(ctx.subject.title).toBe('Calculus');
  });

  it('legacy source SubjectId still resolves through mockData walk order', () => {
    const ctx = findSubjectContext(domains, SOURCE);
    expect(ctx.kind).toBe('legacy');
    expect(ctx.sourceSubjectId).toBe(SOURCE);
    expect(ctx.subject.id).toBe(SOURCE);
    expect(ctx.course.id).toBe('btech-ce');
  });

  it('unknown ids are not guessed into a subject', () => {
    expect(lookupNumericSubject('9999999999999')).toBeNull();
    const ctx = findSubjectContext(domains, '9999999999999');
    expect(ctx.subject).toBeNull();
    expect(ctx.kind).toBe('unknown');
    expect(findSubjectContext(domains, 'not-a-real-id').kind).toBe('unknown');
  });
});