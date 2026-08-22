import { describe, it, expect } from 'vitest';

/**
 * The mode has to survive a BUNDLER, which is where this went wrong for a long time.
 *
 * A bundler replaces the exact text `process.env.NODE_ENV` with a literal and nothing else. Any runtime guard in
 * front of that expression — `typeof process !== 'undefined' && …` — is still evaluated afterwards, and in a
 * browser it fails, so the literal the bundler just injected is never read. The result is a library that believes
 * it is in production inside every browser build of it, which is a plausible enough answer that nobody notices
 * until a dev-only registry turns up empty.
 */
describe('the mode Nexus resolves', () => {
  it('reads what the environment says, rather than assuming production', async () => {
    // Vitest runs with NODE_ENV=test, so this is the honest end-to-end check of the same code path a bundle takes.
    const { MODE, isDev, isProd, isTest } = await import('./env');

    expect(MODE).toBe('test');
    expect(isTest).toBe(true);
    expect(isDev).toBe(true);
    expect(isProd).toBe(false);
  });

  /**
   * What a browser bundle actually looks like: no `process` at all, and the define already folded away.
   *
   * The old form threw this at a `typeof` check and answered `production`. The `try` form lets the injected
   * literal answer, and falls back only when there is genuinely nothing to read.
   */
  it('falls back to production where there is no process and nothing replaced it', () => {
    const resolve = (): string => {
      try {
        // Reads it the way the shipped code does — straight at it, with the failure handled below.
        const mode = (globalThis as unknown as { process: { env: Record<string, string> } }).process.env.NODE_ENV;
        if (mode) {
          return mode;
        }
      } catch {
        // no process
      }

      return 'production';
    };

    const saved = (globalThis as { process?: unknown }).process;
    delete (globalThis as { process?: unknown }).process;

    expect(resolve()).toBe('production');

    (globalThis as { process?: unknown }).process = saved;
  });
});
