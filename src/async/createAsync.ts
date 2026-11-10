import { createObservable } from '../helpers/createObservable';

import type { PathOf, PathValue, StoreApi } from '../types';

export type AsyncStatus = 'idle' | 'pending' | 'success' | 'error';

export type AsyncSnapshot<T> = {
  status: AsyncStatus;
  data: T | undefined;
  error: unknown;
  isLoading: boolean;
};

export type AsyncResource<T, Args extends readonly unknown[]> = {
  // Current status plus the resolved value (read live from the store path). Stable reference between changes so it
  // can back `useSyncExternalStore` directly.
  get: () => AsyncSnapshot<T>;
  // Runs the fetcher and writes its result to the store path on success. The latest call wins: an earlier in-flight
  // request that resolves after a newer one is ignored.
  run: (...args: Args) => Promise<T>;
  subscribe: (listener: () => void) => () => void;
  // The promise to throw for Suspense while pending — it settles (never rejects) when the fetch does, so React just
  // retries the render. `undefined` once settled or before the first run.
  suspend: () => Promise<void> | undefined;
  destroy: () => void;
};

export type AsyncOptions<Args extends readonly unknown[]> = {
  // Fire `run(...immediate)` as soon as the resource is created — the usual setup for Suspense, so a component that
  // reads it suspends on the in-flight request instead of seeing an idle resource.
  immediate?: Args;
  // Hand the fetcher an `AbortSignal`, first, aborted when a newer `run` supersedes its call or the resource is
  // destroyed: the superseded request can be cut (`fetch(url, { signal })`), not only its answer ignored. Off, no
  // controller is made.
  abortable?: false;
};

export type AbortableAsyncOptions<Args extends readonly unknown[]> = Omit<AsyncOptions<Args>, 'abortable'> & {
  abortable: true;
};

// Binds an async request to a store path: the resolved value lands in the store (so path subscriptions, derived
// values and persistence all see it), while load status (pending/error) lives here. Pair with `useAsync` for inline
// loading/error UI, or `useAsyncValue` for Suspense.
export function createAsync<TState extends object, P extends PathOf<TState>, Args extends readonly unknown[]>(
  store: StoreApi<TState>,
  path: P,
  fetcher: (signal: AbortSignal, ...args: Args) => Promise<PathValue<TState, P>>,
  options: AbortableAsyncOptions<Args>
): AsyncResource<PathValue<TState, P>, Args>;

export function createAsync<TState extends object, P extends PathOf<TState>, Args extends readonly unknown[]>(
  store: StoreApi<TState>,
  path: P,
  fetcher: (...args: Args) => Promise<PathValue<TState, P>>,
  options?: AsyncOptions<Args>
): AsyncResource<PathValue<TState, P>, Args>;

export function createAsync<TState extends object, P extends PathOf<TState>, Args extends readonly unknown[]>(
  store: StoreApi<TState>,
  path: P,
  fetcher:
    | ((...args: Args) => Promise<PathValue<TState, P>>)
    | ((signal: AbortSignal, ...args: Args) => Promise<PathValue<TState, P>>),
  options: AsyncOptions<Args> | AbortableAsyncOptions<Args> = {}
): AsyncResource<PathValue<TState, P>, Args> {
  type T = PathValue<TState, P>;

  let status: AsyncStatus = 'idle';
  let error: unknown;
  let current: Promise<T> | undefined;
  let settled: Promise<void> | undefined;
  /** The controller of the call in flight, when the fetcher asked for a signal. */
  let controller: AbortController | undefined;
  const abortable = options.abortable === true;

  // Which of the two the fetcher is was decided by the option the overloads typed it with; a function union cannot be
  // narrowed by a value beside it, so each side is named here once, as the overload promised it.
  const call = (signal: AbortSignal | undefined, args: Args): Promise<T> =>
    signal
      ? (fetcher as (signal: AbortSignal, ...rest: Args) => Promise<T>)(signal, ...args)
      : (fetcher as (...rest: Args) => Promise<T>)(...args);

  // The snapshot is rebuilt only when invalidated (a status change or a store write to the path), so `get` returns a
  // stable reference between changes and can back `useSyncExternalStore` directly.
  const observable = createObservable<AsyncSnapshot<T>>(() => ({
    status,
    data: store.getPath(path),
    error,
    isLoading: status === 'pending'
  }));

  const emit = (): void => {
    observable.invalidate();
    observable.notify();
  };

  const get = observable.get;

  const run = (...args: Args): Promise<T> => {
    status = 'pending';
    error = undefined;
    // Superseded the moment it is: the request in flight is cut, not only its answer ignored.
    controller?.abort();
    const own = abortable ? new AbortController() : undefined;
    controller = own;

    const promise = Promise.resolve().then(() => call(own?.signal, args));
    current = promise;
    settled = promise.then(
      () => undefined,
      () => undefined
    );
    emit();

    return promise.then(
      data => {
        // Settled, its controller is let go: a call that finished is never told it was aborted.
        if (own && controller === own) {
          controller = undefined;
        }

        if (promise === current) {
          current = undefined;
          settled = undefined;
          status = 'success';
          const prevData = store.getPath(path);
          store.setState(path, data);
          // subscribePath fires emit() when setState actually writes.
          // When the value is unchanged, setState is a no-op — emit
          // manually so subscribers still see the status change.
          if (Object.is(prevData, data)) {
            emit();
          }
        }

        return data;
      },
      (caught: unknown) => {
        if (own && controller === own) {
          controller = undefined;
        }

        if (promise === current) {
          current = undefined;
          settled = undefined;
          status = 'error';
          error = caught;
          emit();
        }

        throw caught;
      }
    );
  };

  const unsubscribePath = store.subscribePath(path, emit);

  if (options.immediate) {
    // We own this auto-run, so swallow its rejection here — the failure is still surfaced through `status: 'error'`
    // (and re-thrown by `useAsyncValue`). A caller-initiated `run()` keeps its rejection for the caller to handle.
    run(...options.immediate).catch(() => undefined);
  }

  return {
    get,
    run,
    subscribe: observable.subscribe,
    suspend: () => settled,
    destroy: () => {
      controller?.abort();
      unsubscribePath();
      observable.destroy();
    }
  };
}
