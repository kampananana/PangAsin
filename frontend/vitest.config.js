// WHAT: Vitest config for the frontend smoke tests.
// WHY: jsdom + the real providers (Router, Toast, auth) so a route crash is
//      caught the same way a user sees it — not a mocked shallow render.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [path.join(__dirname, 'src', 'test', 'setup.js')],
    include: [path.join(__dirname, 'src', 'test', '**', '*.test.{js,jsx}')],
    exclude: ['node_modules', 'dist', 'app'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // A console.error from React (or anything) fails the test — this is the
    // guardrail that surfaces "Objects are not valid as a React child" and
    // "Rendered more hooks than before" instead of letting them pass silently.
    onConsoleError(message) {
      // Recharts logs a benign "not a valid prop" warning in some versions;
      // everything else is a real failure.
      const text = Array.isArray(message) ? message.join(' ') : String(message);
      if (text.includes('React does not recognize the `fill` prop')) {
        return false;
      }
      throw new Error(`console.error during test: ${text}`);
    },
  },
  resolve: {
    alias: {
      // Leaflet pulls CSS at import time; stub it so jsdom does not choke.
      leaflet: path.join(__dirname, 'src', 'test', 'leaflet-stub.js'),
    },
  },
});