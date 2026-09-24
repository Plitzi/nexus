/* eslint-disable @typescript-eslint/no-explicit-any */

import { useMemo, useRef } from 'react';

import { useResolvedStore } from './shared';
import getByPath from '../../helpers/getByPath';

import type {
  GetterTuple,
  GetValueFromBaseFn,
  GetValueFn,
  PathOf,
  PathValue,
  UseStoreGetterOptions
} from '../../types';

export type { GetValueFn, GetValueFromBaseFn, GetterTuple, UseStoreGetterOptions };

function useStoreGetter<TState extends object>(options?: UseStoreGetterOptions<TState>): GetValueFn<TState>;

function useStoreGetter<TState extends object, P extends PathOf<TState>>(
  basePath: P,
  options?: UseStoreGetterOptions<TState>
): GetValueFromBaseFn<PathValue<TState, P>>;

function useStoreGetter<
  TState extends object,
  const Entries extends ReadonlyArray<PathOf<TState> | ((state: TState) => unknown)>
>(entries: Entries, options?: UseStoreGetterOptions<TState>): GetterTuple<TState, Entries>;

function useStoreGetter<TState extends object>(
  arg?: string | readonly (string | ((state: TState) => unknown))[] | UseStoreGetterOptions<TState>,
  options?: UseStoreGetterOptions<TState>
): any {
  const resolvedBasePath = typeof arg === 'string' ? arg : undefined;
  const resolvedEntries = Array.isArray(arg) ? (arg as readonly (string | ((state: TState) => unknown))[]) : undefined;
  const resolvedOptions: UseStoreGetterOptions<TState> | undefined =
    typeof arg === 'object' && !Array.isArray(arg) ? (arg as UseStoreGetterOptions<TState>) : options;

  const store = useResolvedStore(resolvedOptions?.store, 'useStoreGetter', resolvedOptions?.storeId);
  /**
   * The entries are read at call time, from the latest render, and the getters are keyed on the PATHS alone — a
   * function counts by its position. Keyed on a function's source instead, two closures with the same text were the
   * same entry: `[state => state.items[id]]` went on reading the first render's `id` after it changed. And every
   * render stringified every function to find that out.
   */
  const entriesRef = useRef(resolvedEntries);
  entriesRef.current = resolvedEntries;
  const entriesKey = resolvedEntries?.map((e, i) => (typeof e === 'function' ? `fn_${i}` : e)).join('|');

  return useMemo(
    () => {
      if (resolvedEntries) {
        return resolvedEntries.map((_, index) => (subPath?: string, callDefault?: unknown): any => {
          const entry = (entriesRef.current ?? resolvedEntries)[index];
          const base =
            typeof entry === 'function'
              ? entry(store.getState())
              : getByPath(store.getState(), entry as PathOf<TState>);

          if (subPath !== undefined) {
            const subVal = getByPath(base as TState, subPath as PathOf<TState>);

            return subVal === undefined && callDefault !== undefined ? callDefault : subVal;
          }

          return base === undefined && callDefault !== undefined ? callDefault : base;
        });
      }

      if (resolvedBasePath !== undefined) {
        const bound = store.withBase(resolvedBasePath as PathOf<TState>) as {
          getState: (defaultValue?: unknown) => unknown;
          getPath: (subPath: string, defaultValue?: unknown) => unknown;
        };

        return (subPath?: string, callDefault?: unknown): any => {
          if (subPath !== undefined) {
            return callDefault !== undefined ? bound.getPath(subPath, callDefault) : bound.getPath(subPath);
          }

          return callDefault !== undefined ? bound.getState(callDefault) : bound.getState();
        };
      }

      return (subPath?: string, callDefault?: unknown): any => {
        const state = store.getState();

        if (subPath !== undefined) {
          const val = getByPath(state, subPath as PathOf<TState>);

          return val === undefined && callDefault !== undefined ? callDefault : val;
        }

        return state;
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, resolvedBasePath, entriesKey]
  );
}

export default useStoreGetter;
