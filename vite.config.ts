/// <reference types="vitest" />

import fs from 'node:fs';
import path from 'node:path';

import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { defineConfig } from 'vitest/config';

// `import.meta.dirname` rather than `__dirname`: this file is ESM, and Vite's native config loader — already the
// default in a coming major — does not define the CommonJS globals it used to shim in.
function getEntries(root = path.resolve(import.meta.dirname, 'src')) {
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

/** Core tests that read `window` or `localStorage` — a devtools extension, persistence, a scope read off the page. */
const DOM_TESTS = [
  'src/middleware/middleware.test.ts',
  'src/middleware/reduxDevToolsMiddleware.test.ts',
  'src/scopedStoreGetPath.test.ts'
];

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
        if (!importer || command === 'serve' || process.env.VITEST) {
          return null;
        }
        if (!source.startsWith('.') && !path.isAbsolute(source)) {
          return { id: source, external: true };
        }
        return null;
      }
    }
  ],
  build: {
    lib: {
      entry: getEntries(),
      // Without this Vite also runs a `cjs` pass, and both passes write `[name].mjs` — the CJS output
      // silently overwrites the ESM one, leaving `require()` calls inside .mjs files.
      formats: ['es']
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
        if (id.startsWith('node:')) {
          return true;
        }
        if (id === 'react' || id === 'react-dom' || id.startsWith('react-dom/') || id.startsWith('react/')) {
          return true;
        }
        if (!id.startsWith('.') && !id.startsWith('/')) {
          return true;
        }
        return false;
      }
    },
    sourcemap: false,
    emptyOutDir: mode === 'production'
  },
  test: {
    globals: true,
    setupFiles: ['./setupTests.ts'],
    /**
     * The core is framework-free and runs in Node; only what renders or reads `window` gets a DOM. Every file starting a
     * jsdom was three quarters of the run's time (RFC 0033 N6). A test that needs a DOM is one of the bindings', a
     * `.test.tsx`, or named in `DOM_TESTS`.
     */
    projects: [
      {
        extends: true,
        test: {
          name: 'core',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/react/**', ...DOM_TESTS]
        }
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx', 'src/react/**/*.test.ts', ...DOM_TESTS]
        }
      }
    ],
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
