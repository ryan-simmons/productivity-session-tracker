// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr'; // Make sure this line exists

export default defineConfig({
  plugins: [
    react(),
    svgr() // And make sure it is included here in the plugins array
  ],
});