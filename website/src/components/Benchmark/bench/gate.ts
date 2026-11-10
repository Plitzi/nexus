import { writeFileSync } from 'node:fs';

import { runNexusOnly } from './scenarios';

// One measurement of nexus's own cases, written as JSON for `gateCompare.ts`: `npm run bench:gate -- <out.json>`.
const out = process.argv[2];
const reps = Number(process.env.BENCH_REPS) || 15;
const results = runNexusOnly(reps);
if (out) {
  writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
}

for (const { label, ms } of results) {
  console.log(`${ms.toFixed(3).padStart(10)} ms  ${label}`);
}
