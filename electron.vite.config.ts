import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { developmentCsp } from './apps/desktop/build/development-csp';
import { resolve } from 'node:path';
export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('apps/desktop/src/main/index.ts'),
          core: resolve('apps/desktop/src/core-host/index.ts'),
          migrate: resolve('apps/desktop/src/core-host/migrate.ts'),
        },
        output: { format: 'cjs', entryFileNames: '[name].cjs', chunkFileNames: '[name]-[hash].cjs' },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: resolve('apps/desktop/src/preload/index.ts'),
        output: { format: 'cjs', entryFileNames: 'index.cjs' },
      },
    },
  },
  renderer: {
    root: resolve('apps/desktop/src/renderer'),
    plugins: [react(), developmentCsp()],
    build: { rollupOptions: { input: resolve('apps/desktop/src/renderer/index.html') } },
  },
});
