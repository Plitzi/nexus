import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import createStore from './createStore/createStore';
import { CANCEL } from './types';

// `id` is required so no nested all-optional object structurally matches the root, which `PathOf` reads as a cycle.
type State = {
  id: string;
  a?: number;
  local?: number;
  shared?: { a?: number };
  p?: { a?: { x?: number }; b?: number };
  q?: { a?: number; b?: number };
  q1?: number;
  q10?: number;
  r?: { a: number };
  queries?: { q1?: { data: number[] } };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('setState ttl', () => {
  it('a path never written with a ttl is stale', () => {
    const store = createStore<State>({ a: 1 });

    expect(store.isStale('a')).toBe(true);
    expect(store.getFreshness('a')).toBeUndefined();
  });

  it('stays current until the ttl elapses', () => {
    const store = createStore<State>({});

    store.setState('a', 1, { ttl: 500 });
    expect(store.getFreshness('a')).toEqual({ updatedAt: 1_000, expiresAt: 1_500, ttl: 500 });
    expect(store.isStale('a')).toBe(false);

    vi.advanceTimersByTime(499);
    expect(store.isStale('a')).toBe(false);

    vi.advanceTimersByTime(1);
    expect(store.isStale('a')).toBe(true);
    expect(store.getState().a).toBe(1);
  });

  it('records at any depth, and a record covers its subtree', () => {
    const store = createStore<State>({});

    store.setState('queries.q1', { data: [1] }, { ttl: 500 });

    expect(store.isStale('queries.q1')).toBe(false);
    expect(store.isStale('queries.q1.data')).toBe(false);
    expect(store.isStale('queries')).toBe(true);
  });

  it('the most specific record wins', () => {
    const store = createStore<State>({});

    store.setState('q', { a: 1, b: 2 }, { ttl: 1_000 });
    store.setState('q.a', 3, { ttl: 0 });

    expect(store.isStale('q.a')).toBe(true);
    expect(store.isStale('q.b')).toBe(false);
  });

  it('a write with a ttl refreshes the record even when the value is unchanged', () => {
    const store = createStore<State>({});
    const listener = vi.fn();
    store.subscribe(listener);

    store.setState('a', 1, { ttl: 500 });
    vi.advanceTimersByTime(600);
    store.setState('a', 1, { ttl: 500 });

    expect(store.isStale('a')).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a write without a ttl leaves the path stale: nobody said how long its new value stays current', () => {
    const store = createStore<State>({});

    store.setState('a', 1, { ttl: 500 });
    store.setState('a', 2);

    expect(store.getFreshness('a')).toBeUndefined();
    expect(store.isStale('a')).toBe(true);
  });

  it('a write over a subtree drops the records below it, with or without a ttl', () => {
    const store = createStore<State>({});

    store.setState('q.a', 1, { ttl: 0 });
    store.setState('q', { a: 2 }, { ttl: 500 });
    expect(store.isStale('q.a')).toBe(false);

    store.setState('p.a.x', 1, { ttl: 500 });
    store.setState('p', {});
    expect(store.getFreshness('p.a.x')).toBeUndefined();
  });

  it('a change inside a current value leaves it current', () => {
    const store = createStore<State>({});

    store.setState('q', { a: 1 }, { ttl: 500 });
    store.setState('q.b', 2);

    expect(store.isStale('q')).toBe(false);
    expect(store.isStale('q.a')).toBe(false);
  });

  it('a whole-state write drops the records of the values it replaced, and only those', () => {
    const store = createStore<State>({});
    store.setState('a', 1, { ttl: 500 });
    store.setState('q.a', 1, { ttl: 500 });

    store.setState(undefined, prev => ({ ...prev, a: 2 }));

    expect(store.getFreshness('a')).toBeUndefined();
    expect(store.isStale('q.a')).toBe(false);
  });

  it('a subscriber woken by the write already sees its freshness', () => {
    const store = createStore<State>({});
    let seen: boolean | undefined;
    store.subscribePath('q.a', () => {
      seen = store.isStale('q.a');
    });

    store.setState('q.a', 1, { ttl: 500 });

    expect(seen).toBe(false);
  });

  it('a cancelled write records nothing', () => {
    const store = createStore<State>({}, { middlewares: [() => ({ beforeChange: () => CANCEL })] });

    store.setState('a', 1, { ttl: 500 });
    store.setState('q.a', 1, { ttl: 500 });

    expect(store.getFreshness('a')).toBeUndefined();
    expect(store.getFreshness('q.a')).toBeUndefined();
  });

  it('unmount forgets the records of what it removed', () => {
    const store = createStore<State>({});

    store.setState('a', 1, { ttl: 500 });
    store.setState('q.a', 1, { ttl: 500 });
    store.setState('q.b', 1, { ttl: 500 });
    store.setState('a', undefined, { unmount: true });
    store.setState('q.a', undefined, { unmount: true });

    expect(store.getFreshness('a')).toBeUndefined();
    expect(store.getFreshness('q.a')).toBeUndefined();
    expect(store.isStale('q.b')).toBe(false);
  });
});

describe('expire', () => {
  it('marks a path stale without touching its value or waking anyone', () => {
    const store = createStore<State>({});
    store.setState('a', 1, { ttl: 500 });
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.expire('a')).toEqual(['a']);

    expect(store.isStale('a')).toBe(true);
    expect(store.getState().a).toBe(1);
    expect(store.getFreshness('a')).toEqual({ updatedAt: 1_000, expiresAt: 1_000, ttl: 500 });
    expect(listener).not.toHaveBeenCalled();
  });

  /**
   * A reader has to be able to tell "never kept" from "kept and then dropped", and after an `expire` both hold the
   * same two instants. The TTL it was written with is what separates them.
   */
  it('leaves the ttl it was written with alone, so a `ttl: 0` write stays recognisable', () => {
    const store = createStore<State>({});
    store.setState('a', 1, { ttl: 500 });
    store.setState('local', 1, { ttl: 0 });

    store.expire();

    expect(store.getFreshness('a')).toEqual({ updatedAt: 1_000, expiresAt: 1_000, ttl: 500 });
    expect(store.getFreshness('local')).toEqual({ updatedAt: 1_000, expiresAt: 1_000, ttl: 0 });
  });

  it('reaches the records below the path and the ancestors that contain it, and nothing beside it', () => {
    const store = createStore<State>({});
    store.setState('p.a.x', 1, { ttl: 500 });
    store.setState('p.b', 1, { ttl: 500 });
    store.setState('r', { a: 1 }, { ttl: 500 });

    expect(store.expire('p').sort()).toEqual(['p.a.x', 'p.b']);
    expect(store.isStale('r')).toBe(false);

    expect(store.expire('r.a')).toEqual(['r']);
    expect(store.isStale('r')).toBe(true);
  });

  it('does not mistake a sibling sharing a prefix for a descendant', () => {
    const store = createStore<State>({});
    store.setState('q1', 1, { ttl: 500 });
    store.setState('q10', 1, { ttl: 500 });

    store.expire('q1');

    expect(store.isStale('q10')).toBe(false);
  });

  it('without a path, expires every record', () => {
    const store = createStore<State>({});
    store.setState('a', 1, { ttl: 500 });
    store.setState('q.b', 1, { ttl: 500 });

    expect(store.expire().sort()).toEqual(['a', 'q.b']);
    expect(store.isStale('a')).toBe(true);
    expect(store.isStale('q.b')).toBe(true);
  });

  it('a later write makes the path current again', () => {
    const store = createStore<State>({});
    store.setState('a', 1, { ttl: 500 });
    store.expire('a');

    store.setState('a', 2, { ttl: 500 });

    expect(store.isStale('a')).toBe(false);
  });
});

describe('ttl across scopes', () => {
  it('a delegated write is recorded by the scope that owns the value, and read through the child', () => {
    const parent = createStore<State>({ shared: {} });
    const child = createStore<State>({ local: 1 }, { parent });

    child.setState('shared.a', 1, { ttl: 500 });

    expect(parent.isStale('shared.a')).toBe(false);
    expect(child.isStale('shared.a')).toBe(false);
  });

  it('a child expiring a path reaches the parent that recorded it', () => {
    const parent = createStore<State>({ shared: {} });
    const child = createStore<State>({ local: 1 }, { parent });
    child.setState('shared.a', 1, { ttl: 500 });
    child.setState('local', 2, { ttl: 500 });

    expect(child.expire().sort()).toEqual(['local', 'shared.a']);
    expect(parent.isStale('shared.a')).toBe(true);
  });

  it('a record the child owns shadows the parent', () => {
    const parent = createStore<State>({ a: 1 });
    const child = createStore<State>({ a: 2 }, { parent });
    parent.setState('a', 1, { ttl: 0 });
    child.setState('a', 3, { ttl: 500 });

    expect(child.isStale('a')).toBe(false);
    expect(parent.isStale('a')).toBe(true);
  });
});

describe('watchFreshness', () => {
  const events = (store: ReturnType<typeof createStore<State>>, path?: 'q' | 'q.a') => {
    const seen: string[] = [];
    const listener = (event: { path: string; type: string }) => seen.push(`${event.type}:${event.path}`);
    const stop = path ? store.watchFreshness(path, listener) : store.watchFreshness(listener);

    return { seen, stop };
  };

  it('hears a record written, replaced and removed', () => {
    const store = createStore<State>({ id: 's' });
    const { seen } = events(store);

    store.setState('q.a', 1, { ttl: 500 });
    store.setState('q', { a: 2 }, { ttl: 500 });
    store.setState('q', undefined, { unmount: true });

    expect(seen).toEqual(['recorded:q.a', 'dropped:q.a', 'recorded:q', 'dropped:q']);
  });

  it('hears an expire, once per record, and again on the next one', () => {
    const store = createStore<State>({ id: 's' });
    store.setState('a', 1, { ttl: 500 });
    const { seen } = events(store);

    store.expire('a');
    store.expire();

    expect(seen).toEqual(['expired:a', 'expired:a']);
  });

  it('announces a ttl running out, once, and only while somebody listens', () => {
    const store = createStore<State>({ id: 's' });
    store.setState('a', 1, { ttl: 500 });
    store.setState('q.b', 1, { ttl: 1_000 });
    const { seen, stop } = events(store);

    vi.advanceTimersByTime(500);
    expect(seen).toEqual(['elapsed:a']);

    vi.advanceTimersByTime(5_000);
    expect(seen).toEqual(['elapsed:a', 'elapsed:q.b']);

    stop();
    store.setState('a', 2, { ttl: 100 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not announce as elapsed what an expire already announced', () => {
    const store = createStore<State>({ id: 's' });
    store.setState('a', 1, { ttl: 500 });
    const { seen } = events(store);

    store.expire('a');
    vi.advanceTimersByTime(1_000);

    expect(seen).toEqual(['expired:a']);
  });

  it('a path listener hears its own record, the ones below and the ancestors that cover it', () => {
    const store = createStore<State>({ id: 's' });
    const { seen } = events(store, 'q.a');

    store.setState('q', { a: 1 }, { ttl: 500 });
    store.setState('q.b', 1, { ttl: 500 });
    store.setState('a', 1, { ttl: 500 });
    store.expire('q');

    expect(seen).toEqual(['recorded:q', 'expired:q']);
  });

  it('a silent write announces nothing', () => {
    const store = createStore<State>({ id: 's' });
    const { seen } = events(store);

    store.setState('a', 1, { ttl: 500, canPropagate: false });

    expect(seen).toEqual([]);
    expect(store.isStale('a')).toBe(false);
  });

  it('a scoped store hears what its parent records', () => {
    const parent = createStore<State>({ shared: {} });
    const child = createStore<State>({ local: 1 }, { parent });
    const seen: string[] = [];
    child.watchFreshness(event => seen.push(`${event.type}:${event.path}`));

    child.setState('shared.a', 1, { ttl: 500 });

    expect(seen).toEqual(['recorded:shared.a']);
  });

  it('a listener that throws is reported, and the others still hear the event', () => {
    const onError = vi.fn();
    const store = createStore<State>({}, { middlewares: [() => ({ onError })] });
    const heard = vi.fn();
    store.watchFreshness(() => {
      throw new Error('boom');
    });
    store.watchFreshness(heard);

    store.setState('a', 1, { ttl: 500 });

    expect(heard).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ phase: 'notify', path: 'a' }));
  });

  it('lists its own records, with a stable snapshot between changes', () => {
    const store = createStore<State>({ id: 's' });
    store.setState('a', 1, { ttl: 500 });
    const first = store.getFreshnessRecords();

    expect(first).toEqual({ a: { updatedAt: 1_000, expiresAt: 1_500, ttl: 500 } });
    expect(store.getFreshnessRecords()).toBe(first);

    store.expire('a');
    expect(store.getFreshnessRecords()).not.toBe(first);
  });
});
