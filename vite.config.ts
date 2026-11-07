import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.API_TARGET || 'http://127.0.0.1:3001';

export default defineConfig(({ mode }) => ({
  // Only the GitHub Pages project build lives below the repository path. Normal
  // development and full-stack deployments retain their existing root URLs.
  base: mode === 'github-pages' ? '/zen-z-ka-dukan-website/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Arena's live preview uses a generated *.e2b.app host.
    allowedHosts: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
      '/media': { target: apiTarget, changeOrigin: false },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          gsap: ['gsap', 'gsap/ScrollTrigger'],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
}));
