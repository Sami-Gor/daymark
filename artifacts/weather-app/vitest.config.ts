import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // The unit tests import values from .tsx modules (for example
  // WEATHER_ERROR_KEYS from components/weather/WeatherError.tsx). Vite 8 reads
  // "jsx": "preserve" from tsconfig.json, which leaves TSX untransformed, so
  // Vitest needs the same React JSX transform the app build uses.
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/e2e/support/**/*.test.ts'],
  },
});
