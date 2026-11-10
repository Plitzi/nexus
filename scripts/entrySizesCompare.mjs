import fs from 'fs';

/**
 * The size gate: each public entry's compressed size on a change against its base (`entrySizes.mjs`), and the job
 * fails when one grows past its tolerance (`entrySizes.tolerances.json`: the larger of a share of the base's size and a
 * number of bytes, `default` for an entry it does not name). A size is the build's, not a measurement's: it does not
 * wander, so the tolerance is room for a change that adds what it must — a feature's few hundred bytes — and what it
 * stops is a module pulled in by accident, kilobytes at once. An entry that has to grow past it is the maintainer's
 * decision, not this job's: a ratchet like the benchmark's, never loosened to let a change through.
 *
 * `node scripts/entrySizesCompare.mjs <base.json> <head.json>`
 */

const [basePath, headPath] = process.argv.slice(2);
const read = (file) => new Map(JSON.parse(fs.readFileSync(file, 'utf8')).map(size => [size.entry, size]));
const base = read(basePath);
const head = read(headPath);
const tolerances = JSON.parse(fs.readFileSync(new URL('./entrySizes.tolerances.json', import.meta.url), 'utf8'));
const over = [];

console.log(`${'entry'.padEnd(18)} ${'base B'.padStart(8)} ${'head B'.padStart(8)} ${'change'.padStart(8)}  tolerance`);
for (const [entry, { gzip }] of head) {
  const before = base.get(entry);
  const { share, bytes } = tolerances[entry] ?? tolerances.default;
  if (!before) {
    console.log(`${entry.padEnd(18)} ${'—'.padStart(8)} ${String(gzip).padStart(8)}      new`);
    continue;
  }

  const change = gzip / before.gzip - 1;
  const room = Math.max(before.gzip * share, bytes);
  const past = gzip - before.gzip > room;
  const said = `${String(Math.round(share * 100))}% or ${String(bytes)} B`;
  console.log(
    `${entry.padEnd(18)} ${String(before.gzip).padStart(8)} ${String(gzip).padStart(8)} ${`${(change * 100).toFixed(1)}%`.padStart(8)}  ${said}${past ? '  ✗ larger' : ''}`
  );
  if (past) {
    over.push(`${entry}: ${before.gzip} → ${gzip} B gzip (+${gzip - before.gzip} B), past its ${said}`);
  }
}

for (const entry of base.keys()) {
  if (!head.has(entry)) {
    console.log(`${entry.padEnd(18)} ${String(base.get(entry).gzip).padStart(8)} ${'—'.padStart(8)}  removed`);
  }
}

if (over.length > 0) {
  console.log(`\nAn entry grew past its tolerance:\n${over.map(line => `- ${line}`).join('\n')}`);
  process.exit(1);
}

console.log('\nNo entry grew past its tolerance.');
