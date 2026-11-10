import { afterEach, describe, expect, it, vi } from 'vitest';

import parsePath from './parsePath';

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * The store's own path cache — every read and write parses through it — held to the 1.5.0 regression: after thousands of
 * paths read once, the few read next were split again on every read, because the cache had stopped taking any.
 */
describe('parsePath', () => {
  it('splits a path once however often it is read', () => {
    const split = vi.spyOn(String.prototype, 'split');
    for (let read = 0; read < 100; read++) {
      parsePath('once.read.often');
    }

    expect(split.mock.calls.filter(([separator]) => Object.is(separator, '.'))).toHaveLength(1);
  });

  it('caches the paths read after thousands read once', () => {
    for (let index = 0; index < 20_000; index++) {
      parsePath(`burst.${String(index)}.v`);
    }

    const split = vi.spyOn(String.prototype, 'split');
    for (let read = 0; read < 1000; read++) {
      parsePath(`hot.${String(read % 5)}.leaf`);
    }

    // Each hot path may be split twice — the miss that finds the cache resting, and the one that ends the rest.
    expect(split.mock.calls.filter(([separator]) => Object.is(separator, '.')).length).toBeLessThanOrEqual(10);
  });

  it('answers the same segments for the same path', () => {
    expect(parsePath('a.b.c')).toEqual(['a', 'b', 'c']);
    expect(parsePath('a.b.c')).toBe(parsePath('a.b.c'));
  });
});
