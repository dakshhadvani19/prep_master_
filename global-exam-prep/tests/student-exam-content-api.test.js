import { beforeEach, describe, expect, it, vi } from 'vitest';
import process from 'node:process';
import handler from '../api/student-exam-content.js';
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

function makeClient({ validUser = true, activeSyllabus = [] } = {}) {
    const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({
            data: { SubjectId: 50, SubjectName: 'Networks', CourseId: 10, Semester: 2, isDepartmentalSubject: false },
            error: null,
        })),
    };
    const client = {
        auth: {
            getUser: vi.fn(async () => validUser
                ? { data: { user: { id: 'student-uid' } }, error: null }
                : { data: { user: null }, error: new Error('invalid token') }),
        },
        from: vi.fn(() => query),
        rpc: vi.fn(async () => ({ data: activeSyllabus, error: null })),
    };
    return client;
}

describe('student exam content API', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
        process.env.SUPABASE_SERVICE_RO¶»§q«^