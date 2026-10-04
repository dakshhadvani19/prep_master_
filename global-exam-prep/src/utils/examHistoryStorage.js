const STORAGE_PREFIX = 'prepmaster_exam_history_v1';

const memoryStore = new Map();

function storageKey(uid) {
    return `${STORAGE_PREFIX}:${uid || 'anonymous'}`;
}

function readHistory(uid) {
    const key = storageKey(uid);
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const raw = window.localStorage.getItem(key);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        }
    } catch {}
    return memoryStore.get(key) || [];
}

function writeHistory(uid, records) {
    const key = storageKey(uid);
    memoryStore.set(key, records);
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(key, JSON.stringify(records));
        }
    } catch {}
}

export function getExamHistory(uid) {
    return [...readHistory(uid)].sort(
        (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
    );
}

export function getExamHistoryRecord(uid, historyId) {
    const wanted = String(historyId);
    return readHistory(uid).find((record) => String(record.id) === wanted) || null;
}

export function saveExamHistory(uid, record) {
    const records = readHistory(uid).filter((item) => String(item.id) !== String(record.id));
    records.unshift(record);
    writeHistory(uid, records.slice(0, 100));
    return record;
}

export function clearExamHistory(uid) {
    writeHistory(uid, []);
}
