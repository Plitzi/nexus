import { fileURLToPath } from 'node:url';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';

const nexusSrc = fileURLToPath(new URL('../../src', import.meta.url));

// Astro 6 LTS toolchain. The Nexus code in `src/` is byte-for-byte identical to the astro-7 example — only the
// framework version differs. `@plitzi/nexus` is aliased straight to source so you never need to rebuild.
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
