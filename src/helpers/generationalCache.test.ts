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

  it('stops taking new entries while the reads cycle over more than it holds, and keeps its share of them', () => {
    const limit = 4;
    const cache = createGenerationalCache<string>(limit);
    const rotation = Array.from({ length: 10 }, (_, index) => `k${String(index)}`);
    const read = (key: string): boolean => {
      if (cache.get(key) !== undefined) {
        return true;
      }

      cache.set(key, key);

      return false;
    };
    for (let round = 0; round < 3; round++) {
      rotation.forEach(read);
    }

    const hits = rotation.filter(read).length;

    // Swapping in a rotation of 10 over generations of 4 would hit nothing; kept as they are, the two hold most of it.
    expect(hits).toBeGreaterThanOrEqual(limit);
    expect(cache.size()).toBeLessThanOrEqual(2 * limit);
  });

  /** Two generations of 2 full — `a b` old, `c d` young — with nothing read again: the next miss starts a rest. */
  const resting = (limit: number) => {
    const cache = createGenerationalCache<string>(limit);
    ['a', 'b', 'c', 'd'].forEach(key => cache.set(key, key));
    cache.set('found-it', 'x');

    return cache;
  };
  const restFor = (cache: ReturnType<typeof resting>, misses: number) => {
    for (let miss = 0; miss < misses; miss++) {
      cache.set(`miss${String(miss)}`, 'x');
    }
  };

  it('takes nothing new while it rests, four times its limit of misses', () => {
    const cache = resting(2);
    restFor(cache, 7);
    cache.set('late', 'L');

    expect(cache.get('found-it')).toBeUndefined();
    expect(cache.get('late')).toBeUndefined();
  });

  it('takes new entries again once it has rested, when what it kept was read again meanwhile', () => {
    const cache = resting(2);
    expect(cache.get('a')).toBe('a');
    restFor(cache, 8);
    cache.set('back', 'B');

    expect(cache.get('back')).toBe('B');
  });

  it('rests again when, rested, the reads still cycle', () => {
    const cache = resting(2);
    restFor(cache, 8);
    cache.set('still', 'S');

    expect(cache.get('still')).toBeUndefined();
  });
});
