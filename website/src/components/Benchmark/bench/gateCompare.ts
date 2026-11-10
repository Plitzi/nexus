import { readFileSync, writeFileSync } from 'node:fs';

import { gateVerdict } from './gateVerdict';
import tolerances from './tolerances.json';

import type { CaseTime } from './gateVerdict';

/**
 * The CI gate: nexus measured on a change and on its base, on the same runner, in turns — each turn the base then the
 * head (`gate.ts`) — and each case judged by the median of its turns' head ÷ base (`gateVerdict.ts`). A case slower
 * past its tolerance fails the job; every case is printed.
 *
 * On a loaded runner one slow moment still decides a turn, so the first comparison is `--soft`: what it finds slower is
 * written (`--slower <file>`) and measured again in more turns, and only what all the turns together find slower fails.
 * A change that changed nothing failed the gate whenever the runner was busy.
 *
 * `tolerances.json` is twice each case's spread over ten runs on one machine (2026-11-10), 15 % at least. It is a
 * ratchet like the rest: tightened when a case steadies, never loosened to let a change through — a change that is
 * slower is redesigned or dropped (AGENTS.md § Rules).
 *
 * `npm run bench:compare -- --base base-1.json … --head head-1.json … [--soft] [--slower slower.txt] [--only
 * slower.txt]`, the files paired in order. */

type Run = { id: string; label: string; ms: number }[];

const args = process.argv.slice(2);
const files = (flag: string): string[] => {
  const start = args.indexOf(flag) + 1;
  const end = args.findIndex((arg, index) => index >= start && arg.startsWith('--'));

  return start === 0 ? [] : args.slice(start, end === -1 ? undefined : end);
};

const timesOf = (path: string): Map<string, CaseTime> =>
  new Map((JSON.parse(readFileSync(path, 'utf8')) as Run).map(({ id, label, ms }) => [id, { label, ms }]));

const bases = files('--base');
const heads = files('--head');
if (bases.length === 0 || bases.length !== heads.length) {
  console.error(`The turns are pairs: ${String(bases.length)} base and ${String(heads.length)} head measurements given`);
  process.exit(2);
}

const turns = bases.map((path, index) => ({ base: timesOf(path), head: timesOf(heads[index]) }));
// `--only <file>`: the cases a first comparison found slower, the ones the confirming turns judge — the rest passed.
const onlyFile = files('--only')[0];
const only = onlyFile ? new Set(readFileSync(onlyFile, 'utf8').split('\n').filter(Boolean)) : undefined;
const judged = gateVerdict(turns, tolerances);
const cases = judged.cases;
const slower = only ? judged.slower.filter(id => only.has(id)) : judged.slower;
const failures = only
  ? judged.failures.filter(line => only.has(line.slice(0, line.indexOf(':'))))
  : judged.failures;
// `--soft`: say what is slower and write it (`--slower <file>`) for the turns that confirm it, without failing yet.
const soft = args.includes('--soft');
const slowerOut = files('--slower')[0];

console.log(
  `${'case'.padEnd(16)} ${'base ms'.padStart(10)} ${'head ms'.padStart(10)} ${'change'.padStart(8)}  tolerance  (change: the median of the turns' head ÷ base)`
);
for (const verdict of cases) {
  if (verdict.kind === 'compared') {
    const { id, base: before, head: after, change, tolerance, slower: isSlower } = verdict;
    console.log(
      `${id.padEnd(16)} ${before.toFixed(3).padStart(10)} ${after.toFixed(3).padStart(10)} ${`${(change * 100).toFixed(1)}%`.padStart(8)}  ${String(Math.round(tolerance * 100))}%${isSlower ? '  ✗ slower' : ''}`
    );
  } else {
    const said = verdict.kind === 'new' ? 'new' : 'untolerated';
    console.log(
      `${verdict.id.padEnd(16)} ${'—'.padStart(10)} ${verdict.ms.toFixed(3).padStart(10)} ${said.padStart(8)}  ${verdict.label}`
    );
  }
}

if (slowerOut) {
  writeFileSync(slowerOut, slower.join('\n'));
}

if (failures.length > 0 && soft && failures.length === slower.length) {
  console.log(`\nSlower than its base, to be confirmed by more turns:\n${failures.map(line => `- ${line}`).join('\n')}`);
  process.exit(0);
}

if (failures.length > 0) {
  console.error(`\nnexus is slower than its base:\n${failures.map(line => `- ${line}`).join('\n')}`);
  process.exit(1);
}

console.log('\nNo case slower than its base past its tolerance.');
