import { useCallback, useRef, useSyncExternalStore } from 'react';

import { useResolvedStore } from './shared';

import type { PathFreshness, PathOf, StoreHookBaseOptions } from '../../types';

export type FreshnessState = {
  isStale: boolean;
  updatedAt: number | undefined;
  expiresAt: number | undefined;
};

export type UseFreshnessOptions<TState extends object = object> = StoreHookBaseOptions<TState> & {
  enabled?: boolean;
};

const read = (freshness: PathFreshness | undefined): FreshnessState => ({
  isStale: !freshness || Date.now() >= freshness.expiresAt,
  updatedAt: freshness?.updatedAt,
  expiresAt: freshness?.expiresAt
});

const same = (a: FreshnessState, b: FreshnessState): boolean =>
  a.isStale === b.isStale && a.updatedAt === b.updatedAt && a.expiresAt === b.expiresAt;

// Whether a path is still current by the `ttl` it was written with — re-rendering when it is written, expired, or
// simply runs out, which the store announces on a timer for as long as this is mounted. A path nobody wrote with a
// `ttl` reads as stale.
function useFreshness<TState extends object>(
  path: PathOf<TState>,
  options: UseFreshnessOptions<TState> = {}
): FreshnessState {
  const { enabled = true } = options;
  const store = useResolvedStore(options.store, 'useFreshness', options.storeId);
  const lastRef = useRef<FreshnessState | undefined>(undefined);

  const subscribe = useCallback(
    (onChange: () => void) => (enabled ? store.watchFreshness(path, onChange) : () => {}),
    [store, path, enabled]
  );

  // A new object only when something about the answer changed, so `useSyncExternalStore` sees a stable snapshot.
  const getSnapshot = useCallback(() => {
    const next = read(store.getFreshness(path));
    if (lastRef.current && same(lastRef.current, next)) {
      return lastRef.current;
    }

    lastRef.current = next;

    return next;
  }, [store, path]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export default useFreshness;
