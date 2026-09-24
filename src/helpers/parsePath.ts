// Memoizes `path.split('.')` (a single setState parses the same path several times). Bounded so dynamic per-id paths
// can't grow it without limit, and once full it keeps what it has — see `getByPath` for why evicting was worse than no
// cache. Callers treat the returned array as read-only.
const cache = new Map<string, string[]>();
const MAX_ENTRIES = 4096;

const parsePath = (path: string): string[] => {
  let segments = cache.get(path);
  if (segments === undefined) {
    segments = path.split('.');
    if (cache.size < MAX_ENTRIES) {
      cache.set(path, segments);
    }
  }

  return segments;
};

export default parsePath;
