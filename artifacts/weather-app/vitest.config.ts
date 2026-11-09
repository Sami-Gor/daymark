import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  esbuild: {
    // React 19 components are rendered with the automatic JSX runtime in tests.
    jsx: 'automatic',
  },
  test: {
    environment: 'node',
    // .tsx tests render components with react-dom/server; no browser DOM is
    // required, so the suite stays fast and dependency-free.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
