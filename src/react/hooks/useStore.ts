/* eslint-disable @typescript-eslint/no-explicit-any */

import { useMemo, useRef, useSyncExternalStore } from 'react';

import { defaultMultiEqualityFn, useResolvedStore } from './shared';
import getByPath from '../../helpers/getByPath';
import shallowEqual from '../../helpers/shallowEqual';

import type {
  FullStateSetter,
  MultiPathReturn,
  PathOf,
  PathOrFn,
  PathOrFnSetters,
  PathOrFnValues,
  PathSetter,
  PathSetters,
  PathValue,
  PathValues,
  SetStateOptions,
  StoreApi,
  UseStoreMultiOptions,
  UseStoreOptions,
  UseStoreReturn
} from '../../types';

export { defaultMultiEqualityFn } from './shared';
export type { MultiPathReturn, UseStoreOptions, UseStoreMultiOptions, UseStoreReturn };

/** A snapshot not taken yet — distinct from every value a store can hold, `undefined` included. */
const UNSET: unique symbol = Symbol('unset');

type Selector<TState extends object> =
  PathOf<TState> | ReadonlyArray<PathOrFn<TState>> | ((state: TState) => PathOf<TState>) | undefined;

// `Array.isArray` does not narrow a union holding a readonly array; this does.
const isPathList = <TState extends object>(arg: Selector<TState>): arg is ReadonlyArray<PathOrFn<TState>> =>
  Array.isArray(arg);

/** What identifies a selection for memoization: the path or function itself, or for a list what it holds. */
const selectionKey = <TState extends object>(arg: Selector<TState>): unknown =>
  isPathList(arg) ? `[${arg.map((p, i) => (typeof p === 'function' ? `fn_${i}` : p)).join('|')}]` : arg;

const readOne = <TState extends object>(
  store: StoreApi<TState>,
  pathOrFn: PathOf<TState> | ((state: TState) => PathOf<TState>) | undefined
): unknown => {
  if (typeof pathOrFn === 'string') {
    return store.getPath(pathOrFn);
  }

  if (typeof pathOrFn === 'function') {
    const state = store.getState();

    return getByPath(state, pathOrFn(state));
  }

  return store.getState();
};

const readMany = <TState extends object>(
  store: StoreApi<TState>,
  paths: ReadonlyArray<PathOrFn<TState>>
): unknown[] => {
  const state = paths.some(p => typeof p === 'function') ? store.getState() : undefined;

  return paths.map(p => (typeof p === 'function' ? getByPath(state, p(state as TState)) : store.getPath(p)));
};

const writeOne = <TState extends object>(
  store: StoreApi<TState>,
  pathOrFn: PathOrFn<TState> | undefined,
  value: unknown,
  setOptions?: SetStateOptions
): void => {
  if (pathOrFn === undefined) {
    store.setState(undefined, value as TState, setOptions);
  } else if (typeof pathOrFn === 'function') {
    store.setState(pathOrFn(store.getState()), value as PathValue<TState, PathOf<TState>>, setOptions);
  } else {
    store.setState(pathOrFn, value as PathValue<TState, PathOf<TState>>, setOptions);
  }
};

function useStore<TState extends object>(
  arg?: undefined,
  options?: UseStoreOptions<TState>
): [TState, FullStateSetter<TState>];

function useStore<TState extends object, P extends PathOf<TState>>(
  path: P,
  options?: UseStoreOptions<PathValue<TState, P>> & { transformer?: never }
): [PathValue<TState, P>, PathSetter<TState, P>];

function useStore<TState extends object, P extends PathOf<TState>, TResult>(
  path: P,
  options: UseStoreOptions<PathValue<TState, P>> & {
    transformer: (value: PathValue<TState, P>) => TResult;
  }
): [TResult, PathSetter<TState, P>];

function useStore<TState extends object, P extends PathOf<TState>>(
  pathFn: (state: TState) => P,
  options?: UseStoreOptions<PathValue<TState, P>, TState> & {
    transformer?: never;
  }
): [PathValue<TState, P>, PathSetter<TState, P>];

function useStore<TState extends object, P extends PathOf<TState>, TResult>(
  pathFn: (state: TState) => P,
  options: UseStoreOptions<PathValue<TState, P>, TState> & {
    transformer: (value: PathValue<TState, P>) => TResult;
  }
): [TResult, PathSetter<TState, P>];

function useStore<TState extends object, const Paths extends ReadonlyArray<PathOf<TState>>>(
  paths: Paths,
  options?: Omit<UseStoreMultiOptions<TState, Paths>, 'transformer'>
): MultiPathReturn<TState, Paths>;

function useStore<TState extends object, const Paths extends ReadonlyArray<PathOf<TState>>, TResult>(
  paths: Paths,
  options: UseStoreMultiOptions<TState, Paths> & {
    transformer: (values: PathValues<TState, Paths>) => TResult;
  }
): [TResult, ...PathSetters<TState, Paths>];

function useStore<TState extends object, const Entries extends ReadonlyArray<PathOrFn<TState>>>(
  paths: Entries,
  options?: Omit<UseStoreMultiOptions<TState, any>, 'transformer'> & {
    transformer?: never;
  }
): [PathOrFnValues<TState, Entries>, ...PathOrFnSetters<TState, Entries>];

function useStore<TState extends object, const Entries extends ReadonlyArray<PathOrFn<TState>>, TResult>(
  paths: Entries,
  options: Omit<UseStoreMultiOptions<TState, any>, 'transformer'> & {
    transformer: (values: PathOrFnValues<TState, Entries>) => TResult;
  }
): [TResult, ...PathOrFnSetters<TState, Entries>];

function useStore<TState extends object>(
  arg?: PathOf<TState> | ReadonlyArray<PathOrFn<TState>> | ((state: TState) => PathOf<TState>),
  options: UseStoreOptions<any, any> = {}
): unknown {
  const store = useResolvedStore(options.store, 'useStore', options.storeId);
  const isMulti = isPathList(arg);
  const mode = options.mode ?? 'sync';
  const enabled = options.enabled ?? true;
  const equalityFn =
    (options.equalityFn as ((a: unknown, b: unknown) => boolean) | undefined) ??
    (isMulti
      ? (defaultMultiEqualityFn as (a: unknown, b: unknown) => boolean)
      : arg === undefined
        ? shallowEqual
        : Object.is);

  /**
   * One set of hooks for a single path and a list of paths alike, so a call site may switch between the two without
   * changing the hooks it runs. It used to run a single-path and a multi-path hook side by side on every call, the
   * idle one disabled — twice the hooks and a copied options object on every render of every component that reads a
   * store, which was a quarter of what rendering a page allocated.
   */
  const transformerRef = useRef(options.transformer as ((value: unknown) => unknown) | undefined);
  transformerRef.current = options.transformer as ((value: unknown) => unknown) | undefined;
  const argRef = useRef(arg);
  argRef.current = arg;
  const lastRef = useRef<unknown>(UNSET);
  const shapeRef = useRef(isMulti);
  if (shapeRef.current !== isMulti) {
    // A value of the other shape must never be handed back as this one's, however equal the two look.
    shapeRef.current = isMulti;
    lastRef.current = UNSET;
  }

  // The memos below read the selection through `argRef` and are keyed on what it holds, so a list rebuilt with the
  // same paths on every render does not rebuild them. `key` is the dependency the linter cannot see through the ref.
  const key = selectionKey(arg);

  const getSnapshot = useMemo(
    () => (): unknown => {
      const current = argRef.current;
      if (!enabled && lastRef.current !== UNSET) {
        return lastRef.current;
      }

      const next = isPathList(current) ? readMany(store, current) : readOne(store, current);
      // `mount` reads once and follows nothing, so a single value is not held; a list still is, to stay one array.
      if (lastRef.current !== UNSET && (mode !== 'mount' || isPathList(current)) && equalityFn(lastRef.current, next)) {
        return lastRef.current;
      }

      lastRef.current = next;

      return next;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, key, enabled, mode, equalityFn]
  );

  const subscribe = useMemo(
    () =>
      (cb: () => void): (() => void) => {
        const current = argRef.current;
        if (!enabled || mode === 'mount') {
          return () => {};
        }

        if (typeof current === 'string') {
          return store.subscribePath(current, cb);
        }

        if (!isPathList(current) || current.some(p => typeof p === 'function')) {
          return store.subscribe(cb);
        }

        const unsubscribes = current.map(p => store.subscribePath(p as PathOf<TState>, cb));

        return () => unsubscribes.forEach(unsubscribe => unsubscribe());
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, key, enabled, mode]
  );

  const raw = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const result = useMemo(() => (transformerRef.current ? transformerRef.current(raw) : raw), [raw]);

  const setters = useMemo(() => {
    const current = argRef.current;
    if (!isPathList(current)) {
      return [
        (value: unknown, setOptions?: SetStateOptions) =>
          writeOne(store, argRef.current as PathOrFn<TState> | undefined, value, setOptions)
      ];
    }

    return current.map((_, index) => (value: unknown, setOptions?: SetStateOptions) => {
      const paths = argRef.current as ReadonlyArray<PathOrFn<TState>>;
      writeOne(store, paths[index], value, setOptions);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, key]);

  return [result, ...setters];
}

export type { PathSetters, PathValues };

export default useStore;
