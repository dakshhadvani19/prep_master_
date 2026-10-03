/**
 * Numeric catalog SubjectId → existing ExamPortal mockData context.
 */
import { describe, it, expect } from 'vitest';
import subjectSemesterMap from '../src/data/subjectSemesterMap.json';
import subjectIdBridge from '../src/data/subjectIdBridge.json';
import { domains } from '../src/data/mockData';
import {
  findSubjectContext,
  lookupNumericSubject,
  bridgeEntryCount,
  bridgeHasDuplicateNumericIds,
} from '../src/utils/subjectResolver';

const NUMERIC = '1001131010601';
const SOURCE = '01ma0106';
const STALE = '1000001010601';
const PM_NUMERIC = '1016132000101';

function nonblankSubjects(doms) {
  const rows = [];
  for (const d of doms) {
    for (const c of d.courses || []) {
      for (const s of c.subjects || []) {
        if (String(s.title || '').trim()) rows.push(s);
      }
    }
  }
  return rows;
}

describe('subject id uniqueness', () => {
  it('does not introduce duplicate numeric SubjectIds in the mapping layer', () => {
    expect(bridgeHasDuplicateNumericIds()).toBe(false);
    expect(bridgeEntryCount()).toBe(2788);
  });
});


describe('canonical catalog coverage', () => {
  const semKeys = Object.keys(subjectSemesterMap);
  const bridgeKeys = Object.keys(subjectIdBridge);
  const subjects = nonblankSubjects(domains);

  it('has exact coverage for the canonical numeric catalog', () => {
    expect(subjects).toHaveLength(2788);
    expect(new Set(subjects.map((s) => String(s.id))).size).toBe(2788);
    expect(new Set(semKeys)).toEqual(new Set(bridgeKeys));
    expect(new Set(semKeys)).toEqual(new Set(subjects.map((s) => String(s.id))));
  });

  it('has no stale IDs and preserves every canonical semester', () => {
    expect(subjectSemesterMap[NUMERIC]).toBe(1);
    expect(subjectSemesterMap[PM_NUMERIC]).toBe(2);
    expect(subjectSemesterMap[STALE]).toBeUndefined();
    expect(subjectIdBridge[STALE]).toBeUndefined();
    for (const s of subjects) {
      expect(subjectSemesterMap[String(s.id)]).toBe(s.sem);
      expect(subjectIdBridge[String(s.id)].sem).toBe(s.sem);
    }
  });

  it('reconstructs numeric IDs from source ID, CourseId and occurrence order', () => {
    const seen = new Map();
    for (const [id, row] of Object.entries(subjectIdBridge)) {
      let body = '';
      for (const ch of String(row.s)) {
        if (/[0-9]/.test(ch)) body += ch;
        else if (/[A-Za-z]/.test(ch)) body += String(ch.toUpperCase().charCodeAt(0) - 64);
      }
      body = body.padStart(10, '0');
      const group = row.n + '|' + body;
      const occurrence = (seen.get(group) || 0) + 1;
      seen.set(group, occurrence);
      expect(id).toBe(String(row.n) + body + String(occurrence).padStart(2, '0'));
      expect(row.s.length).toBeGreaterThan(0);
      expect(row.c.length).toBeGreaterThan(0);
    }
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
    expect(ctx.subject.id).toBe(NUMERIC);
    expect(ctx.course.id).toBe('btech-ce');
    expect(ctx.domain.id).toBe('engineering');
    expect(ctx.subject.title).toBe('Calculus');
  });

  it('legacy source SubjectId still resolves through the numeric bridge', () => {
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