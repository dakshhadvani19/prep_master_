import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const csp = html.match(/http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/i)?.[1] || '';
const connectSrc = csp.split(';').find((directive) => directive.trim().startsWith('connect-src')) || '';

describe('Test Room Content Security Policy', () => {
    it('allows HTTPS requests and Supabase Realtime WebSocket connections', () => {
        expect(connectSrc).toContain("https://*.supabase.co");
        expect(connectSrc).toContain("wss://*.supabase.co");
        expect(connectSrc).toContain("https://api.groq.com");
    });

    it('keeps CSP enabled rather than allowing every connection origin', () => {
        expect(csp).toContain("default-src 'self'");
        expect(connectSrc).not.toContain('*;');
    });
});
