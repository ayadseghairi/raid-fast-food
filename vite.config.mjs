import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Vite plugin: replaces the connect-src placeholder with the correct value
 * depending on the build mode.
 *
 * - dev:  connect-src allows ws://localhost:5173 for HMR + DevTools
 * - prod: connect-src 'none'  (100% offline, no outbound connections)
 */
function cspPlugin() {
  return {
    name: 'csp-inject',
    transformIndexHtml(html, ctx) {
      const isDev = ctx.server != null; // true during `vite dev`
      const connectSrc = isDev
        ? "connect-src 'self' ws://localhost:5173 http://localhost:5173"
        : "connect-src 'none'";
      return html.replace('__CONNECT_SRC__', connectSrc);
    },
  };
}

export default defineConfig({
  plugins: [react(), cspPlugin()],
  base: './',
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
