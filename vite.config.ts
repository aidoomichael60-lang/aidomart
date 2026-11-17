import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

function copyRootStaticPlugin() {
  return {
    name: 'copy-root-static-to-dist',
    closeBundle() {
      const rootStaticDir = path.resolve(import.meta.dirname, 'static');
      const distStaticDir = path.resolve(import.meta.dirname, 'dist', 'static');
      if (fs.existsSync(rootStaticDir)) {
        fs.mkdirSync(distStaticDir, { recursive: true });
        fs.cpSync(rootStaticDir, distStaticDir, { recursive: true, force: true });
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), copyRootStaticPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
