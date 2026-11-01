import { beforeEach, describe, expect, it, vi } from 'vitest';
import process from 'node:process';
import handler from '../api/admin-subjects.js';
import { createClient } from '@supabase/supabase-js';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

function response() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(value) { this.body = value; return this; },
        end() { return this; },
        setHeader() {},
    };
}

function queryMock({ single = null, rows = [], inserted = null, deleted = null } = {}) {
    const q = {
        select: vi.fn(() => q),
        eq: vi.fn(() => q),
        insert: vi.fn(() => q),
        update: vi.fn(() => q),
        delete: vi.fn(() => q),
        maybeSingle: vi.fn(async () => ({ data: single, error: null })),
        single: vi.fn(async () => ({ data: inserted, error: null })),
        then(resolve, reject) {
            return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
    };
    if (deleted) q.maybeSingle.mockResolvedValue({ data: deleted, error: null });
    return q;
}

function makeClient({ authUid = 'admin-uid', dependencyCounts = {} } = {}) {
    const subject = { SubjectId: 50, SubjectName: 'Networks', CourseId: 10, Semester: 2, isDepartmentalSubject: false };
    const calls = { inserted: null, deleted: false };
    const client = {
        auth: {
            getUser: vi.fn(async ¶»§q«^