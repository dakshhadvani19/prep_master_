/**
 * Numeric catalog SubjectId → existing ExamPortal mockData context.
 * Also guards against a stale semester/bridge map silently passing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { domains } from '../src/data/mockData';
import subjectSemesterMap from '../src/data/subjectSemesterMap.json';
import subjectIdBridge from '../src/data/subjectIdBridge.json';
import liveSubjectContextOverrides from '../src/data/liveSubjectContextOverrides.json';
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

function parseCsvLine(line) {
  const fields = [];
  let value = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(value);
      value = '';
    } else {
      value += ch;
    }
  }
  fields.push(value);
  return fields;
}

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
    expect(bridgeEntryCount()).toBe(2513);
  });
});

describe('canonical catalog coverage', () => {
  it('does not resolve IDs for subjects archived out of the public catalog', () => {
    const csv = readFileSync('temp_removed_subjects/removed_subjects_2026-10-11.csv', 'utf8').trim();
    const lines = csv.split(/\r?\n/);
    const rows = lines.slice(1).map(parseCsvLine);
    const header = parseCsvLine(lines[0]);
    const idIndex = header.indexOf('live_subject_id');
    const removedIds = rows.map((row) => row[idIndex]).filter(Boolean);
    expect(removedIds).toHaveLength(106);
    expect(new Set(removedIds).size).toBe(106);
    for (const id of removedIds) {
      expect(subjectIdBridge[id]).toBeUndefined();
      expect(subjectSemesterMap[id]).toBeUndefined();
      expect(lookupNumericSubject(id)).toBeNull();
      expect(findSubjectContext(domains, id).kind).toBe('unknown');
    }
  });

  it('does not resolve Law & Arts rows temporarily excluded after PDF content review', () => {
    const csv = readFileSync('temp_removed_subjects/law_arts_removed_subjects_2026-10-11.csv', 'utf8').trim();
    const lines = csv.split(/\r?\n/);
    const rows = lines.slice(1).map(parseCsvLine);
    const header = parseCsvLine(lines[0]);
    const idIndex = header.indexOf('live_subject_id');
    const removedIds = rows.map((row) => row[idIndex]).filter(Boolean);
    expect(removedIds).toHaveLength(74);
    expect(new Set(removedIds).size).toBe(74);
    for (const id of removedIds) {
      expect(subjectIdBridge[id]).toBeUndefined();
      expect(subjectSemesterMap[id]).toBeUndefined();
      expect(lookupNumericSubject(id)).toBeNull();
      expect(findSubjectContext(domains, id).kind).toBe('unknown');
    }
  });

  it('keeps Law & Arts network-unverified subjects mapped for retry', () => {
    const csv = readFileSync('temp_removed_subjects/law_arts_network_retry_pending_2026-10-11.csv', 'utf8').trim();
    const lines = csv.split(/\r?\n/);
    const rows = lines.slice(1).map(parseCsvLine);
    const header = parseCsvLine(lines[0]);
    const idIndex = header.indexOf('source_subject_id');
    const pendingIds = rows.map((row) => row[idIndex]).filter(Boolean);
    expect(pendingIds).toHaveLength(33);
    for (const id of pendingIds) {
      expect(subjectIdBridge[id]).toBeDefined();
      expect(subjectSemesterMap[id]).toBeDefined();
    }
  });

  const semKeys = Object.keys(subjectSemesterMap);
  const brKeys = Object.keys(subjectIdBridge);
  const subjects = nonblankSubjects(domains);

  it('tracks the current catalog snapshot and the verified numeric bridge', () => {
    // Legacy exam contexts include 2,598 nonblank subjects. The numeric bridge
    // contains the 2,513 rows that still have a verified numeric mapping.
    expect(subjects).toHaveLength(2598);
    expect(new Set(semKeys).size).toBe(2513);
    expect(new Set(brKeys).size).toBe(2513);
    expect(semKeys).toHaveLength(2513);
    expect(brKeys).toHaveLength(2513);
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

});

describe('live numeric subjects missing from legacy mockData', () => {
  it('resolves the 60 live BCA/MCA subject IDs with authoritative catalog metadata', () => {
    expect(liveSubjectContextOverrides.count).toBe(60);
    expect(Object.keys(liveSubjectContextOverrides.subjects)).toHaveLength(60);
    for (const [id, override] of Object.entries(liveSubjectContextOverrides.subjects)) {
      const context = findSubjectContext(domains, id);
      expect(context.kind).toBe('numeric');
      expect(context.liveCatalogOverride).toBe(true);
      expect(context.sourceSubjectId).toBe(subjectIdBridge[id].s);
      expect(context.course.id).toBe(override.courseSourceId);
      expect(context.subject.id).toBe(id);
      expect(context.subject.title).toBe(override.subjectName);
      expect(context.sem).toBe(override.semester);
    }
  });

  it('does not create overrides for any other live catalog subject', () => {
    expect(Object.keys(liveSubjectContextOverrides.subjects).every((id) => (
      ['bca', 'mca'].includes(subjectIdBridge[id]?.c)
    ))).toBe(true);
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
