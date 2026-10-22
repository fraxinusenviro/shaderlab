/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Base path strategy (centralised here; the app reads import.meta.env.BASE_URL):
 *   BASE_PATH=/repo/   explicit (CI passes the value reported by actions/configure-pages)
 *   BASE_PATH=/        custom domain / root hosting
 *   unset              "/" locally; "/<repo>/" when building inside GitHub Actions
 */
function resolveBase(): string {
  let base = process.env.BASE_PATH;
  if (base === undefined && process.env.GITHUB_ACTIONS && process.env.GITHUB_REPOSITORY) {
    base = `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/`;
  }
  base = (base ?? '/').trim() || '/';
  if (!base.startsWith('/')) base = `/${base}`;
  if (!base.endsWith('/')) base = `${base}/`;
  return base;
}

function appVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
  let sha = process.env.GITHUB_SHA?.slice(0, 7) ?? '';
  if (!sha) {
    try {
      sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      sha = 'dev';
    }
  }
  return `${pkg.version}+${sha}`;
}

export default defineConfig({
  base: resolveBase(),
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'Shader Forge — WebGL Shader Studio',
        short_name: 'Shader Forge',
        description: 'Author, import, tweak, mutate, compare and export WebGL shaders. Works offline.',
        theme_color: '#0b0d12',
        background_color: '#0b0d12',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        categories: ['graphics', 'developer', 'art'],
        shortcuts: [
          { name: 'Viewer', short_name: 'Viewer', description: 'Simple full-screen shader viewer', url: './#/view', icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Fractal zoom', short_name: 'Fractal', description: 'Mandelbrot deep zoom', url: './#/fractal', icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Landscape studio', short_name: 'Landscape', description: 'Procedural landscape & waterscape generator', url: './#/landscape', icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
        ],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Presets are bundled into the JS, so precaching the shell caches them too.
        globPatterns: ['**/*.{js,css,html,svg,png,webp,ico,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          codemirror: ['@codemirror/state', '@codemirror/view', '@codemirror/language', '@codemirror/commands', '@codemirror/lint', '@codemirror/search', '@codemirror/autocomplete', '@codemirror/legacy-modes/mode/clike'],
          vendor: ['react', 'react-dom', 'zustand', 'dexie', 'jszip'],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
