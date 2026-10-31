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
import { getSubjectExamInfo } from '../src/utils/subjectExamPolicy';
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
    expect(bridgeEntryCount()).toBe(2452);
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

  it('does not resolve the 46 project/dissertation subjects removed from the active catalog', () => {
    const csv = readFileSync('temp_removed_subjects/project_deliverable_subjects_removed_2026-10-30.csv', 'utf8').trim();
    const lines = csv.split(/\r?\n/);
    const rows = lines.slice(1).map(parseCsvLine);
    const header = parseCsvLine(lines[0]);
    const idIndex = header.indexOf('live_subject_id');
    const removedIds = rows.map((row) => row[idIndex]).filter(Boolean);
    expect(removedIds).toHaveLength(46);
    expect(new Set(removedIds).size).toBe(46);
    const legacySubjects = new Set(nonblankSubjects(domains).map((row) => String(row.id)));
    for (const id of removedIds) {
      expect(subjectIdBridge[id]).toBeUndefined();
      expect(subjectSemesterMap[id]).toBeUndefined();
      expect(liveSubjectContextOverrides.subjects[id]).toBeUndefined();
      expect(lookupNumericSubject(id)).toBeNull();
      expect(findSubjectContext(domains, id).kind).toBe('unknown');
      expect(legacySubjects.has(id)).toBe(false);
    }
  });

  it('does not resolve the 20 legacy-only project subjects removed from inactive course definitions', () => {
    const csv = readFileSync('temp_removed_subjects/legacy_project_subjects_removed_2026-10-30.csv', 'utf8').trim();
    const lines = csv.split(/\r?\n/);
    const rows = lines.slice(1).map(parseCsvLine);
    const header = parseCsvLine(lines[0]);
    const idIndex = header.indexOf('legacy_subject_id');
    const removedIds = rows.map((row) => row[idIndex]).filter(Boolean);
    expect(removedIds).toHaveLength(20);
    expect(new Set(removedIds).size).toBe(20);
    const legacySubjects = new Set(nonblankSubjects(domains).map((row) => String(row.id)));
    for (const id of removedIds) {
      expect(subjectIdBridge[id]).toBeUndefined();
      expect(subjectSemesterMap[id]).toBeUndefined();
      expect(legacySubjects.has(id)).toBe(false);
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
    // Forty-six project/dissertation subjects are excluded from the active
    // bridge. Legacy contexts retain 2,538 nonblank exam-capable subjects;
    // 2,452 of them still have a verified numeric mapping.
    expect(subjects).toHaveLength(2538);
    expect(new Set(semKeys).size).toBe(2452);
    expect(new Set(brKeys).size).toBe(2452);
    expect(semKeys).toHaveLength(2452);
    expect(brKeys).toHaveLength(2452);
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
    expect(byCourse[1]).toBe(59);
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
    expect(liveSubjectContextOverrides.count).toBe(54);
    expect(Object.keys(liveSubjectContextOverrides.subjects)).toHaveLength(54);
    for (const [id, override] of Object.entries(liveSubjectContextOverrides.subjects)) {
      const context = findSubjectContext(domains, id);
      expect(context.kind).toBe('numeric');
      expect(context.liveCatalogOverride).toBe(true);
      expect(context.sourceSubjectId).toBe(subjectIdBridge[id].s);
      expect(context.course.id).toBe(override.courseSourceId);
      expect(context.subject.id).toBe(id);
      expect(context.subject.title).toBe(override.subjectName);
      expect(context.sem).toBe(override.semester);
      expect(context.isDepartmentalSubject).toBe(override.isDepartmentalSubject);

      // The same live subject must still resolve if legacy course metadata has
      // disappeared entirely. This guards the exact "Exam details not found"
      // failure seen when opening live BCA/MCA subjects by URL.
      const withoutLegacyData = findSubjectContext([], id);
      expect(withoutLegacyData.kind).toBe('numeric');
      expect(withoutLegacyData.subject.title).toBe(override.subjectName);
      expect(withoutLegacyData.course.title).toBe(override.courseName);
      expect(withoutLegacyData.domain.title).toBe('Computer Applications');
      expect(getSubjectExamInfo('mid-2', withoutLegacyData.isDepartmentalSubject)).toBeTruthy();
      if (override.isDepartmentalSubject) {
        expect(getSubjectExamInfo('final', withoutLegacyData.isDepartmentalSubject)).toBeUndefined();
      }
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

  it('legacy source SubjectId still resolves regardless of code casing', () => {
    for (const sourceId of [SOURCE, SOURCE.toUpperCase()]) {
      const ctx = findSubjectContext(domains, sourceId);
      expect(ctx.kind).toBe('legacy');
      expect(ctx.sourceSubjectId).toBe(SOURCE);
      expect(ctx.course.id).toBe('btech-ce');
      expect(ctx.subject.title).toBe('Calculus');
    }
  });

  it('unknown ids are not guessed into a subject', () => {
    expect(lookupNumericSubject('9999999999999')).toBeNull();
    expect(lookupNumericSubject(STALE)).toBeNull();
    const ctx = findSubjectContext(domains, '9999999999999');
    expect(ctx.subject).toBeNull();
    expect(ctx.kind).toBe('unknown');
    expect(findSubjectContext(domains, 'not-a-real-id').kind).toBe('unknown');
  });

  it('resolves every current BCA/MCA subject ID and accepts its Mid-2 exam route', () => {
    const liveComputerApplicationsIds = Object.entries(subjectIdBridge)
      .filter(([, row]) => ['bca', 'mca'].includes(row.c))
      .map(([id]) => id);

    expect(liveComputerApplicationsIds).toHaveLength(68);

    for (const id of liveComputerApplicationsIds) {
      const context = findSubjectContext(domains, id);
      expect(context.subject, `Expected subject context for ${id}`).toBeTruthy();
      expect(context.course, `Expected course context for ${id}`).toBeTruthy();
      expect(
        getSubjectExamInfo(
          'mid-2',
          context.isDepartmentalSubject ?? context.subject.isDepartmentalSubject ?? false,
        ),
        `Expected Mid-2 exam metadata for ${id}`,
      ).toBeTruthy();
    }
  });
});
