import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const raiz = fileURLToPath(new URL('.', import.meta.url));

// Sitios públicos (cartera en azkell.com y producto en fleet.azkell.com).
// Se publican con el mismo servidor (services/sitios_publicos.js) desde dist/sitios.
export default defineConfig({
  root: 'sitios',
  base: '/',
  publicDir: 'public',
  plugins: [react()],
  build: {
    outDir: '../dist/sitios',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        cartera: resolve(raiz, 'sitios/cartera/index.html'),
        fleet: resolve(raiz, 'sitios/fleet/index.html'),
      },
    },
  },
  server: { port: 5174, host: true },
});
