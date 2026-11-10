import { describe, expect, it } from 'vitest';

import { createGenerationalCache } from './generationalCache';

const filled = (limit: number, keys: string[]) => {
  const cache = createGenerationalCache<string>(limit);
  keys.forEach(key => cache.set(key, key.toUpperCase()));

  return cache;
};

describe('createGenerationalCache', () => {
  it('keeps everything below its limit', () => {
    const cache = filled(4, ['a', 'b', 'c', 'd']);

    expect(['a', 'b', 'c', 'd'].map(key => cache.get(key))).toEqual(['A', 'B', 'C', 'D']);
    expect(cache.get('e')).toBeUndefined();
  });

  it('keeps what was read since the last swap, and forgets what was not read for two', () => {
    const cache = filled(2, ['a', 'b']);
    // Full: `c` starts a new generation, `a` and `b` are the old one.
    cache.set('c', 'C');
    // Read again, `a` moves back to the young generation.
    expect(cache.get('a')).toBe('A');
    // The next swap drops the old generation, which still holds `b`.
    cache.set('d', 'D');

    expect(cache.get('a')).toBe('A');
    expect(cache.get('b')).toBeUndefined();
    expect(cache.size()).toBeLessThanOrEqual(4);
  });

  it('never holds more than twice its limit', () => {
    const cache = createGenerationalCache<number>(8);
    for (let i = 0; i < 1000; i++) {
      cache.set(`k${String(i)}`, i);
      cache.get(`k${String(i - 3)}`);
    }

    expect(cache.size()).toBeLessThanOrEqual(16);
  });

  /** Reads a rotation as a cache's caller does — a miss computes and sets — and says how many were hits. */
  const rotate = (cache: ReturnType<typeof createGenerationalCache<string>>, keys: string[], reads: number): number => {
    let hits = 0;
    for (let read = 0; read < reads; read++) {
      const key = keys[read % keys.length];
      if (cache.get(key) === undefined) {
        cache.set(key, key);
      } else {
        hits++;
      }
    }

    return hits;
  };
  // Past the two generations of 600 it answers from, within the three it tells a rotation by, and coming round after
  // more misses than it remembers while it rests: a rotation as the benchmark's (10,000 over 4,096).
  const ROTATION = Array.from({ length: 1600 }, (_, index) => `r${String(index)}`);

  it('stops taking new entries while the reads cycle over more than it holds, and keeps its share of them', () => {
    const cache = createGenerationalCache<string>(600);
    rotate(cache, ROTATION, 16_000);

    // Swapping in this rotation would hit nothing; kept as they are, the two generations hold 1,200 of its 1,600.
    expect(rotate(cache, ROTATION, 1600)).toBeGreaterThanOrEqual(600);
    expect(cache.size()).toBeLessThanOrEqual(1200);
  });

  // What a builder does that is no rotation: pages of paths, each read a few times, never come back to. A rest it takes
  // for one is ended by the first path read again, and the page's paths are hit from then on.
  it('keeps hitting a set in use that moves', () => {
    const cache = createGenerationalCache<string>(100);
    let hits = 0;
    for (let page = 0; page < 20; page++) {
      const paths = Array.from({ length: 60 }, (_, index) => `p${String(page)}.${String(index)}`);
      hits += rotate(cache, paths, 60 * 5);
    }

    // Four of each path's five reads could hit at most; a rest ended by a page costs that page a read of each.
    expect(hits).toBeGreaterThan(0.7 * 20 * 60 * 4);
  });

  /** Read the rotation until it rests. */
  const resting = () => {
    const cache = createGenerationalCache<string>(600);
    // Two whole rounds: each read of `rotate` starts the rotation again, so it reads whole ones.
    rotate(cache, ROTATION, 2 * ROTATION.length);

    expect(cache.resting()).toBe(true);

    return cache;
  };

  it('takes nothing new while it rests', () => {
    const cache = resting();
    cache.set('once', 'O');

    expect(cache.get('once')).toBeUndefined();
    expect(cache.resting()).toBe(true);
  });

  // What a rotation is followed by: a few paths read over and over. Resting, they missed on every read.
  it('takes a key missed twice while it rests, and ends the rest', () => {
    const cache = resting();
    cache.set('hot', 'H');

    expect(cache.get('hot')).toBeUndefined();
    cache.set('hot', 'H');
    expect(cache.get('hot')).toBe('H');
    expect(cache.resting()).toBe(false);
    cache.set('next', 'N');
    expect(cache.get('next')).toBe('N');
  });

  it('rests again when, rested, the reads still cycle', () => {
    const cache = resting();
    let rested = false;
    for (let round = 0; round < 50 && cache.resting(); round++) {
      rotate(cache, ROTATION, ROTATION.length);
    }

    for (let round = 0; round < 50 && !rested; round++) {
      rotate(cache, ROTATION, ROTATION.length);
      rested = cache.resting();
    }

    expect(rested).toBe(true);
  });
});

/**
 * The 1.5.0 regressions, at the size the store's caches have (4,096): what the benchmark gate caught on CI and what a
 * builder does. Each failed on 1.5.0's cache.
 */
describe('createGenerationalCache, at the store’s size', () => {
  const LIMIT = 4096;

  /** Reads `keys` in order as the store does — a miss computes and sets — and says how many were hits. */
  const read = (cache: ReturnType<typeof createGenerationalCache<string>>, keys: readonly string[]): number => {
    let hits = 0;
    for (const key of keys) {
      if (cache.get(key) === undefined) {
        cache.set(key, key);
      } else {
        hits++;
      }
    }

    return hits;
  };
  const many = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, index) => `${prefix}${String(index)}`);

  // CI, 1.5.0: two cases' warm-ups read 14,000 paths, the cache rested, and `nested` and `deepMap` — a few paths written
  // thousands of times — missed on every read: 20% and 69% slower than 1.4.0.
  it('caches the few paths read after thousands read once', () => {
    const cache = createGenerationalCache<string>(LIMIT);
    read(cache, many('page.', 8000));
    read(cache, many('rotation.', 10_000));
    const hot = many('a.b.c.d.e.leaf', 10);
    const reads = Array.from({ length: 3000 }, (_, index) => hot[index % hot.length]);

    expect(read(cache, reads)).toBeGreaterThanOrEqual(reads.length - 2 * hot.length);
  });

  it('caches them after a rotation it rests for, too', () => {
    const cache = createGenerationalCache<string>(LIMIT);
    const rotation = many('rotation.', 10_000);
    for (let round = 0; round < 5; round++) {
      read(cache, rotation);
    }

    expect(cache.resting()).toBe(true);
    const hot = many('hot.', 10);
    const reads = Array.from({ length: 3000 }, (_, index) => hot[index % hot.length]);

    expect(read(cache, reads)).toBeGreaterThanOrEqual(reads.length - 2 * hot.length);
    expect(cache.resting()).toBe(false);
  });

  // A builder moving through pages of a thousand elements, each read a few times, never coming back.
  it('hits the re-reads of pages moved through', () => {
    const cache = createGenerationalCache<string>(LIMIT);
    let hits = 0;
    for (let page = 0; page < 20; page++) {
      const paths = many(`p${String(page)}.e`, 1000);
      for (let pass = 0; pass < 5; pass++) {
        hits += read(cache, paths);
      }
    }

    expect(hits).toBeGreaterThan(0.9 * 20 * 1000 * 4);
  });

  // 10,000 paths in rotation over two generations of 4,096: swapping would hit none, 1.4.0 hit its first 4,096.
  it('keeps hitting a share of a rotation it cannot hold', () => {
    const cache = createGenerationalCache<string>(LIMIT);
    const rotation = many('rotation.', 10_000);
    for (let round = 0; round < 3; round++) {
      read(cache, rotation);
    }

    expect(read(cache, rotation)).toBeGreaterThanOrEqual(LIMIT);
  });
});
