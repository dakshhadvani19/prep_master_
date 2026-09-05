/**
 * The password-strength score ring: one glyph, inside a small circle.
 *
 * This broke twice in production — the digit overflowed the ring (0.625rem on a
 * 22px circle), then it sat low inside it — both times because a number written
 * somewhere else moved and this box's geometry did not follow. So the assertions
 * here are all relative to the geometry the CSS itself declares: the ring is sized
 * from --ring-size, the disc from --ring-size minus twice --ring-arc, and the glyph
 * from the disc. There is deliberately no literal 34/26/12 in this file: if someone
 * retunes --ring-size, the contract must still hold and the test must still pass.
 *
 * The fix lives only in sizing and centring. The score itself is
 * checkPasswordStrength() and is untouched.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// Read through the runner's cwd (vitest runs from the project root). `import.meta.url`
// is served over http:// inside the transform pipeline, so a URL-based path cannot be
// handed to readFileSync here; globalThis.process keeps the file lint-clean without
// widening the ESLint config for tests.
const root = `${globalThis.process.cwd()}/`;
const css = readFileSync(`${root}src/pages/Auth.css`, 'utf8');
const signupSrc = readFileSync(`${root}src/pages/Signup.jsx`, 'utf8');

/** Comments stripped once: `;` and `/*` inside a comment would split declarations. */
const flat = css.replace(/\/\*[\s\S]*?\*\//g, ' ');

/** Declarations of the block whose selector list ends in `selector`, nesting included. */
function blockOf(selector) {
  const needle = `${selector} {`;
  const at = flat.indexOf(needle);
  if (at < 0) throw new Error(`no CSS block matched "${selector}"`);
  let depth = 0;
  let end = -1;
  for (let i = at + needle.length - 1; i < flat.length; i += 1) {
    if (flat[i] === '{') depth += 1;
    else if (flat[i] === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) throw new Error(`unbalanced braces after "${selector}"`);
  // Only the declarations that are direct children of this block (depth 1).
  const body = flat.slice(at + needle.length, end);
  const out = {};
  let level = 0;
  let token = '';
  const feed = (chunk) => {
    const [prop, ...rest] = chunk.split(':');
    if (level === 0 && prop && rest.length) out[prop.trim()] = rest.join(':').trim();
  };
  for (const ch of body) {
    if (ch === '{') { level += 1; feed(token); token = ''; continue; }
    if (ch === '}') { level -= 1; token = ''; continue; }
    if (ch === ';') { feed(token); token = ''; continue; }
    token += ch;
  }
  feed(token);
  return out;
}

const toPx = (v) => {
  const n = parseFloat(v);
  return /rem$/.test(v) ? n * 16 : n;
};

describe('password score ring fits its digit', () => {
  const ring = blockOf('.strength-ring');
  const inner = blockOf('.strength-ring-inner');

  // Resolve the geometry the CSS declares, in px.
  const size = toPx(ring['--ring-size']);
  const arc = toPx(ring['--ring-arc']);
  const disc = size - arc * 2;                      // what --ring-disc evaluates to
  const fontFactor = (() => {
    const m = /calc\(var\(--ring-disc\)\s*\*\s*([0-9.]+)\)/.exec(inner['font-size'] || '');
    return m ? Number(m[1]) : NaN;
  })();
  const fontPx = disc * fontFactor;

  it('sizes the whole thing from one custom property, so the parts cannot drift', () => {
    expect(ring.width).toBe('var(--ring-size)');
    expect(ring.height).toBe('var(--ring-size)');
    expect(ring['--ring-disc']).toContain('--ring-size');
    expect(ring['--ring-disc']).toContain('--ring-arc');
    expect(inner.width).toBe('var(--ring-disc)');
    expect(inner.height).toBe('var(--ring-disc)');
    expect(inner['min-width']).toBe(inner.width);    // nothing may squash the box
    expect(inner['min-height']).toBe(inner.height);
    expect(inner.width).not.toMatch(/rem|px/);       // declared once, in the ring
    expect(inner.height).not.toMatch(/rem|px/);
  });

  it('leaves room for the arc on every side and squares the ring', () => {
    expect(arc).toBeGreaterThanOrEqual(3);           // the progress arc has to be visible
    expect(arc * 2).toBeLessThan(size);
    expect(disc).toBeGreaterThan(0);
    expect(ring['border-radius']).toBe('50%');          // a circle at any --ring-size
  });

  it('sizes the glyph from the disc, so no inherited text metric can push it out', () => {
    expect(Number.isFinite(fontFactor)).toBe(true);
    expect(inner['font-size']).not.toMatch(/rem/);
    expect(fontFactor).toBeGreaterThanOrEqual(0.3);   // legible in a 34px ring
    expect(fontFactor).toBeLessThanOrEqual(0.6);      // still one glyph, not a blob
    // The line box — not the glyph — is what the grid centres and what could overflow,
    // so the containment budget is computed with the leading included. 1.0 ≤ lh ≤ 1.4
    // is the window in which the ink is optically centred in a circle this small
    // (measured: lh 1 rides 1.5px high, lh 1.3 lands on the centre line).
    const lh = parseFloat(inner['line-height']);
    expect(lh).toBeGreaterThanOrEqual(1);
    expect(lh).toBeLessThanOrEqual(1.4);
    expect(fontPx * lh).toBeLessThanOrEqual(disc - 4);     // leading included, still inside
    expect(fontPx * 1.15).toBeLessThanOrEqual(disc);       // glyph advance fits
  });

  it('centres explicitly in both axes and clips anything that would escape', () => {
    expect(inner['line-height']).toBe('1.3');          // leading that optically centres the ink
    expect(inner.display).toBe('grid');
    expect(inner['place-items']).toBe('center');
    expect(inner['text-align']).toBe('center');
    expect(inner.overflow).toBe('hidden');
    expect(inner.padding).toBe('0');                    // asymmetric padding = off-centre
    expect(inner.margin).toBeUndefined();
    expect(ring.display).toBe('flex');
    expect(ring['align-items']).toBe('center');
    expect(ring['justify-content']).toBe('center');
  });

  it('keeps the digit optically level and evenly spaced', () => {
    expect(inner['font-variant-numeric']).toBe('tabular-nums');
    expect(inner['font-weight']).toBe('600');
    expect(inner['border-radius']).toBe('50%');
    expect(inner.background).toContain('--card-bg-solid');  // the disc, not the arc
  });

  it('defines each block exactly once and sizes nothing inline in the component', () => {
    expect([...css.matchAll(/\.strength-ring-inner\s*{/g)]).toHaveLength(1);
    expect([...css.matchAll(/(^|[\s,}])\.strength-ring\s*{/g)]).toHaveLength(1);
    const ringMarkup = signupSrc.slice(
      signupSrc.indexOf('className="strength-ring"'),
      signupSrc.indexOf('className="strength-ring-inner"') + 60,
    );
    expect(ringMarkup).toBeTruthy();
    expect(ringMarkup).not.toMatch(/width\s*:/);
    expect(ringMarkup).not.toMatch(/height\s*:/);
    expect(ringMarkup).not.toMatch(/font-size\s*:/);
    expect(ringMarkup).not.toMatch(/line-height\s*:/);
    expect(ringMarkup).not.toMatch(/padding\s*:/);
    // The score number itself is still rendered from the strength check, untouched.
    // The digit is the score itself, rendered in the centred disc — no extra box.
    expect(signupSrc).toMatch(/className="strength-ring-inner">\{state\.score\}<\/div>/);
  });

  it('still hands the arc its percentage from the score — the scoring logic is not touched', () => {
    const conic = signupSrc.slice(
      signupSrc.indexOf('function PasswordStrength'),
      signupSrc.indexOf('className="strength-ring-inner"'),
    );
    // The arc still comes from checkPasswordStrength()'s percent, clamped — the one
    // thing in this area that must not change while the box is being fixed.
    expect(conic).toMatch(/Math\.max\(0, Math\.min\(100, state\.percent \?\? 0\)\)/);
    expect(conic).toMatch(/conic-gradient\(\$\{color\} \$\{pct\}%/);
  });
});
