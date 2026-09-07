import path from 'path';
import fs from 'node:fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type PluginOption } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

// The hand-written public/sw.js contains a "__PRECACHE_ASSETS__" placeholder.
// After the build writes dist, patch it with the real hashed asset list so the
// service worker can precache the full app shell for offline use.
function swPrecache(): PluginOption {
  return {
    name: 'daymark-sw-precache',
    apply: 'build',
    closeBundle() {
      const outDir = path.resolve(import.meta.dirname, 'dist/public');
      const swPath = path.join(outDir, 'sw.js');
      const assetsDir = path.join(outDir, 'assets');
      if (!fs.existsSync(swPath) || !fs.existsSync(assetsDir)) return;
      const assets = fs
        .readdirSync(assetsDir)
        .filter((file) => /\.(js|css)$/.test(file))
        .map((file) => `./assets/${file}`);
      const source = fs.readFileSync(swPath, 'utf8').replace(
        '"__PRECACHE_ASSETS__"',
        JSON.stringify(['./index.html', ...assets]),
      );
      fs.writeFileSync(swPath, source);
    },
  };
}

// Replit injects PORT and BASE_PATH; fall back to local dev defaults when absent.
const rawPort = process.env.PORT ?? '5173';

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base: basePath,
  plugins: [
    swPrecache(),
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
