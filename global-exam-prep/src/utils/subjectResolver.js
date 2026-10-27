/**
 * Catalog numeric SubjectId ↔ ExamPortal source SubjectId.
 * Does not import mockData.js. ExamPortal passes `domains` in.
 */
import bridge from '../data/subjectIdBridge.json';
import liveSubjectContextOverrides from '../data/liveSubjectContextOverrides.json';

export function lookupNumericSubject(routeId) {
    const key = String(routeId ?? '');
    if (!/^\d+$/.test(key)) return null;
    const row = bridge[key];
    if (!row) return null;
    return {
        numericSubjectId: Number(key),
        sourceSubjectId: row.s,
        courseSourceId: row.c,
        courseId: row.n,
        sem: row.sem,
    };
}

function unknownSubjectContext(raw) {
    return {
        kind: 'unknown',
        sourceSubjectId: raw == null ? '' : String(raw),
        numericSubjectId: null,
        courseSourceId: null,
        courseId: null,
        sem: undefined,
        subject: null,
        course: null,
        domain: null,
    };
}

export function findSubjectContext(domains, routeSubjectId) {
    const numeric = lookupNumericSubject(routeSubjectId);
    if (numeric) {
        for (const domain of domains || []) {
            const course = (domain.courses || []).find((c) => c.id === numeric.courseSourceId);
            if (!course) continue;
            const subject = (course.subjects || []).find((s) => (
                String(s.id) === String(numeric.numericSubjectId)
                || s.id === numeric.sourceSubjectId
            ));
            if (subject) {
                return { ...numeric, kind: 'numeric', subject, course, domain };
            }
        }
        const override = liveSubjectContextOverrides.subjects?.[String(routeSubjectId)];
        if (override) {
            for (const domain of domains || []) {
                const course = (domain.courses || []).find((c) => c.id === numeric.courseSourceId);
                if (!course) continue;
                return {
                    ...numeric,
                    kind: 'numeric',
                    subject: {
                        id: String(routeSubjectId),
                        title: override.subjectName,
                        sem: numeric.sem,
                        exams: ['mid-1', 'mid-2', 'final'],
                    },
                    course,
                    domain,
                    liveCatalogOverride: true,
                };
            }
        }
        return { ...numeric, kind: 'numeric', subject: null, course: null, domain: null };
    }

    const raw = routeSubjectId;
    // Numeric IDs are canonical public-catalog routes. If the bridge no longer
    // contains one, it was archived or is invalid; never fall back to an old
    // legacy mockData row that could accidentally resurrect the removed route.
    if (/^\d+$/.test(String(raw ?? ''))) return unknownSubjectContext(raw);

    for (const domain of domains || []) {
        for (const course of domain.courses || []) {
            const subject = (course.subjects || []).find((s) => s.id === raw);
            if (subject) {
                return {
                    kind: 'legacy',
                    sourceSubjectId: subject.id,
                    courseSourceId: course.id,
                    numericSubjectId: null,
                    courseId: null,
                    sem: subject.sem,
                    subject,
                    course,
                    domain,
                };
            }
        }
    }

    // mockData may store final numeric IDs; still accept the original source SubjectId.
    if (raw) {
        for (const [numericId, row] of Object.entries(bridge)) {
            if (row.s !== raw) continue;
            const viaNumeric = findSubjectContext(domains, numericId);
            if (viaNumeric.subject) {
                return { ...viaNumeric, kind: 'legacy', sourceSubjectId: row.s };
            }
        }
    }

    return unknownSubjectContext(raw);
}

export function bridgeEntryCount() {
    return Object.keys(bridge).length;
}

export function bridgeHasDuplicateNumericIds() {
    const keys = Object.keys(bridge);
    return keys.length !== new Set(keys).size;
}
