import { createGenerationalCache } from './generationalCache';

// Memoizes `path.split('.')` (a single setState parses the same path several times). Bounded so dynamic per-id paths
// can't grow it without limit, and forgetting what is no longer read (`createGenerationalCache`). Callers treat the
// returned array as read-only.
const cache = createGenerationalCache<string[]>(4096);

const parsePath = (path: string): string[] => {
  let segments = cache.get(path);
  if (segments === undefined) {
    segments = path.split('.');
    cache.set(path, segments);
  }

  return segments;
};

export default parsePath;
