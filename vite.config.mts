import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// App nueva (React). Vive en src/ y se publica en /app/ junto a la versión actual,
// servida por el mismo server.js desde dist/app.
export default defineConfig({
  root: 'src',
  base: '/app/',
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: '../dist/app',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: true, // permite probar en el teléfono conectado a la misma red Wi-Fi
    proxy: {
      // API y recursos de la versión actual (npm start en el puerto 3000).
      // DEV_TENANT=marsisa npx vite  → prueba contra la base de esa empresa (solo desarrollo).
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ...(process.env.DEV_TENANT ? { headers: { 'x-tenant-slug': process.env.DEV_TENANT } } : {}),
      },
    },
  },
});
