/**
 * The password-strength requirement list — the tick-mark checklist, and nothing else.
 *
 * The score ring used to sit beside this list and was removed deliberately (owner:
 * "I should not see any strength ring; only that list and tick mark on it is enough
 * as user types password"). What must not regress is therefore both halves of that
 * sentence: the list with its per-rule ticks stays, and the ring stays *gone* — the
 * markup must not come back through a copy-paste of an old form, and the removal must
 * not have dragged the shared CSS down with it (the OTP countdown ring reads
 * --ring-track).
 *
 * The score itself is checkPasswordStrength() and is untouched; its contract is
 * asserted here too, because the submit gate reads it.
 *
 * Like the file this replaces, these assertions read the sources rather than render
 * them: the contract is "what the component asks for", which a source check pins
 * exactly and cheaply.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// Read through the runner's cwd (vitest runs from the project root). `import.meta.url`
// is served over http:// inside the transform pipeline, so a URL-based path cannot be
// handed to readFileSync here; globalThis.process keeps the file lint-clean without
// widening the ESLint config for tests.
const root = `${globalThis.process.cwd()}/`;
const signupSrc = readFileSync(`${root}src/pages/Signup.jsx`, 'utf8');
const strengthSrc = readFileSync(`${root}src/utils/passwordStrength.js`, 'utf8');
const css = readFileSync(`${root}src/pages/Auth.css`, 'utf8');

/** The PasswordStrength component, sliced out of the page source. */
function componentBody(name) {
  const at = signupSrc.indexOf(`function ${name}(`);
  expect(at, `${name} is still defined in Signup.jsx`).toBeGreaterThan(-1);

  // Close the parameter list first: the ({ state }) braces are not the body's.
  let p = 0;
  let i = signupSrc.indexOf('(', at);
  for (; i < signupSrc.length; i += 1) {
    if (signupSrc[i] === '(') p += 1;
    else if (signupSrc[i] === ')') { p -= 1; if (p === 0) break; }
  }

  let depth = 0;
  let end = -1;
  for (let j = signupSrc.indexOf('{', i); j < signupSrc.length; j += 1) {
    if (signupSrc[j] === '{') depth += 1;
    else if (signupSrc[j] === '}') { depth -= 1; if (depth === 0) { end = j; break; } }
  }
  expect(end, `${name} has a balanced body`).toBeGreaterThan(at);
  return signupSrc.slice(at, end + 1);
}

const meter = componentBody('PasswordStrength');

describe('password strength UI: requirement list with ticks', () => {
  it('lists every unmet/met rule under an accessible label', () => {
    expect(meter).toContain('className="strength-meter-container"');
    expect(meter).toContain('className="strength-requirements"');
    expect(meter).toContain('aria-label="Password requirements"');
    expect(meter).toContain('className={item.pass ? \'met\' : \'unmet\'}');
    expect(meter).toContain('{item.label}');
  });

  it('shows a tick when a rule passes and a warning glyph while it does not', () => {
    expect(meter).toMatch(/item\.pass\s*\?\s*<CheckCircle2/);
    expect(meter).toContain('<AlertCircle size={12}');
    // Both glyphs are imported from lucide, not faked with characters.
    expect(signupSrc.slice(0, signupSrc.indexOf('const '))).toMatch(/CheckCircle2/);
    expect(signupSrc.slice(0, signupSrc.indexOf('const '))).toMatch(/AlertCircle/);
  });

  it('renders nothing at all before the user types', () => {
    // checkPasswordStrength() returns null for an empty field, and that is the only
    // case in which the meter is absent — no half-populated checklist on a blank box.
    expect(meter).toContain('if (!state) return null;');
  });

  it('reads its rows from checkPasswordStrength().checks, not from a copy', () => {
    expect(meter).toContain('state.checks');
    expect(meter).toMatch(/Object\.(keys|entries)\(checks\)/);
  });
});

describe('the score ring is gone, and its removal cost nothing else', () => {
  it('no ring markup survives anywhere on the page', () => {
    expect(signupSrc).not.toMatch(/className="strength-ring/);
    expect(signupSrc).not.toMatch(/strength-ring-inner/);
    expect(meter).not.toContain('conic-gradient');   // the ring was the only arc here
  });

  it('leaves no dead locals behind (the lint the removal almost created)', () => {
    // Removing the ring left `pct` and `color` computed and unused; the checklist
    // needs neither. Both must stay out, or every future edit re-adds the noise.
    expect(meter).not.toMatch(/const\s+pct\b/);
    expect(meter).not.toMatch(/const\s+color\b/);
  });

  it('keeps --ring-track, which the OTP countdown ring still paints with', () => {
    // Shared token: deleting it as "leftover from the strength ring" would break the
    // signup OTP timer instead.
    expect(css).toMatch(/--ring-track:/);
    expect(signupSrc).toContain('var(--ring-track)');
    expect(css).toMatch(/\.timer-ring\s*\{/);
  });
});

describe('scoring contract (must not change with the UI)', () => {
  it('still returns the six rules, a 0-100 percent and an isAcceptable gate', () => {
    for (const rule of ['length', 'uppercase', 'lowercase', 'number', 'special', 'notCommon']) {
      expect(strengthSrc).toContain(`${rule}:`);
    }
    expect(strengthSrc).toContain('percent: Math.round((score / 6) * 100)');
    expect(strengthSrc).toMatch(/isAcceptable:\s*score >= 4/);
    expect(strengthSrc).toMatch(/score = Object\.values\(checks\)\.filter\(c => c\.pass\)\.length/);
  });

  it('both password forms still block submit and render the meter from the same call', () => {
    expect(signupSrc.match(/checkPasswordStrength\(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(signupSrc.match(/<PasswordStrength state=/g)?.length).toBe(2);
    expect(signupSrc).toContain('if (!strength?.isAcceptable) {');
    expect(signupSrc).toContain('if (!strengthState?.isAcceptable) {');
  });
});
