import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolved from import.meta.url rather than import.meta.dirname, which needs
// Node 20.11+. This works on 18 too, and on paths containing spaces.
const ROOT = dirname(fileURLToPath(import.meta.url));

/**
 * The loader itself has no build step and no runtime dependencies - it is
 * plain ES modules and CSS. Vite is here for the dev server and to produce a
 * static bundle; nothing in loader/ imports it.
 */
export default defineConfig({
  root: resolve(ROOT, '.'),

  server: {
    // strictPort is deliberately OFF: if 5173 is taken, Vite moves to the
    // next free port and prints it, rather than refusing to start.
    port: 5173,
    strictPort: false,
    open: true,
    // The huge base64 asset module is fine to serve raw; don't pre-bundle it.
    fs: { strict: true }
  },

  preview: {
    port: 4173,
    strictPort: false
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // The test harnesses are NOT in the production bundle. They expose
      // __debug scrubbing and would be publicly reachable on the deployed
      // site; `npm test` drives them through the dev server and never needs
      // them built. `npm run build:harness` adds them back for checking a
      // built copy on a real device.
      input: process.env.BUILD_HARNESS
        ? {
            index: resolve(ROOT, 'index.html'),
            selftest: resolve(ROOT, 'tools/selftest.html'),
            responsive: resolve(ROOT, 'tools/responsive.html'),
            frame: resolve(ROOT, 'tools/frame.html')
          }
        : { index: resolve(ROOT, 'index.html') }
    },
    // swish-assets.js is ~100KB of inlined base64 by design. Don't warn.
    chunkSizeWarningLimit: 1024
  },

  esbuild: {
    // loader/react/SwishLoader.jsx is published as SOURCE for consumers to
    // compile with their own bundler - it never enters this build. esbuild's
    // own automatic-runtime transform covers it if anything here ever does
    // import it, which is why @vitejs/plugin-react is not a dependency: it
    // would only add Fast Refresh for JSX that is not in the graph.
    jsx: 'automatic'
  }
});
