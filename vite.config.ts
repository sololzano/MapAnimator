import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { placesPlugin } from './scripts/places.ts';

export default defineConfig({
  plugins: [react(), tailwindcss(), placesPlugin()],
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 2500 },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
