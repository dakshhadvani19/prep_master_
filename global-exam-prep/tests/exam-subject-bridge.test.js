/**
 * Numeric catalog SubjectId → existing ExamPortal mockData context.
 * Also guards against a stale semester/bridge map silently passing.
 */
import { describe, it, expect } from 'vitest';
import { domains } from '../src/data/mockData';
import subjectSemesterMap from '../src/data/subjectSemesterMap.json';
import subjectIdBridge from '../src/data/subjectIdBridge.json';
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
        if (String(s.title || '').trim()) rows.push({ ...s, courseId: c.id });
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
  const brKeys = Object.keys(subjectIdBridge);
  const subjects = nonblankSubjects(domains);

  it('has 2,788 nonblank subjects and 2,788 unique map keys', () => {
    expect(subjects).toHaveLength(2788);
    expect(new Set(semKeys).size).toBe(2788);
    expect(new Set(brKeys).size).toBe(2788);
    expect(semKeys).toHaveLength(2788);
    expect(brKeys).toHaveLength(2788);
  });

  it('semester-map and bridge keys are exactly the same set', () => {
    expect(new Set(semKeys)).toEqual(new Set(brKeys));
  });

  it('contains current live IDs and no stale digit-stripped keys', () => {
    expect(subjectSemesterMap[NUMERIC]).toBe(1);
    expect(subjectIdBridge[NUMERIC]).toEqual({ s: SOURCE, c: 'btech-ce', n: 1, sem: 1 });
    expect(subjectSemesterMap[PM_NUMERIC]).toBe(2);
    expect(subjectIdBridge[PM_NUMERIC].s).toBe('PM20001');
    expect(subjectSemesterMap[STALE]).toBeUndefined();
    expect(subjectIdBridge[STALE]).toBeUndefined();
  });

  it('every bridge sem matches the semester map and has required fields', () => {
    let conflicts = 0;
    for (const [id, row] of Object.entries(subjectIdBridge)) {
      if (row.sem !== subjectSemesterMap[id]) conflicts += 1;
      expect(row).toEqual(expect.objectContaining({
        s: expect.any(String),
        c: expect.any(String),
        n: expect.any(Number),
        sem: expect.any(Number),
      }));
      expect(String(row.s).length).toBeGreaterThan(0);
    }
    expect(conflicts).toBe(0);
  });

  it('representative CourseIds across the catalog are present', () => {
    const byCourse = {};
    for (const row of Object.values(subjectIdBridge)) {
      byCourse[row.n] = (byCourse[row.n] || 0) + 1;
    }
    expect(byCourse[1]).toBe(61);
    expect(byCourse[2]).toBeGreaterThan(0);
    expect(byCourse[18]).toBeGreaterThan(0);
    expect(byCourse[49]).toBeGreaterThan(0);
    expect(Object.keys(byCourse).map(Number).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 49 }, (_, i) => i + 1).filter((n) => byCourse[n]),
    );
  });

  it('if mockData already stores numeric IDs, they match the maps exactly', () => {
    const numericIds = subjects.map((s) => String(s.id)).filter((id) => /^\d+$/.test(id));
    if (numericIds.length === subjects.length) {
      expect(new Set(numericIds)).toEqual(new Set(semKeys));
      for (const s of subjects) {
        expect(subjectSemesterMap[String(s.id)]).toBe(s.sem);
        expect(subjectIdBridge[String(s.id)].sem).toBe(s.sem);
      }
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
    expect(ctx.sourceSubjectId).toBe(SOURCE);
    expect(ctx.course.id).toBe('btech-ce');
    expect(ctx.domain.id).toBe('engineering');
    expect(ctx.subject.title).toBe('Calculus');
  });

  it('legacy source SubjectId still resolves', () => {
    const ctx = findSubjectContext(domains, SOURCE);
    expect(ctx.kind).toBe('legacy');
    expect(ctx.sourceSubjectId).toBe(SOURCE);
    expect(ctx.course.id).toBe('btech-ce');
    expect(ctx.subject.title).toBe('Calculus');
  });

  it('unknown ids are not guessed into a subject', () => {
    expect(lookupNumericSubject('9999999999999')).toBeNull();
    expect(lookupNumericSubject(STALE)).toBeNull();
    const ctx = findSubjectContext(domains, '9999999999999');
    expect(ctx.subject).toBeNull();
    expect(ctx.kind).toBe('unknown');
    expect(findSubjectContext(domains, 'not-a-real-id').kind).toBe('unknown');
  });
});
