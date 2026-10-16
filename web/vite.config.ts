import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import pkg from './package.json';

export default defineConfig({
  plugins: [react()],
  // версия сайта — из package.json (уходит в обращения в поддержку, чтобы знать, в какой версии ошибка)
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version) },
  server: {
    port: 5173,
    // при разработке API отдаёт сервер NestJS
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
  },
});
