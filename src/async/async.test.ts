import { describe, it, expect } from 'vitest';

import { createAsync } from './createAsync';
import createStore from '../createStore/createStore';

type State = { value: number; label: string };
const initial = (): State => ({ value: 0, label: 'idle' });

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

describe('createAsync', () => {
  it('starts idle and exposes no in-flight promise', () => {
    const store = createStore<State>(initial());
    const resource = createAsync(store, 'value', (n: number) => Promise.resolve(n * 2));

    expect(resource.get()).toEqual({
      status: 'idle',
      data: 0,
      error: undefined,
      isLoading: false
    });
    expect(resource.suspend()).toBeUndefined();
  });

  it('resolves, writes the result to the store path, and reports success', async () => {
    const store = createStore<State>(initial());
    const resource = createAsync(store, 'value', (n: number) => Promise.resolve(n * 2));

    const result = await resource.run(21);

    expect(result).toBe(42);
    expect(store.getState().value).toBe(42);
    expect(resource.get()).toEqual({
      status: 'success',
      data: 42,
      error: undefined,
      isLoading: false
    });
  });

  it('goes pending while in flight and back once settled', async () => {
    const store = createStore<State>(initial());
    const gate = deferred<number>();
    const resource = createAsync(store, 'value', () => gate.promise);

    const run = resource.run();
    await Promise.resolve();

    expect(resource.get().status).toBe('pending');
    expect(resource.get().isLoading).toBe(true);
    expect(resource.suspend()).toBeInstanceOf(Promise);

    gate.resolve(7);
    await run;

    expect(resource.get().status).toBe('success');
    expect(resource.suspend()).toBeUndefined();
  });

  it('records the error and keeps the previous store value on failure', async () => {
    const store = createStore<State>(initial());
    const failure = new Error('nope');
    const resource = createAsync(store, 'value', () => Promise.reject(failure));

    await expect(resource.run()).rejects.toThrow('nope');

    expect(store.getState().value).toBe(0);
    expect(resource.get()).toMatchObject({ status: 'error', error: failure });
  });

  it('keeps the latest run when an earlier request resolves after a newer one', async () => {
    const store = createStore<State>(initial());
    const first = deferred<number>();
    const second = deferred<number>();
    const gates = [first, second];
    let call = 0;
    const resource = createAsync(store, 'value', () => gates[call++].promise);

    const run1 = resource.run();
    const run2 = resource.run();

    second.resolve(20);
    await run2;
    first.resolve(10);
    await run1;

    expect(store.getState().value).toBe(20);
    expect(resource.get().status).toBe('success');
  });

  it('runs immediately when given immediate args', async () => {
    const store = createStore<State>(initial());
    const resource = createAsync(store, 'value', (n: number) => Promise.resolve(n + 1), { immediate: [99] });

    expect(resource.get().status).toBe('pending');

    await resource.suspend();

    expect(store.getState().value).toBe(100);
  });

  it('reflects an external write to the path through its subscription', () => {
    const store = createStore<State>(initial());
    const resource = createAsync(store, 'value', (n: number) => Promise.resolve(n));
    let notifications = 0;
    resource.subscribe(() => notifications++);

    store.setState('value', 5);

    expect(notifications).toBe(1);
    expect(resource.get().data).toBe(5);
  });

  it('stops reacting after destroy', () => {
    const store = createStore<State>(initial());
    const resource = createAsync(store, 'value', (n: number) => Promise.resolve(n));
    let notifications = 0;
    resource.subscribe(() => notifications++);

    resource.destroy();
    store.setState('value', 5);

    expect(notifications).toBe(0);
  });

  it('latest-call-wins: a failing latest run suppresses an earlier success (design intent)', async () => {
    const store = createStore<State>(initial());
    const first = deferred<number>();
    const second = deferred<number>();
    const gates = [first, second];
    let call = 0;
    const resource = createAsync(store, 'value', () => gates[call++].promise);

    const run1 = resource.run(); // slow, will succeed
    const run2 = resource.run(); // fast, will fail

    second.reject(new Error('second failed'));
    await expect(run2).rejects.toThrow('second failed');

    // At this point run2 has failed. Now resolve run1 — the older request.
    first.resolve(42);
    await run1;

    // "The latest call wins": run2 was called second, so its error state persists.
    // The earlier run1's success is ignored even though it resolved after run2.
    expect(store.getState().value).toBe(0);
    expect(resource.get().status).toBe('error');
  });

  it('does not double-notify subscribers when the async resource resolves', async () => {
    const store = createStore<State>(initial());
    const gate = deferred<number>();
    const resource = createAsync(store, 'value', () => gate.promise);

    const notifications: { status: string; data: number }[] = [];
    resource.subscribe(() => {
      const snap = resource.get();
      notifications.push({ status: snap.status, data: snap.data ?? 0 });
    });

    notifications.length = 0; // clear any subscription-time seed
    const runPromise = resource.run();
    await Promise.resolve(); // flush microtask so 'pending' fires

    // Should be exactly 1: 'pending'
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toEqual({ status: 'pending', data: 0 });
    notifications.length = 0;

    gate.resolve(42);
    await runPromise;

    // Should be exactly 1: 'success' (not 2 — subscribePath callback + explicit emit)
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toEqual({ status: 'success', data: 42 });
  });
});

describe('createAsync, abortable', () => {
  it('hands the fetcher a signal, first, and the run its arguments after it', async () => {
    const store = createStore<State>(initial());
    let given: AbortSignal | undefined;
    const resource = createAsync(
      store,
      'value',
      (signal, n: number) => {
        given = signal;

        return Promise.resolve(n * 2);
      },
      { abortable: true }
    );

    expect(await resource.run(4)).toBe(8);
    expect(given).toBeInstanceOf(AbortSignal);
    expect(given?.aborted).toBe(false);
  });

  it('aborts the call a newer run supersedes, the moment it does, and never one that finished', async () => {
    const store = createStore<State>(initial());
    const signals: AbortSignal[] = [];
    const pending: ReturnType<typeof deferred<number>>[] = [];
    const resource = createAsync(
      store,
      'value',
      signal => {
        signals.push(signal);
        const call = deferred<number>();
        pending.push(call);

        return call.promise;
      },
      { abortable: true }
    );

    const first = resource.run();
    await Promise.resolve();
    const second = resource.run();

    expect(signals[0].aborted).toBe(true);
    await Promise.resolve();
    pending[1].resolve(2);
    await second;
    pending[0].resolve(1);
    await first;

    expect(store.getState().value).toBe(2);
    expect(signals[1].aborted).toBe(false);
    resource.run().catch(() => undefined);
    expect(signals[1].aborted).toBe(false);
  });

  it('aborts the call in flight when the resource is destroyed', async () => {
    const store = createStore<State>(initial());
    let given: AbortSignal | undefined;
    const resource = createAsync(
      store,
      'value',
      signal => {
        given = signal;

        return new Promise<number>(() => undefined);
      },
      { abortable: true }
    );

    void resource.run();
    await Promise.resolve();
    resource.destroy();

    expect(given?.aborted).toBe(true);
  });

  it('makes no controller when the option is off', async () => {
    const store = createStore<State>(initial());
    const made = { count: 0 };
    const Native = globalThis.AbortController;
    globalThis.AbortController = class extends Native {
      constructor() {
        super();
        made.count++;
      }
    };

    try {
      const resource = createAsync(store, 'value', (...args: unknown[]) => Promise.resolve(args.length));
      await resource.run();
      await resource.run();

      expect(made.count).toBe(0);
    } finally {
      globalThis.AbortController = Native;
    }
  });
});
