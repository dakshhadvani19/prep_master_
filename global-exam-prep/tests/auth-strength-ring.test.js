/**
 * The score ring must never clip a digit (0-6), at any score.
 *
 * The old CSS gave `.strength-ring-inner` a 22px disc, a 0.7rem glyph and NO
 * line-height, so the inherited line box (normal ≈ 1.2–1.4) was taller than the
 * circle and the "6" sat low, clipped by the rim. jsdom cannot lay text out, so
 * this asserts the geometry the browser will use, straight off the stylesheet:
 * a line box that fits the disc, explicit centering, and a disc that fits its ring.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Read the shipped sources, not a copy: the point is that the stylesheet the app
// actually loads has the properties that keep the digit inside the disc.
// (globalThis.process, because tests/ is linted without Node globals.)
const root = globalThis.process.cwd();
const css = readFileSync(`${root}/src/pages/Auth.css`, 'utf8');
const signupSrc = readFileSync(`${root}/src/pages/Signup.jsx`, 'utf8');

/** Declared properties of one selector, as { prop: value } (first/only definition). */
function blockOf(selector) {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} must exist in Auth.css`).toBeGreaterThan(-1);
  const end = css.indexOf('}', start);
  const body = css.slice(start + selector.length + 2, end);
  const out = {};
  for (const decl of body.split(';')) {
    const [prop, ...rest] = decl.split(':');
    if (prop && rest.length) out[prop.trim()] = rest.join(':').trim();
  }
  return out;
}

const toPx = (v) => {
  const n = parseFloat(v);
  return /rem$/.test(v) ? n * 16 : n;
};

describe('password score ring fits its digit', () => {
  const ring = blockOf('.strength-ring');
  const inner = blockOf('.strength-ring-inner');

  it('the disc is square and smaller than the ring, leaving room for the arc', () => {
    expect(toPx(inner.width)).toBe(toPx(inner.height));
    expect(toPx(ring.width)).toBe(toPx(ring.height));
    expect(toPx(inner.width)).toBeLessThan(toPx(ring.width));
    expect(toPx(ring.width) - toPx(inner.width)).toBeGreaterThanOrEqual(6); // ≥3px arc
  });

  it('the glyph box has an explicit line-height so no inherited metric can push it out', () => {
    expect(inner['line-height']).toBeDefined();
    expect(inner['line-height']).toBe('1');
    expect(inner['font-size']).toBeDefined();
    const disc = toPx(inner.width);
    const lineBox = toPx(inner['font-size']) * parseFloat(inner['line-height']);
    expect(lineBox).toBeLessThanOrEqual(disc);        // a single digit fits the disc
    expect(disc - lineBox).toBeGreaterThanOrEqual(8); // with slack for ascenders/descenders
  });

  it('centering is explicit in both axes and nothing can spill', () => {
    expect(inner.display).toBe('grid');
    expect(inner['place-items']).toBe('center');
    expect(inner['text-align']).toBe('center');
    expect(inner.overflow).toBe('hidden');
    expect(inner.padding ?? '0px').toBe('0');
  });

  it('digits stay evenly spaced so 0 and 6 occupy the same box', () => {
    expect(inner['font-variant-numeric']).toBe('tabular-nums');
  });

  it('has exactly one definition, so nothing downstream can un-centre it', () => {
    expect([...css.matchAll(/\.strength-ring-inner\s*{/g)]).toHaveLength(1);
    // and the component sizes nothing inline (only the conic-gradient arc)
    const jsx = signupSrc;
    const ringTag = jsx.slice(jsx.indexOf('className="strength-ring"'), jsx.indexOf('strength-ring-inner'));
    expect(ringTag).not.toMatch(/width\s*:/);
    expect(ringTag).not.toMatch(/height\s*:/);
  });
});
