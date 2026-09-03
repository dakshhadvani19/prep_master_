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

if (!window.crypto?.subtle) {
  const { webcrypto } = await import('node:crypto');
  Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true });
}
