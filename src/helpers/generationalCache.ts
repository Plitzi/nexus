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
 * while: the two it holds stay as they are, and their share of the rotation is hit.
 */
export const createGenerationalCache = <V>(limit: number) => {
  let young = new Map<string, V>();
  let old = new Map<string, V>();
  /** Entries read again from the old generation since the last swap: none, a whole generation long, is a rotation. */
  let promoted = 0;
  /** Misses left before it takes new entries again, once it found the reads cycling over more than it holds. */
  let resting = 0;

  const set = (key: string, value: V): void => {
    if (resting > 0) {
      resting--;

      return;
    }

    if (young.size >= limit) {
      // A whole generation went by with nothing of the one before read again, and both are full: the reads cycle over
      // more than the two hold, where swapping keeps no hit at all and the two kept as they are keep their share. It
      // takes nothing new for a while, then looks again.
      if (promoted === 0 && old.size >= limit) {
        resting = limit * 4;

        return;
      }

      old = young;
      young = new Map<string, V>();
      promoted = 0;
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
    /** How many entries it holds, both generations — for its tests. */
    size: (): number => young.size + old.size
  };
};
