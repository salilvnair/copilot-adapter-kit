import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

// Three entries, one per webview surface. Output lands in media/dist/ where the
// extension host reads it through the generated manifest.
export default defineConfig({
  root: resolve(__dirname),
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // dui ships Vite-specific worker imports its prebundler cannot parse.
    exclude: ['@salilvnair/dui'],
  },
  build: {
    outDir: resolve(__dirname, '..', 'media', 'dist'),
    emptyOutDir: true,
    manifest: true,
    // Fonts must stay as separate files: inlining a 25 KB woff2 as a data URI
    // blocks first paint on the whole stylesheet.
    assetsInlineLimit: (file: string) => (/\.woff2?$/.test(file) ? false : undefined),
    target: 'es2022',
    rollupOptions: {
      input: {
        settings:   resolve(__dirname, 'settings.html'),
        spendGuard: resolve(__dirname, 'spend-guard.html'),
        sidebar:    resolve(__dirname, 'sidebar.html'),
        harness:    resolve(__dirname, 'harness.html'),
      },
    },
  },
});
