import { createStore } from '@plitzi/nexus';

import { work } from './shared';

import type { Sample } from './shared';

/**
 * nexus's own path caches, which no other store has: what a builder does to them, read through `getPath`. Not a
 * comparison — the gate's alone (`runNexusOnly`).
 */

type Pages = Record<string, Record<string, { v: number }>>;

const pagesOf = (pages: number, perPage: number, prefix = 'p'): Pages =>
  Object.fromEntries(
    Array.from({ length: pages }, (_, page) => [
      `${prefix}${String(page)}`,
      Object.fromEntries(Array.from({ length: perPage }, (__, item) => [`e${String(item)}`, { v: item }]))
    ])
  );

/** Every call's pages are its own: a page left is never read again, as a builder's — not the same pages each rep. */
let calls = 0;

/** The set of paths in use moves: a builder switching pages, each page's elements read a few times over. */
export const pagesMoving = (pages: number, perPage: number, passes: number): Sample => {
  const prefix = `c${String(calls++)}p`;
  const store = createStore<Pages>(pagesOf(pages, perPage, prefix));
  const paths = Array.from({ length: pages }, (_, page) =>
    Array.from({ length: perPage }, (__, item) => `${prefix}${String(page)}.e${String(item)}.v`)
  );
  let read = 0;
  const start = performance.now();
  for (const page of paths) {
    for (let pass = 0; pass < passes; pass++) {
      for (const path of page) {
        read += Number(store.getPath(path as never));
      }
    }
  }

  const ms = performance.now() - start;
  work(read);

  return { name: 'nexus', wakes: read, ms };
};

/** More paths than any cache holds, read in rotation: every read is a miss, whatever the cache keeps. */
export const pathsRotating = (paths: number, rounds: number): Sample => {
  const perPage = 1000;
  const store = createStore<Pages>(pagesOf(Math.ceil(paths / perPage), perPage));
  const all = Array.from(
    { length: paths },
    (_, index) => `p${String(Math.floor(index / perPage))}.e${String(index % perPage)}.v`
  );
  let read = 0;
  const start = performance.now();
  for (let round = 0; round < rounds; round++) {
    for (const path of all) {
      read += Number(store.getPath(path as never));
    }
  }

  const ms = performance.now() - start;
  work(read);

  return { name: 'nexus', wakes: read, ms };
};
