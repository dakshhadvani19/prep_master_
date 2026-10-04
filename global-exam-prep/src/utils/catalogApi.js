/**
 * Student catalog reads: public."Courses" / public."Subjects" via the browser
 * anon key (RLS SELECT only). Never service_role. Never realtime.
 *
 * Domain → CourseIds comes from courseMapping.json (the DB has no domain column).
 * Course semester options come from public."Courses".Sems.
 * Subject semester comes from public."Subjects".Semester.
 */
import { supabase, supabaseConfigError } from '../supabase';
import { CATALOG_DOMAINS, getCatalogDomain } from '../data/catalogDomains';
import courseMapping from '../data/courseMapping.json';

export { CATALOG_DOMAINS, getCatalogDomain };

const COURSE_COLS = 'CourseId,CourseName,Sems';
const SUBJECT_COLS = 'SubjectId,SubjectName,CourseId,Semester';

const coursesByDomain = new Map();
const coursePages = new Map();
const inflight = new Map();

export function resetCatalogCache() {
    coursesByDomain.clear();
    coursePages.clear();
    inflight.clear();
}

function once(key, fn) {
    if (inflight.has(key)) return inflight.get(key);
    const pending = Promise.resolve()
        .then(fn)
        .finally(() => inflight.delete(key));
    inflight.set(key, pending);
    return pending;
}

function catalogUnavailable() {
    return new Error(
        supabaseConfigError
        || 'Supabase is not available, so the course catalog cannot be loaded.',
    );
}

function mapCourseRow(row) {
    if (!row) return null;
    const courseId = Number(row.CourseId);
    const mapped = courseMapping.find((c) => c.courseId === courseId);
    return {
        courseId,
        courseName: row.CourseName,
        sems: Array.isArray(row.Sems) ? row.Sems : [],
        domainId: mapped?.domainId ?? null,
        courseSourceId: mapped?.courseSourceId ?? null,
    };
}

function mapSubjectRow(row, expectedCourseId) {
    const courseId = Number(row.CourseId);
    if (Number(expectedCourseId) !== courseId) return null;
    return {
        subjectId: Number(row.SubjectId),
        subjectName: row.SubjectName,
        courseId,
        sem: Number(row.Semester),
    };
}

export function courseIdsForDomain(domainId) {
    return courseMapping
        .filter((c) => c.domainId === domainId)
        .map((c) => c.courseId);
}

export function mappingForCourseId(courseId) {
    const n = Number(courseId);
    return courseMapping.find((c) => c.courseId === n) || null;
}

/**
 * Student catalog URLs use numeric DB CourseId. Source ids (btech-ce, …) are
 * resolved through the mapping so older links still open the same course.
 */
export function resolveCourseParam(courseIdParam) {
    if (courseIdParam == null || courseIdParam === '') return null;
    const raw = String(courseIdParam);
    if (/^\d+$/.test(raw)) return Number(raw);
    const mapped = courseMapping.find((c) => c.courseSourceId === raw);
    return mapped ? mapped.courseId : null;
}

export async function fetchCoursesForDomain(domainId) {
    const domain = getCatalogDomain(domainId);
    if (!domain) {
        return { domain: null, courses: [], error: new Error('Department not found.') };
    }

    if (coursesByDomain.has(domainId)) {
        return { domain, courses: coursesByDomain.get(domainId), error: null, fromCache: true };
    }

    return once(`domain:${domainId}`, async () => {
        const ids = courseIdsForDomain(domainId);
        if (!ids.length) {
            coursesByDomain.set(domainId, []);
            return { domain, courses: [], error: null };
        }
        if (!supabase) return { domain, courses: [], error: catalogUnavailable() };

        const { data, error } = await supabase
            .from('Courses')
            .select(COURSE_COLS)
            .in('CourseId', ids);

        if (error) return { domain, courses: [], error };
        const byId = new Map((data || []).map((row) => [Number(row.CourseId), mapCourseRow(row)]));
        const courses = ids.map((id) => byId.get(id)).filter(Boolean);
        coursesByDomain.set(domainId, courses);
        return { domain, courses, error: null };
    });
}

export async function fetchCourseAndSubjects(courseIdParam) {
    const courseId = resolveCourseParam(courseIdParam);
    if (courseId == null) {
        return { course: null, subjects: [], unmapped: [], error: new Error('Course not found.') };
    }

    if (coursePages.has(courseId)) {
        return { ...coursePages.get(courseId), error: null, fromCache: true };
    }

    return once(`course:${courseId}`, async () => {
        if (!supabase) {
            return { course: null, subjects: [], unmapped: [], error: catalogUnavailable() };
        }

        const [courseRes, subjectRes] = await Promise.all([
            supabase.from('Courses').select(COURSE_COLS).eq('CourseId', courseId).maybeSingle(),
            supabase.from('Subjects').select(SUBJECT_COLS).eq('CourseId', courseId),
        ]);

        if (courseRes.error) {
            return { course: null, subjects: [], unmapped: [], error: courseRes.error };
        }
        if (subjectRes.error) {
            return { course: null, subjects: [], unmapped: [], error: subjectRes.error };
        }
        if (!courseRes.data) {
            return { course: null, subjects: [], unmapped: [], error: new Error('Course not found.') };
        }

        const course = mapCourseRow(courseRes.data);
        const subjects = (subjectRes.data || [])
            .map((row) => mapSubjectRow(row, courseId))
            .filter(Boolean);

        const page = { course, subjects, unmapped: [] };
        coursePages.set(courseId, page);
        return { ...page, error: null };
    });
}