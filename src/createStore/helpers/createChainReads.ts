import { deepMerge, isPlainObject } from './deepMerge';
import getByPath from '../../helpers/getByPath';

import type { GetState, PathOf, PathValue, StoreApi } from '../../types';

export type GetPath<TState extends object> = <P extends PathOf<TState>>(path: P) => PathValue<TState, P> | undefined;

// The two chain-aware reads of a scoped store, behind one cache:
//   - `getState` deep-merges own state over the parent's merged state (the full scoped view).
//   - `getPath` resolves a single path without materializing that merge — straight to the owner.
// Both are O(depth) the first time (they walk the parent chain) and both are memoized so repeats are O(1). They
// share one invalidation substrate: the store calls `invalidate()` from the change events it already emits (own
// commit, forwarded ancestor change, silent ancestor change), and both caches drop together. The cache is always
// used to ensure referential stability for `useSyncExternalStore` which calls `getSnapshot()` multiple times per render.
export type ChainReads<TState extends object> = {
  getState: GetState<TState>;
  getPath: GetPath<TState>;
  invalidate: () => void;
  resetCache: () => void;
  getMergeCount: () => number;
};

export function createChainReads<TState extends object>(
  getOwnState: () => TState,
  getOwnSnapshot: () => TState,
  parent: StoreApi<TState> | undefined,
  // Top-level keys this scope owns EXCLUSIVELY: when present in own state they fully shadow the parent (no
  // deep-merge, no fall-through into them), so a per-instance slice like an element's `state` stays isolated from an
  // ancestor scope that happens to use the same key. Keys the scope does not seed are unaffected (still inherited).
  exclusive?: ReadonlyArray<string>
): ChainReads<TState> {
  if (!parent) {
    // A root store is its own state — no merge, no fall-through, nothing to invalidate.
    return {
      getState: getOwnSnapshot,
      getPath: path => getByPath(getOwnState(), path),
      invalidate: () => {},
      resetCache: () => {},
      getMergeCount: () => 0
    };
  }

  const parentStore = parent;
  const exclusiveKeys = exclusive && exclusive.length > 0 ? new Set(exclusive) : undefined;

  let stateDirty = true;
  let pathDirty = false;
  let merged: TState | undefined;
  let mergeCount = 0;
  const pathCache = new Map<string, unknown>();
  // The last merge at each path, with the two values it was made from. Unlike `pathCache` it survives `invalidate`:
  // an ancestor commit anywhere dirties every cached read, and without this a merged path came back as a NEW object
  // with the same content, which every `useSyncExternalStore` reading it takes for a change.
  const mergedByPath = new Map<string, { own: unknown; parent: unknown; value: unknown }>();

  const mergeNow = (): TState => {
    mergeCount++;

    const own = getOwnSnapshot();
    const next = deepMerge(parentStore.getState(), own) as TState;
    if (exclusiveKeys) {
      // Overwrite the merged value for each exclusively-owned key the scope actually holds, so the full-state view
      // matches the per-path `resolve` below (own shadows, no merge).
      for (const key of exclusiveKeys) {
        if ((own as Record<string, unknown>)[key] !== undefined) {
          (next as Record<string, unknown>)[key] = (own as Record<string, unknown>)[key];
        }
      }
    }

    return next;
  };

  const getState: GetState<TState> = () => {
    if (stateDirty || merged === undefined) {
      merged = mergeNow();
      stateDirty = false;
    }

    return merged;
  };

  const resolve = <P extends PathOf<TState>>(path: P): PathValue<TState, P> | undefined => {
    if (exclusiveKeys) {
      const dot = path.indexOf('.');
      const rootKey = dot === -1 ? path : path.slice(0, dot);
      // The scope owns this key exclusively and actually holds it: resolve within own state only — never merge with
      // or fall through to the parent, even when the deeper path is absent.
      if (exclusiveKeys.has(rootKey) && (getOwnState() as Record<string, unknown>)[rootKey] !== undefined) {
        return getByPath(getOwnState(), path);
      }
    }

    const ownValue = getByPath(getOwnState(), path);
    if (ownValue === undefined) {
      return parentStore.getPath(path);
    }

    const parentValue = parentStore.getPath(path);
    if (parentValue === undefined || !isPlainObject(ownValue) || !isPlainObject(parentValue)) {
      return ownValue;
    }

    // Both sides contribute an object at this path: merge just this subtree, and hand back the previous merge for as
    // long as neither side has changed — the two reads are themselves stable, so their identity is the whole answer.
    const previous = mergedByPath.get(path);
    if (previous && previous.own === ownValue && previous.parent === parentValue) {
      return previous.value as PathValue<TState, P>;
    }

    mergeCount++;
    const value = deepMerge(parentValue, ownValue) as PathValue<TState, P>;
    mergedByPath.set(path, { own: ownValue, parent: parentValue, value });

    return value;
  };

  const getPath: GetPath<TState> = <P extends PathOf<TState>>(path: P): PathValue<TState, P> | undefined => {
    if (pathDirty) {
      pathCache.clear();
      pathDirty = false;
    } else if (pathCache.has(path)) {
      return pathCache.get(path) as PathValue<TState, P> | undefined;
    }

    const result = resolve(path);
    pathCache.set(path, result);

    return result;
  };

  return {
    getState,
    getPath,
    invalidate: () => {
      stateDirty = true;
      pathDirty = true;
    },
    resetCache: () => {
      pathCache.clear();
      mergedByPath.clear();
      merged = undefined;
      stateDirty = true;
      pathDirty = false;
    },
    getMergeCount: () => mergeCount
  };
}
