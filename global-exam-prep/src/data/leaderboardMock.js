/**
 * Phase 4 — in-memory leaderboard preview.
 * Shape follows the ER Leaderboards entity: SubjectId, {StudentId}, {Points}, {TotalTests}.
 * Not persisted. Not a live ranking of exam attempts.
 */

export const LB_COURSES = [
    {
        id: 'btech-ce',
        title: 'B.Tech - Computer Engineering',
        semesters: [1, 2],
        subjects: [
            { id: '01ma0106', title: 'Calculus', sem: 1, size: 186 },
            { id: '01ce1101', title: 'Computer Programming', sem: 1, size: 120 },
            { id: '01ce0104', title: 'Object Oriented Programming', sem: 2, size: 104 },
        ],
    },
    {
        id: 'btech-it',
        title: 'B.Tech - IT',
        semesters: [1, 2],
        subjects: [
            { id: '02it1101', title: 'Digital Logic', sem: 1, size: 132 },
        ],
    },
];

/** Boards a participating student appears on (student-scoped, not the full catalog). */
export const STUDENT_BOARDS = [
    { courseId: 'btech-ce', subjectId: '01ma0106', rank: 118 },
    { courseId: 'btech-ce', subjectId: '01ce1101', rank: 14 },
];

const GIVEN = [
    'Aarav', 'Diya', 'Ishaan', 'Kiara', 'Vivaan', 'Anaya', 'Reyansh', 'Myra',
    'Kabir', 'Saanvi', 'Advait', 'Aanya', 'Shaurya', 'Navya', 'Arjun', 'Ira',
    'Rudra', 'Meera', 'Yash', 'Pari', 'Dev', 'Tara', 'Nikhil', 'Riya',
    'Harsh', 'Nisha', 'Rohit', 'Kavya', 'Aman', 'Isha', 'Kunal', 'Sneha',
    'Varun', 'Pooja', 'Neel', 'Anvi', 'Siddharth', 'Aditi', 'Manav', 'Jiya',
];
const FAMILY = [
    'Patel', 'Shah', 'Mehta', 'Desai', 'Joshi', 'Trivedi', 'Raval', 'Dave',
    'Kapoor', 'Nair', 'Iyer', 'Reddy', 'Khan', 'Singh', 'Gupta', 'Jain',
];

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a += 0x6D2B79F5;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hashId(id) {
    let h = 2166136261;
    for (let i = 0; i < id.length; i += 1) {
        h ^= id.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function buildRows(subjectId, size) {
    const rnd = mulberry32(hashId(subjectId) ^ 0x9e3779b9);
    const rows = [];
    for (let i = 0; i < size; i += 1) {
        const given = GIVEN[Math.floor(rnd() * GIVEN.length)];
        const family = FAMILY[Math.floor(rnd() * FAMILY.length)];
        const points = Math.max(40, Math.round(980 - i * (820 / Math.max(size - 1, 1)) + (rnd() - 0.5) * 6));
        const tests = 3 + Math.floor(rnd() * 9);
        rows.push({
            id: `${subjectId}-${i + 1}`,
            name: `${given} ${family}`,
            points,
            tests,
            isYou: false,
        });
    }
    rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    return rows.map((row, i) => ({ ...row, rank: i + 1 }));
}

const CACHE = new Map();

export function subjectMeta(subjectId) {
    for (const course of LB_COURSES) {
        const subject = course.subjects.find((s) => s.id === subjectId);
        if (subject) return { course, subject };
    }
    return null;
}

export function rowsForSubject(subjectId) {
    if (!CACHE.has(subjectId)) {
        const meta = subjectMeta(subjectId);
        CACHE.set(subjectId, buildRows(subjectId, meta?.subject.size || 100));
    }
    return CACHE.get(subjectId);
}

export function percentileFor(rank, total) {
    if (!total || rank < 1) return 0;
    return Math.max(0, Math.min(100, Math.round(((total - rank) / total) * 1000) / 10));
}

/**
 * Overlay the signed-in student onto a board at a planned rank, keeping points
 * of that slot so the ordering stays internally consistent.
 */
export function withViewer(subjectId, viewer, plannedRank) {
    const base = rowsForSubject(subjectId).map((row) => ({ ...row, isYou: false }));
    if (!viewer?.name || !plannedRank) return base;
    const idx = Math.min(Math.max(plannedRank, 1), base.length) - 1;
    const slot = base[idx];
    base[idx] = {
        ...slot,
        id: `you-${subjectId}`,
        name: viewer.name,
        isYou: true,
    };
    return base;
}

export function topN(rows, n = 100) {
    return rows.filter((row) => row.rank <= n);
}

export function findYou(rows) {
    return rows.find((row) => row.isYou) || null;
}
