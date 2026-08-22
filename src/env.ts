// Bundler-agnostic dev/prod/test detection. Avoids `import.meta.env` (Vite/Astro-only, and absent under raw `tsx`
// or webpack) so Nexus behaves identically under webpack, esbuild, Rollup, Bun, Node and Vite.
const resolveMode = (): string => {
  /**
   * The replaceable expression comes FIRST, and the guard is the `catch`.
   *
   * Every major bundler statically replaces the exact text `process.env.NODE_ENV` with a string literal — but
   * only that text. Writing `typeof process !== 'undefined' && process.env.NODE_ENV` puts a runtime check in
   * front of it that a browser fails (there is no `process` there), so the literal the bundler just injected is
   * never read and every build resolves to `production`. Nexus then believed it was in production inside every
   * browser bundle ever made of it, dev registries and all — silently, because production is a plausible answer.
   *
   * A `try` costs nothing and is the only form that works in all four cases: bundled with a define, bundled
   * without one, plain Node, and a browser with no bundler at all.
   */
  try {
    const mode = process.env.NODE_ENV;
    if (mode) {
      return mode;
    }
  } catch {
    // No `process`, and nothing replaced it. A browser with no build step: assume production.
  }

  return 'production';
};

export const MODE = resolveMode();
export const isProd = MODE === 'production';
export const isDev = !isProd;
export const isTest = MODE === 'test';
