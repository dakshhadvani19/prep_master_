import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Separate config for tests so the app's vite.config.js stays untouched.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.{js,jsx}'],
    css: false,
  },
});
