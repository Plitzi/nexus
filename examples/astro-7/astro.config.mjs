import { fileURLToPath } from 'node:url';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';

const nexusSrc = fileURLToPath(new URL('../../src', import.meta.url));

// Astro 7: Vite 8 + the Rust compiler are the defaults — no extra flags needed. The React integration (v6) drives
// the islands. `@plitzi/nexus` is aliased straight to source so you never need to rebuild.
export default defineConfig({
  integrations: [react()],
  vite: {
    resolve: {
      alias: [
        { find: /^@plitzi\/nexus\/(.*)$/, replacement: `${nexusSrc}/$1` },
        { find: /^@plitzi\/nexus$/, replacement: `${nexusSrc}/index.ts` }
      ],
      dedupe: ['react', 'react-dom']
    }
  }
});
