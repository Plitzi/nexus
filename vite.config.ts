/// <reference types="vitest" />

import fs from 'node:fs';
import path from 'node:path';

import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { defineConfig } from 'vitest/config';

function getEntries(root = path.resolve(__dirname, 'src')) {
  const pattern = /index\.(ts|tsx|js|mjs)$/;
  const entries: Record<string, string> = {};

  function walk(dir: string) {
    for (const file of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        walk(fullPath);
      } else if (pattern.test(file)) {
        const name = path.relative(root, fullPath).replace(pattern, '').replace(/\/$/, '') || 'index';
        entries[name] = fullPath;
      }
    }
  }

  walk(root);
  return entries;
}

export default defineConfig(({ mode, command }) => ({
  plugins: [
    react(),
    dts({
      entryRoot: 'src',
      exclude: ['**/*.test.(ts|tsx)', '**/*.stories.(ts|tsx)', 'vite.config.ts', 'setupTests.ts'],
      tsconfigPath: './tsconfig.app.json'
    }),
    {
      name: 'externalize-non-relative',
      enforce: 'pre',
      resolveId(source, importer) {
        if (!importer || command === 'serve' || process.env.VITEST) return null;
        if (!source.startsWith('.') && !path.isAbsolute(source)) {
          return { id: source, external: true };
        }
        return null;
      }
    }
  ],
  build: {
    lib: {
      entry: getEntries()
    },
    rollupOptions: {
      treeshake: false,
      output: {
        format: 'es',
        exports: 'named',
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].mjs',
        chunkFileNames: 'chunks/[name]-[hash].mjs'
      },
      external: id => {
        if (id.startsWith('node:')) return true;
        if (id === 'react' || id === 'react-dom' || id.startsWith('react-dom/') || id.startsWith('react/')) return true;
        if (!id.startsWith('.') && !id.startsWith('/')) return true;
        return false;
      }
    },
    sourcemap: false,
    emptyOutDir: mode === 'production'
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./setupTests.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'tests',
      include: ['src'],
      exclude: ['**/*.test.tsx', '**/*.stories.ts', '**/*.stories.tsx']
    },
    reporters: ['default']
  }
}));
