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

function buildLiveOverrideContext(numeric, routeSubjectId, override, domains = []) {
    const isDepartmentalSubject = override.isDepartmentalSubject === true;
    let domain = (domains || []).find((item) => (
        (item.courses || []).some((candidate) => candidate.id === numeric.courseSourceId)
    ));
    let course = domain?.courses?.find((candidate) => candidate.id === numeric.courseSourceId);

    // The live Supabase catalog is authoritative for these explicit overrides.
    // Create a minimal display hierarchy if the corresponding legacy mockData
    // course/domain has been removed or renamed.
    if (!course) {
        course = {
            id: numeric.courseSourceId || override.courseSourceId,
            title: override.courseName || 'Academic Course',
            subjects: [],
        };
        if (domain) {
            domain = { ...domain, courses: [...(domain.courses || []), course] };
        } else {
            domain = {
                id: override.domainSourceId || 'computer-applications',
                title: override.domainName || 'Computer Applications',
                icon: 'BookOpen',
                description: 'Courses and subjects from the current academic catalog.',
                courses: [course],
            };
        }
    }

    const subject = {
        id: String(routeSubjectId),
        title: override.subjectName || 'Untitled Subject',
        sem: Number(override.semester || numeric.sem) || 1,
        exams: isDepartmentalSubject ? ['mid-1', 'mid-2'] : ['mid-1', 'mid-2', 'final'],
        isDepartmentalSubject,
    };

    return {
        ...numeric,
        kind: 'numeric',
        subject,
        course,
        domain,
        isDepartmentalSubject,
        liveCatalogOverride: true,
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
        const override = liveSubjectContextOverrides.subjects?.[String(routeSubjectId)];
        if (override) {
            return buildLiveOverrideContext(numeric, routeSubjectId, override, domains);
        }

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
        const sourceSubjectCode = String(raw).toLowerCase();
        for (const [numericId, row] of Object.entries(bridge)) {
            if (String(row.s).toLowerCase() !== sourceSubjectCode) continue;
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
