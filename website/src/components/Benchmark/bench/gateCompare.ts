import { readFileSync } from 'node:fs';

import tolerances from './tolerances.json';

/**
 * The CI gate: nexus measured on a change and on its base, on the same runner, in turns (`gate.ts`), each case's best
 * median kept — one slow moment of a shared runner lands on one turn, not on all three. A case slower than its base past
 * its tolerance fails the job; every case is printed.
 *
 * `tolerances.json` is twice each case's spread over ten runs on one machine (2026-11-10), 15 % at least. It is a
 * ratchet like the rest: tightened when a case steadies, never loosened to let a change through — a change that is
 * slower is redesigned or dropped (AGENTS.md § Rules).
 *
 * `npm run bench:compare -- --base base-1.json base-2.json … --head head-1.json head-2.json …`
 */

type Run = { id: string; label: string; ms: number }[];

const args = process.argv.slice(2);
const files = (flag: string): string[] => {
  const start = args.indexOf(flag) + 1;
  const end = args.findIndex((arg, index) => index >= start && arg.startsWith('--'));

  return args.slice(start, end === -1 ? undefined : end);
};

const best = (paths: string[]): Map<string, { label: string; ms: number }> => {
  const out = new Map<string, { label: string; ms: number }>();
  for (const path of paths) {
    for (const { id, label, ms } of JSON.parse(readFileSync(path, 'utf8')) as Run) {
      const seen = out.get(id);
      out.set(id, { label, ms: seen ? Math.min(seen.ms, ms) : ms });
    }
  }

  return out;
};

const base = best(files('--base'));
const head = best(files('--head'));
const limits: Record<string, number | undefined> = tolerances;
const slower: string[] = [];

console.log(
  `${'case'.padEnd(12)} ${'base ms'.padStart(10)} ${'head ms'.padStart(10)} ${'change'.padStart(8)}  tolerance`
);
for (const [id, { label, ms }] of head) {
  const before = base.get(id);
  const tolerance = limits[id];
  if (!before || tolerance === undefined) {
    slower.push(`${id}: ${before ? 'no tolerance in tolerances.json' : 'not measured on the base'} — ${label}`);
    continue;
  }

  const change = ms / before.ms - 1;
  const over = change > tolerance;
  console.log(
    `${id.padEnd(12)} ${before.ms.toFixed(3).padStart(10)} ${ms.toFixed(3).padStart(10)} ${`${(change * 100).toFixed(1)}%`.padStart(8)}  ${String(Math.round(tolerance * 100))}%${over ? '  ✗ slower' : ''}`
  );
  if (over) {
    slower.push(
      `${id}: ${(change * 100).toFixed(1)}% slower than its base, past its ${String(Math.round(tolerance * 100))}% — ${label}`
    );
  }
}

if (slower.length > 0) {
  console.error(`\nnexus is slower than its base:\n${slower.map(line => `- ${line}`).join('\n')}`);
  process.exit(1);
}

console.log('\nNo case slower than its base past its tolerance.');
