import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Pantalla de TV (Centro de Control) en /tv. Se compila aparte, con destino conservador (Chrome antiguo de Smart TV).
// Sale en dist/tv-app y la entrega server.js; la versión anterior queda en /tv-clasico como respaldo.
export default defineConfig({
  root: 'tv-app',
  base: '/tv-app/',
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: '../dist/tv-app',
    emptyOutDir: true,
    target: 'es2019',
    cssTarget: 'chrome79',
  },
  server: { port: 5175, host: true, proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true }, '/libs': { target: 'http://localhost:3000', changeOrigin: true } } },
});
