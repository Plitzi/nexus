import { useEffect, useRef } from 'react';

import { useResolvedStore } from './shared';

import type { UseFreshnessOptions } from './useFreshness';
import type { FreshnessEvent, PathOf } from '../../types';

// Calls `callback` whenever the path — or anything it covers, or anything covering it — stops being current: by
// `expire` (`event.type === 'expired'`, somebody said the data changed) or because its `ttl` ran out (`'elapsed'`).
// The latest callback is the one called, so it may close over whatever the component rendered with.
function useOnStale<TState extends object>(
  path: PathOf<TState>,
  callback: (event: FreshnessEvent) => void,
  options: UseFreshnessOptions<TState> = {}
): void {
  const { enabled = true } = options;
  const store = useResolvedStore(options.store, 'useOnStale', options.storeId);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    return store.watchFreshness(path, event => {
      if (event.type === 'expired' || event.type === 'elapsed') {
        callbackRef.current(event);
      }
    });
  }, [store, path, enabled]);
}

export default useOnStale;
