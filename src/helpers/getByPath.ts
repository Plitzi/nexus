/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters */

import parsePath from './parsePath';

import type { PathOf, PathValue } from '../types';

/**
 * One cached accessor closure per dotted path, so the split + loop happens once instead of on every read.
 *
 * Bounded, and once full it keeps what it has rather than evicting: a page reads its elements' paths in the same order
 * on every render, and a first-in-first-out cache smaller than that set evicted each path just before it was read
 * again — every read a miss plus the churn of evicting, measured slower than no cache at all. Past the bound a path is
 * resolved without being cached; 4096 holds a page of well over a thousand elements.
 */
const cached = new Map<string, (obj: unknown) => unknown>();
const MAX_CACHED = 4096;

const makeAccessor = (keys: readonly string[]): ((obj: unknown) => unknown) => {
  if (keys.length === 1) {
    const key = keys[0];

    return obj =>
      typeof obj === 'object' && obj !== null && key in obj ? (obj as Record<string, unknown>)[key] : undefined;
  }

  return obj => {
    let current: unknown = obj;

    for (let i = 0; i < keys.length; i++) {
      if (current == null || typeof current !== 'object') {
        return undefined;
      }

      current = (current as Record<string, unknown>)[keys[i]];
    }

    return current;
  };
};

const getAccessor = (path: string): ((obj: unknown) => unknown) => {
  let fn = cached.get(path);

  if (!fn) {
    fn = makeAccessor(parsePath(path));
    if (cached.size < MAX_CACHED) {
      cached.set(path, fn);
    }
  }

  return fn;
};

function getByPath<TState, P extends '' | undefined | []>(obj: TState, path: P): TState | undefined;

function getByPath<TState, P extends PathOf<TState> | PathOf<TState>[]>(
  obj: TState,
  path: P
): PathValue<TState, P> | undefined;

function getByPath<TState, P extends PathOf<TState> | PathOf<TState>[] | '' | undefined>(obj: TState, path: P) {
  const isArray = Array.isArray(path);
  if ((typeof path !== 'string' && !isArray) || (isArray && !path.length) || (typeof path === 'string' && !path)) {
    return obj as PathValue<TState, P>;
  }

  // Single segment (the common case): read one key, no split, no array allocation.
  if (typeof path === 'string' && path.indexOf('.') === -1) {
    return typeof obj === 'object' && obj !== null && path in obj ? (obj as Record<string, unknown>)[path] : undefined;
  }

  if (typeof path === 'string') {
    return getAccessor(path)(obj);
  }

  let current: unknown = obj;
  for (const key of path) {
    if (typeof current !== 'object' || current === null || !(key in current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

export default getByPath;
