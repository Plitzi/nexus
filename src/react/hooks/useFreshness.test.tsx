import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import createStore from '../../createStore/createStore';
import { createStoreHook } from '../createStoreHook';
import useStoreSync from './useStoreSync';

type State = { id: string; orders?: { total: number } };

const { useFreshness, useOnStale } = createStoreHook<State>();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useFreshness', () => {
  it('reads a path never written with a ttl as stale', () => {
    const store = createStore<State>({ id: 's' });

    const { result } = renderHook(() => useFreshness('orders', { store }));

    expect(result.current).toEqual({ isStale: true, updatedAt: undefined, expiresAt: undefined });
  });

  it('follows a write, the ttl running out and an expire', () => {
    const store = createStore<State>({ id: 's' });
    const { result } = renderHook(() => useFreshness('orders.total', { store }));

    act(() => store.setState('orders', { total: 1 }, { ttl: 500 }));
    expect(result.current).toEqual({ isStale: false, updatedAt: 1_000, expiresAt: 1_500 });
    const fresh = result.current;

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.isStale).toBe(true);
    expect(result.current).not.toBe(fresh);

    act(() => store.setState('orders', { total: 2 }, { ttl: 500 }));
    expect(result.current.isStale).toBe(false);

    act(() => void store.expire('orders'));
    expect(result.current).toEqual({ isStale: true, updatedAt: 1_500, expiresAt: 1_500 });
  });
});

describe('useOnStale', () => {
  it('calls back when the path is expired or runs out, with the latest callback', () => {
    const store = createStore<State>({ id: 's' });
    store.setState('orders', { total: 1 }, { ttl: 500 });
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = renderHook(({ callback }) => useOnStale('orders', callback, { store }), {
      initialProps: { callback: first }
    });
    rerender({ callback: latest });

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(latest).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'elapsed', path: 'orders' }));

    act(() => store.setState('orders', { total: 2 }, { ttl: 500 }));
    act(() => void store.expire('orders'));
    expect(latest).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'expired' }));
    expect(latest).toHaveBeenCalledTimes(2);
    expect(first).not.toHaveBeenCalled();
  });

  it('stops listening when disabled or unmounted', () => {
    const store = createStore<State>({ id: 's' });
    store.setState('orders', { total: 1 }, { ttl: 500 });
    const callback = vi.fn();
    const { unmount } = renderHook(() => useOnStale('orders', callback, { store, enabled: false }));

    act(() => void store.expire());
    unmount();

    expect(callback).not.toHaveBeenCalled();
  });
});

describe('useStoreSync ttl', () => {
  it('writes each synced value with the ttl it was given', () => {
    const store = createStore<State>({ id: 's' });
    const { rerender } = renderHook(({ total }) => useStoreSync('orders', { total }, { store, ttl: 500 }), {
      initialProps: { total: 1 }
    });
    expect(store.isStale('orders')).toBe(false);

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(store.isStale('orders')).toBe(true);

    rerender({ total: 2 });
    expect(store.getFreshness('orders')).toEqual({ updatedAt: 1_600, expiresAt: 2_100, ttl: 500 });
  });
});
