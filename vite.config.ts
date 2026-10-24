import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

export default defineConfig({
  // Relative paths: the build runs from any folder or static host (GitHub Pages subpath, a frame)
  base: './',
  plugins: [react(), tailwindcss()],
});
