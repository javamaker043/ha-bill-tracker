import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' so assets resolve correctly when served behind Home Assistant's
// Ingress reverse proxy, which mounts the app under a dynamic path prefix.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8099',
    },
  },
});
