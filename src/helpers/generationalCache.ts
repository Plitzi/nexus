/**
 * A bounded cache that forgets what is no longer used, with a hit at one `Map.get`.
 *
 * Two generations: reads hit the young map; a miss looks in the old one and moves what it finds back to the young; when
 * the young one is full, the old is dropped and the young becomes it. What was read since the last swap survives it, and
 * a path not read for two swaps is gone. It holds between `limit` and twice it.
 *
 * Its predecessors kept their first entries for ever (`parsePath`, `getByPath`) or dropped the oldest written
 * (`writeByPath`): a builder moving between pages of thousands of elements parsed every path of every page after the
 * first few on every read. An LRU would rewrite its map on every hit.
 *
 * Read in rotation over more than it holds, swapping would keep no hit at all — each path gone a moment before it comes
 * round again. So a generation that filled with nothing of the one before read again stops it taking new entries for a
 * while: the two it holds stay as they are, and their share of the rotation is hit. A key missed twice while it rests
 * is read again — a hot set after the rotation, or a set in use that moved (a builder on another page), which looks
 * like one as it fills — and ends the rest: in a rotation a key comes back only after more misses than it remembers.
 */
export const createGenerationalCache = <V>(limit: number) => {
  let young = new Map<string, V>();
  let old = new Map<string, V>();
  /** Entries read again from the old generation since the last swap. */
  let promoted = 0;
  /** Misses left before it takes new entries again, once it found the reads cycling over more than it holds. */
  let resting = 0;
  /**
   * What missed while it rests, a few at a time: a key missed twice is read again — a hot set after the rotation, which
   * resting would leave missing on every read. In a rotation a key comes round only after more than the cache holds.
   */
  const missedResting = new Set<string>();
  // An eighth of what a generation holds: a rotation's key comes back after more misses than that while it rests.
  const doorkeeper = Math.max(1, Math.floor(limit / 8));

  const swap = (): void => {
    old = young;
    young = new Map<string, V>();
    promoted = 0;
  };

  const set = (key: string, value: V): void => {
    if (resting > 0) {
      if (!missedResting.has(key)) {
        resting--;
        if (missedResting.size >= doorkeeper) {
          missedResting.clear();
        }

        missedResting.add(key);
        if (resting === 0) {
          missedResting.clear();
        }

        return;
      }

      // Missed twice while it rests: the reads no longer only cycle, and the young generation starts again with it.
      resting = 0;
      missedResting.clear();
      swap();
      young.set(key, value);

      return;
    }

    if (young.size >= limit) {
      // A whole generation went by with nothing of the one before read again, and both are full: the reads may cycle over
      // more than the two hold, where swapping keeps no hit at all and the two kept as they are keep their share. It
      // takes nothing new for a while — a key read again ends that — then looks again.
      if (promoted === 0 && old.size >= limit) {
        resting = limit * 4;

        return;
      }

      swap();
    }

    young.set(key, value);
  };

  return {
    get: (key: string): V | undefined => {
      const hit = young.get(key);
      if (hit !== undefined) {
        return hit;
      }

      const kept = old.get(key);
      if (kept !== undefined) {
        promoted++;
        // Resting, it stays where it is: a read of what the cache holds is no miss to count the rest by.
        if (resting === 0) {
          set(key, kept);
        }
      }

      return kept;
    },
    set,
    /** How many entries it answers from, both generations — for its tests. */
    size: (): number => young.size + old.size,
    /** Whether it is taking nothing new, having found the reads cycling — for its tests. */
    resting: (): boolean => resting > 0
  };
};
