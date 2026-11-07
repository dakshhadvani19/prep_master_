import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const includeFiles = config.functions?.['api/admin-subjects.js']?.includeFiles || '';

describe('PDF upload function bundle configuration', () => {
    it('keeps the runtime PDF.js assets and Linux x64 GNU canvas binding', () => {
        expect(includeFiles).toContain('pdfjs-dist/legacy/build/*.mjs');
        expect(includeFiles).toContain('pdfjs-dist/cmaps/**/*');
        expect(includeFiles).toContain('pdfjs-dist/standard_fonts/**/*');
        expect(includeFiles).toContain('pdfjs-dist/wasm/**/*');
        expect(includeFiles).toContain('pdfjs-dist/iccs/**/*');
        expect(includeFiles).toContain('pdfjs-dist/image_decoders/**/*');
        expect(includeFiles).toContain('@napi-rs/canvas/**/*');
        expect(includeFiles).toContain('@napi-rs/canvas-linux-x64-gnu/**/*');
    });

    it('does not include every PDF.js build output or every platform binary', () => {
        expect(includeFiles).not.toBe('node_modules/{pdfjs-dist,@napi-rs}/**/*');
        expect(includeFiles).not.toContain('@napi-rs/canvas-linux-x64-musl');
        expect(includeFiles).not.toContain('pdfjs-dist/legacy/build/**/*');
        expect(includeFiles).not.toContain('pdfjs-dist/build/**/*');
    });
});
