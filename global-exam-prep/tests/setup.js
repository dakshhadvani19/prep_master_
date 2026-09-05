import '@testing-library/jest-dom/vitest';

// jsdom is missing these; framer-motion + the auth pages touch them.
if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}

// framer-motion's whileInView (5 uses on the homepage) starts an IntersectionObserver
// on mount. jsdom has none, so the exception took the whole homepage subtree with
// it. Browsers all provide it, so this is a test-environment gap, not a site bug.
if (!window.IntersectionObserver) {
  window.IntersectionObserver = class IntersectionObserver {
    constructor(callback) { this._cb = callback; }
    observe(target) {
      this._timer = setTimeout(() => this._cb?.([{
        target, isIntersecting: true, intersectionRatio: 1, boundingClientRect: {},
      }], this), 0);
    }
    unobserve() {}
    disconnect() { clearTimeout(this._timer); }
    takeRecords() { return []; }
  };
  globalThis.IntersectionObserver = window.IntersectionObserver;
}

if (!window.crypto?.subtle) {
  const { webcrypto } = await import('node:crypto');
  Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true });
}
