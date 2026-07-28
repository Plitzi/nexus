import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// GitHub Pages serves from https://<org>.github.io/<repo>/, so assets need that sub-path as base.
// In dev or with a custom domain, VITE_BASE should be '/'.
const base = process.env.VITE_BASE ?? '/';

// By default the site dogfoods the store straight from source for instant feedback. The deploy CI sets
// VITE_USE_PUBLISHED=true to build the public demo against the latest npm release instead of the dev symlink.
const usePublished = process.env.VITE_USE_PUBLISHED === 'true';
const storeSrc = fileURLToPath(new URL('../src', import.meta.url));

export default defineConfig({
  base,
  resolve: {
    // nexus source lives in the project root (../src), so without deduping it would import a different copy of React
    // while react-dom uses this app's copy — two React instances, null hooks. Force a single copy.
    dedupe: ['react', 'react-dom'],
    alias: usePublished
      ? []
      : [
          // Subpaths (`/react`, `/vue`, `/next`, `/rsc`, deep module paths) map straight into the source tree; the
          // exact root maps to the agnostic core entry. Prefix rule must come before the exact-root rule.
          { find: /^@plitzi\/nexus\/(.*)$/, replacement: `${storeSrc}/$1` },
          { find: /^@plitzi\/nexus$/, replacement: `${storeSrc}/index.ts` }
        ]
  },
  // The store source lives in the project root (../src); let the dev server read it.
  server: { fs: { allow: ['..'] } },
  plugins: [react(), tailwindcss()]
});
