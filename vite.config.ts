import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5180 },
  // Relative asset paths so the build works under any GitHub Pages sub-path
  // (e.g. https://<user>.github.io/transformica-admin/). Safe because the panel
  // has no client-side routing/deep links.
  base: './',
});
