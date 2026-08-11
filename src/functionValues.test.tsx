import { renderHook, act } from '@testing-library/react';
import { createElement, useCallback } from 'react';
import { describe, it, expect, vi } from 'vitest';

import createStore from './createStore';
import useStore from './react/hooks/useStore';
import useStoreSetter from './react/hooks/useStoreSetter';
import useStoreSync from './react/hooks/useStoreSync';
import { StoreContext } from './react/StoreProvider';

import type { StoreApi } from './types';
import type { ReactNode } from 'react';

type Handler = (input: string) => string;

type State = {
  handler?: Handler;
  count: number;
  slots: { onSave?: Handler; label: string };
};

const createTestStore = () => createStore<State>(() => ({ count: 0, slots: { label: 'a' } }));

const wrapperFor = (store: StoreApi<State>) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(StoreContext.Provider, { value: store as StoreApi<object> }, children);
  };

describe('function values', () => {
  describe('a bare function stays an updater', () => {
    it('single-segment resolves the updater against the previous value', () => {
      const store = createTestStore();

      store.setState('count', prev => prev + 1);

      expect(store.getState().count).toBe(1);
    });

    it('multi-segment resolves the updater against the previous value', () => {
      const store = createTestStore();

      store.setState('slots.label', prev => `${prev}!`);

      expect(store.getState().slots.label).toBe('a!');
    });

    it('single-segment calls a function value instead of storing it (the trap)', () => {
      const store = createTestStore();
      const handler = vi.fn(() => 'called');

      store.setState('handler', handler as never);

      expect(handler).toHaveBeenCalledOnce();
      expect(store.getState().handler).toBe('called');
    });

    it('multi-segment calls a function value instead of storing it (the trap)', () => {
      const store = createTestStore();
      const onSave = vi.fn(() => 'called');

      store.setState('slots.onSave', onSave as never);

      expect(onSave).toHaveBeenCalledOnce();
      expect(store.getState().slots.onSave).toBe('called');
    });
  });

  describe('raw writes store the function itself', () => {
    it('single-segment', () => {
      const store = createTestStore();
      const handler = vi.fn((input: string) => input);

      store.setState('handler', handler, { raw: true });

      expect(handler).not.toHaveBeenCalled();
      expect(store.getState().handler).toBe(handler);
    });

    it('multi-segment', () => {
      const store = createTestStore();
      const onSave = vi.fn((input: string) => input);

      store.setState('slots.onSave', onSave, { raw: true });

      expect(onSave).not.toHaveBeenCalled();
      expect(store.getState().slots.onSave).toBe(onSave);
      expect(store.getState().slots.label).toBe('a');
    });

    it('multi-segment through a path that does not exist yet', () => {
      const store = createStore<{ a?: { b?: { fn?: Handler } } }>(() => ({}));
      const fn: Handler = input => input;

      store.setState('a.b.fn', fn, { raw: true });

      expect(store.getState().a?.b?.fn).toBe(fn);
    });

    it('replaces a previously stored function', () => {
      const store = createTestStore();
      const first: Handler = input => input;
      const second: Handler = input => `${input}!`;

      store.setState('handler', first, { raw: true });
      store.setState('handler', second, { raw: true });

      expect(store.getState().handler).toBe(second);
    });

    it('is a no-op when the same function is written twice', () => {
      const store = createTestStore();
      const handler: Handler = input => input;
      store.setState('handler', handler, { raw: true });
      const onChange = vi.fn();
      store.subscribeChange(onChange);

      store.setState('handler', handler, { raw: true });

      expect(onChange).not.toHaveBeenCalled();
    });

    it('leaves non-function values untouched', () => {
      const store = createTestStore();

      store.setState('count', 5, { raw: true });
      store.setState('slots.label', 'b', { raw: true });

      expect(store.getState().count).toBe(5);
      expect(store.getState().slots.label).toBe('b');
    });

    it('wakes path subscribers on both single- and multi-segment writes', () => {
      const store = createTestStore();
      const onHandler = vi.fn();
      const onSlots = vi.fn();
      store.subscribePath('handler', onHandler);
      store.subscribePath('slots.onSave', onSlots);

      store.setState('handler', (input: string) => input, { raw: true });
      store.setState('slots.onSave', (input: string) => input, { raw: true });

      expect(onHandler).toHaveBeenCalledOnce();
      expect(onSlots).toHaveBeenCalledOnce();
    });

    it('reports the function as the changed value to change listeners', () => {
      const store = createTestStore();
      const handler: Handler = input => input;
      const onChange = vi.fn();
      store.subscribeChange(onChange);

      store.setState('handler', handler, { raw: true });

      expect(onChange).toHaveBeenCalledOnce();
      expect(onChange.mock.calls[0][0]).toMatchObject({ path: 'handler', nextValue: handler });
    });

    it('passes the function through interceptors instead of calling it', () => {
      const seen: unknown[] = [];
      const handler: Handler = input => input;
      const store = createStore<State>(() => ({ count: 0, slots: { label: 'a' } }), {
        middlewares: [
          () => ({
            beforeChange: ({ value }) => {
              seen.push(value);
            }
          })
        ]
      });

      store.setState('handler', handler, { raw: true });
      store.setState('slots.onSave', handler, { raw: true });

      expect(seen).toEqual([handler, handler]);
      expect(store.getState().handler).toBe(handler);
      expect(store.getState().slots.onSave).toBe(handler);
    });

    it('still refuses a read-only path', () => {
      const store = createStore<State>(() => ({ count: 0, slots: { label: 'a' } }), { readOnly: ['handler'] });

      expect(() => store.setState('handler', (input: string) => input, { raw: true })).toThrow(/read-only/);
    });

    it('works through withBase', () => {
      const store = createTestStore();
      const onSave: Handler = input => input;

      store.withBase('slots').setState('onSave', onSave, { raw: true });

      expect(store.getState().slots.onSave).toBe(onSave);
    });

    it('works on a scoped store that delegates the write to its parent', () => {
      const parent = createTestStore();
      const child = createStore<State>(() => ({}), { parent });
      const handler: Handler = input => input;

      child.setState('handler', handler, { raw: true });

      expect(parent.getState().handler).toBe(handler);
      expect(child.getPath('handler')).toBe(handler);
    });
  });

  describe('whole-state writes', () => {
    it('keeps function values inside the written object', () => {
      const store = createTestStore();
      const handler: Handler = input => input;

      store.setState(undefined, { handler } as Partial<State> as State);

      expect(store.getState().handler).toBe(handler);
    });
  });

  describe('react hooks', () => {
    it('useStore single-path setter stores a module-scope function', () => {
      const store = createTestStore();
      const handler: Handler = input => input;
      const { result } = renderHook(() => useStore<State, 'handler'>('handler'), { wrapper: wrapperFor(store) });

      act(() => result.current[1](handler, { raw: true }));

      expect(store.getState().handler).toBe(handler);
      expect(result.current[0]).toBe(handler);
    });

    it('useStore single-path setter stores a useCallback-memoized function', () => {
      const store = createTestStore();
      const { result } = renderHook(
        () => {
          const handler = useCallback<Handler>(input => input, []);
          const [value, setValue] = useStore<State, 'handler'>('handler');

          return { handler, value, setValue };
        },
        { wrapper: wrapperFor(store) }
      );
      const { handler } = result.current;

      act(() => result.current.setValue(handler, { raw: true }));

      expect(result.current.value).toBe(handler);
      expect(result.current.handler).toBe(handler);
    });

    it('useStore multi-path setters store functions at single- and multi-segment paths', () => {
      const store = createTestStore();
      const handler: Handler = input => input;
      const onSave: Handler = input => `${input}!`;
      const { result } = renderHook(() => useStore<State, ['handler', 'slots.onSave']>(['handler', 'slots.onSave']), {
        wrapper: wrapperFor(store)
      });

      act(() => {
        result.current[1](handler, { raw: true });
        result.current[2](onSave, { raw: true });
      });

      expect(result.current[0]).toEqual([handler, onSave]);
      expect(store.getState().handler).toBe(handler);
      expect(store.getState().slots.onSave).toBe(onSave);
    });

    it('useStoreSetter writes a function raw', () => {
      const store = createTestStore();
      const onSave: Handler = input => input;
      const { result } = renderHook(() => useStoreSetter<State>(), { wrapper: wrapperFor(store) });

      act(() => result.current('slots.onSave', onSave, { raw: true }));

      expect(store.getState().slots.onSave).toBe(onSave);
    });

    it('useStoreSetter bound to a base path writes a function raw', () => {
      const store = createTestStore();
      const onSave: Handler = input => input;
      const { result } = renderHook(() => useStoreSetter<State, 'slots'>('slots'), { wrapper: wrapperFor(store) });

      act(() => result.current('onSave', onSave, { raw: true }));

      expect(store.getState().slots.onSave).toBe(onSave);
      expect(store.getState().slots.label).toBe('a');
    });

    it('useStoreSync mirrors several callbacks at once', () => {
      const store = createTestStore();
      const handler: Handler = input => input;
      const onSave: Handler = input => `${input}!`;
      renderHook(
        () =>
          useStoreSync<State, ['handler', 'slots.onSave']>(['handler', 'slots.onSave'], [handler, onSave], {
            raw: true
          }),
        { wrapper: wrapperFor(store) }
      );

      expect(store.getState().handler).toBe(handler);
      expect(store.getState().slots.onSave).toBe(onSave);
    });

    it('useStoreSync mirrors a callback prop instead of running it', () => {
      const store = createTestStore();
      const first: Handler = input => input;
      const second: Handler = input => `${input}!`;
      const { rerender } = renderHook(
        ({ handler }: { handler: Handler }) =>
          useStoreSync<State, 'slots.onSave'>('slots.onSave', handler, { raw: true }),
        { wrapper: wrapperFor(store), initialProps: { handler: first } }
      );

      expect(store.getState().slots.onSave).toBe(first);

      rerender({ handler: second });

      expect(store.getState().slots.onSave).toBe(second);
    });

    it('useStore setter keeps the updater form for plain values', () => {
      const store = createTestStore();
      const { result } = renderHook(() => useStore<State, 'count'>('count'), { wrapper: wrapperFor(store) });

      act(() => result.current[1](prev => prev + 1));

      expect(result.current[0]).toBe(1);
    });
  });
});
