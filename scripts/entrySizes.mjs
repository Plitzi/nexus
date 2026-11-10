import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

/**
 * What a consumer loads for each public entry of the built package — `.`, `./react`, `./vue`… — compressed: the entry
 * and every module of this package it imports, read off `dist` (one module per source file), the externals (React,
 * Vue) left out as the consumer's own. Written as JSON for `entrySizesCompare.mjs`: `node scripts/entrySizes.mjs <out>`.
 */

const DIST = path.resolve('./dist');
const IMPORT = /(?:import|export)\s*(?:[^'"]*?from\s*)?["'](\.{1,2}\/[^"']+)["']/g;

const closureOf = (entry) => {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) {
      return;
    }

    seen.add(file);
    const code = fs.readFileSync(file, 'utf8');
    for (const [, specifier] of code.matchAll(IMPORT)) {
      visit(path.resolve(path.dirname(file), specifier));
    }
  };
  visit(entry);

  return [...seen].sort();
};

if (!fs.existsSync(DIST)) {
  throw new Error('No dist/ to measure: run yarn build:prod first');
}

const { exports } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
// The public entries are the barrels: a subpath whose module is `dist/<name>.mjs`, not a file deep in a folder.
const entries = Object.entries(exports)
  .map(([subpath, conditions]) => [subpath, typeof conditions === 'string' ? conditions : conditions.import])
  .filter(([, file]) => typeof file === 'string' && /^\.\/dist\/[^/]+\.mjs$/.test(file));

const sizes = entries.map(([subpath, file]) => {
  const modules = closureOf(path.resolve(file));
  const code = modules.map(module => fs.readFileSync(module, 'utf8')).join('\n');

  return {
    entry: subpath,
    modules: modules.length,
    gzip: zlib.gzipSync(code, { level: 9 }).length,
    brotli: zlib.brotliCompressSync(code).length
  };
});

const out = process.argv[2];
if (out) {
  fs.writeFileSync(out, `${JSON.stringify(sizes, null, 2)}\n`);
}

for (const { entry, modules, gzip } of sizes) {
  console.log(`${String(gzip).padStart(8)} B gzip  ${String(modules).padStart(4)} modules  ${entry}`);
}
