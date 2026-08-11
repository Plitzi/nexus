// The updater form (`prev => next`) is the contract that makes a bare function ambiguous — the reason
// `SetStateOptions.raw` exists (see functionValues.test.tsx). This file is its regression net: every write route,
// every entry point, and every interaction that could quietly stop calling the updater — or start calling it when it
// must not.

import { renderHook, act } from '@testing-library/react';
import { createElement } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';

import createStore from './createStore';
import { setCodegenEnabled } from './createStore/helpers/writeByPath';
import { createEntityAdapter } from './entities';
import useStore from './react/hooks/useStore';
import useStoreSetter from './react/hooks/useStoreSetter';
import useStoreSync from './react/hooks/useStoreSync';
import { StoreContext } from './react/StoreProvider';
import { CANCEL } from './types';

import type { StoreApi } from './types';
import type { ReactNode } from 'react';

type State = {
  count: number;
  items: number[];
  user: { name: string; profile: { age: number } };
  deep?: { a?: { b?: number } };
  handler?: (input: string) => string;
};

const initial = (): State => ({
  count: 1,
  items: [10, 20],
  user: { name: 'Alice', profile: { age: 30 } }
});

const createTestStore = () => createStore<State>(initial);

const wrapperFor = (store: StoreApi<State>) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(StoreContext.Provider, { value: store as StoreApi<object> }, children);
  };

afterEach(() => setCodegenEnabled(undefined));

describe('the updater form (prev => next)', () => {
  describe('write routes', () => {
    it('single-segment receives the previous value and stores the result', () => {
      const store = createTestStore();
      const updater = vi.fn((prev: number) => prev + 41);

      store.setState('count', updater);

      expect(updater).toHaveBeenCalledExactlyOnceWith(1);
      expect(store.getState().count).toBe(42);
    });

    it('whole-state receives the previous state and replaces it', () => {
      const store = createTestStore();

      store.setState(undefined, prev => ({ ...prev, count: prev.count + 1 }));

      expect(store.getState().count).toBe(2);
      expect(store.getState().user.name).toBe('Alice');
    });

    // Both `writeByPath` implementations must resolve the updater identically — production CSP environments run the
    // recursive fallback, everything else runs the codegen.
    describe.each([
      ['codegen', true],
      ['recursive fallback', false]
    ])('multi-segment (%s)', (_label, codegen) => {
      const setup = () => setCodegenEnabled(codegen);

      it('receives the previous leaf and stores the result', () => {
        setup();
        const store = createTestStore();
        const updater = vi.fn((prev: number) => prev + 5);

        store.setState('user.profile.age', updater);

        expect(updater).toHaveBeenCalledExactlyOnceWith(30);
        expect(store.getState().user.profile.age).toBe(35);
      });

      it('receives undefined for an absent path and builds the missing spine', () => {
        setup();
        const store = createTestStore();

        store.setState('deep.a.b', prev => (prev ?? 0) + 1);

        expect(store.getState().deep?.a?.b).toBe(1);
      });

      it('shares untouched subtrees', () => {
        setup();
        const store = createTestStore();
        const beforeItems = store.getState().items;

        store.setState('user.profile.age', prev => prev + 1);

        expect(store.getState().items).toBe(beforeItems);
      });

      it('is a no-op when the updater returns the previous value', () => {
        setup();
        const store = createTestStore();
        const before = store.getState();
        const listener = vi.fn();
        store.subscribe(listener);

        store.setState('user.profile.age', prev => prev);

        expect(store.getState()).toBe(before);
        expect(listener).not.toHaveBeenCalled();
      });
    });

    it('resolves against an array index and keeps the array an array', () => {
      const store = createTestStore();

      store.setState('items.1', prev => prev * 2);

      expect(Array.isArray(store.getState().items)).toBe(true);
      expect(store.getState().items).toEqual([10, 40]);
    });

    it('is a no-op when a single-segment updater returns the previous value', () => {
      const store = createTestStore();
      const listener = vi.fn();
      const onChange = vi.fn();
      store.subscribe(listener);
      store.subscribeChange(onChange);

      store.setState('count', prev => prev);

      expect(listener).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });

    it('is a no-op when a whole-state updater returns the same reference', () => {
      const store = createTestStore();
      const before = store.getState();
      const listener = vi.fn();
      store.subscribe(listener);

      store.setState(undefined, prev => prev);

      expect(store.getState()).toBe(before);
      expect(listener).not.toHaveBeenCalled();
    });

    it('stores a function when the updater returns one (the wrapper escape hatch)', () => {
      const store = createTestStore();
      const handler = (input: string) => input;

      store.setState('handler', () => handler);

      expect(store.getState().handler).toBe(handler);
    });
  });

  describe('entry points', () => {
    it('the `set` facade alias', () => {
      const store = createTestStore();

      store.set('count', prev => prev + 1);

      expect(store.getState().count).toBe(2);
    });

    it('withBase, at a sub-path and at the base itself', () => {
      const store = createTestStore();
      const bound = store.withBase('user');

      bound.setState('profile.age', prev => prev + 1);
      bound.setState(undefined, prev => ({ ...prev, name: `${prev.name}!` }));

      expect(store.getState().user.profile.age).toBe(31);
      expect(store.getState().user.name).toBe('Alice!');
    });

    it('entity adapter operations (updaters handed straight to setState)', () => {
      type Todo = { id: string; text: string };
      const adapter = createEntityAdapter<Todo>();
      const store = createStore<{ todos: Record<string, Todo> }>(() => ({ todos: {} }));

      store.setState('todos', adapter.addOne({ id: '1', text: 'first' }));
      store.setState('todos', adapter.updateOne({ id: '1', changes: { text: 'edited' } }));

      expect(store.getState().todos['1'].text).toBe('edited');
    });

    it('a scoped store delegates the updater to the owning parent scope', () => {
      const parent = createTestStore();
      const child = createStore<State>(() => ({}), { parent });
      const updater = vi.fn((prev: number) => prev + 1);

      child.setState('count', updater);

      expect(updater).toHaveBeenCalledExactlyOnceWith(1);
      expect(parent.getState().count).toBe(2);
    });

    it('a scoped store that owns the key resolves against its own value', () => {
      const parent = createTestStore();
      const child = createStore<State>(() => ({ count: 100 }), { parent });

      child.setState('count', prev => prev + 1);

      expect(child.getPath('count')).toBe(101);
      expect(parent.getState().count).toBe(1);
    });

    it('sequential updaters inside a batch see each other results and wake once', () => {
      const store = createTestStore();
      const listener = vi.fn();
      store.subscribe(listener);

      store.batch(() => {
        store.setState('count', prev => prev + 1);
        store.setState('count', prev => prev + 1);
      });

      expect(store.getState().count).toBe(3);
      expect(listener).toHaveBeenCalledOnce();
    });
  });

  describe('notifications', () => {
    it('wakes path subscribers for single- and multi-segment updaters', () => {
      const store = createTestStore();
      const onCount = vi.fn();
      const onAge = vi.fn();
      store.subscribePath('count', onCount);
      store.subscribePath('user.profile.age', onAge);

      store.setState('count', prev => prev + 1);
      store.setState('user.profile.age', prev => prev + 1);

      expect(onCount).toHaveBeenCalledOnce();
      expect(onAge).toHaveBeenCalledOnce();
    });

    it('reports the resolved value — not the updater — to change listeners', () => {
      const store = createTestStore();
      const onChange = vi.fn();
      store.subscribeChange(onChange);

      store.setState('count', prev => prev + 1);

      expect(onChange).toHaveBeenCalledOnce();
      expect(onChange.mock.calls[0][0]).toMatchObject({ path: 'count', prevValue: 1, nextValue: 2 });
    });
  });

  describe('interceptors', () => {
    it('see the resolved value and the previous one, not the updater', () => {
      const seen: Array<{ value: unknown; prev: unknown }> = [];
      const store = createStore<State>(initial, {
        middlewares: [
          () => ({
            beforeChange: ({ value, prev }) => {
              seen.push({ value, prev });
            }
          })
        ]
      });

      store.setState('count', prev => prev + 1);
      store.setState('user.profile.age', prev => prev + 1);

      expect(seen).toEqual([
        { value: 2, prev: 1 },
        { value: 31, prev: 30 }
      ]);
    });

    it('can transform the value an updater produced', () => {
      const store = createStore<State>(initial, {
        middlewares: [() => ({ beforeChange: ({ value }) => (value as number) * 10 })]
      });

      store.setState('count', prev => prev + 1);

      expect(store.getState().count).toBe(20);
    });

    it('CANCEL blocks the write after the updater ran, leaving the state untouched', () => {
      const store = createStore<State>(initial, {
        middlewares: [() => ({ beforeChange: () => CANCEL })]
      });
      const updater = vi.fn((prev: number) => prev + 1);

      store.setState('count', updater);
      store.setState('user.profile.age', prev => prev + 1);

      expect(updater).toHaveBeenCalledOnce();
      expect(store.getState().count).toBe(1);
      expect(store.getState().user.profile.age).toBe(30);
    });
  });

  describe('the updater must NOT run', () => {
    it('when the path is read-only — it throws before resolving', () => {
      const store = createStore<State>(initial, { readOnly: ['count', 'user.profile'] });
      const updater = vi.fn((prev: number) => prev + 1);

      expect(() => store.setState('count', updater)).toThrow(/read-only/);
      expect(() => store.setState('user.profile.age', updater)).toThrow(/read-only/);
      expect(updater).not.toHaveBeenCalled();
    });

    it('when the write is an unmount — the value is irrelevant to a removal', () => {
      const store = createStore<State>(() => ({ ...initial(), deep: { a: { b: 1 } } }));
      const updater = vi.fn((prev: number | undefined) => (prev ?? 0) + 1);

      store.setState('count', updater, { unmount: true });
      store.setState('deep.a.b', updater, { unmount: true });

      expect(updater).not.toHaveBeenCalled();
      expect(Object.hasOwn(store.getState(), 'count')).toBe(false);
      expect(Object.hasOwn(store.getState().deep?.a ?? {}, 'b')).toBe(false);
    });

    it('when `raw: true` is passed — even for a function that would be a valid updater', () => {
      const store = createTestStore();
      const updater = vi.fn((prev: number) => prev + 1);

      store.setState('count', updater as never, { raw: true });

      expect(updater).not.toHaveBeenCalled();
      expect(store.getState().count).toBe(updater as never);
    });
  });

  describe('`raw` never leaks into the next write', () => {
    it('a raw write is followed by a normal updater write', () => {
      const store = createTestStore();
      const handler = (input: string) => input;

      store.setState('handler', handler, { raw: true });
      store.setState('count', prev => prev + 1);
      store.setState('user.profile.age', prev => prev + 1);

      expect(store.getState().handler).toBe(handler);
      expect(store.getState().count).toBe(2);
      expect(store.getState().user.profile.age).toBe(31);
    });

    it('an explicit `raw: false` still resolves the updater', () => {
      const store = createTestStore();

      store.setState('count', prev => prev + 1, { raw: false });
      store.setState('user.profile.age', prev => prev + 1, { raw: false });

      expect(store.getState().count).toBe(2);
      expect(store.getState().user.profile.age).toBe(31);
    });

    it('other options carry no raw semantics', () => {
      const store = createTestStore();

      store.setState('count', prev => prev + 1, { canPropagate: false });

      expect(store.getState().count).toBe(2);
    });
  });

  describe('react hooks', () => {
    it('useStore single-path setter resolves the updater against the latest value', () => {
      const store = createTestStore();
      const { result } = renderHook(() => useStore<State, 'count'>('count'), { wrapper: wrapperFor(store) });

      act(() => result.current[1](prev => prev + 1));
      act(() => result.current[1](prev => prev + 1));

      expect(result.current[0]).toBe(3);
    });

    it('useStore multi-path setters resolve updaters at single- and multi-segment paths', () => {
      const store = createTestStore();
      const { result } = renderHook(
        () => useStore<State, ['count', 'user.profile.age']>(['count', 'user.profile.age']),
        { wrapper: wrapperFor(store) }
      );

      act(() => {
        result.current[1](prev => prev + 1);
        result.current[2](prev => prev + 1);
      });

      expect(result.current[0]).toEqual([2, 31]);
    });

    it('useStore full-state setter resolves the updater', () => {
      const store = createTestStore();
      const { result } = renderHook(() => useStore<State>(), { wrapper: wrapperFor(store) });

      act(() => result.current[1](prev => ({ ...prev, count: prev.count + 1 })));

      expect(store.getState().count).toBe(2);
    });

    it('useStoreSetter resolves updaters, plain and bound to a base path', () => {
      const store = createTestStore();
      const { result } = renderHook(
        () => ({ set: useStoreSetter<State>(), setUser: useStoreSetter<State, 'user'>('user') }),
        { wrapper: wrapperFor(store) }
      );

      act(() => {
        result.current.set('count', prev => prev + 1);
        result.current.setUser('profile.age', prev => prev + 1);
      });

      expect(store.getState().count).toBe(2);
      expect(store.getState().user.profile.age).toBe(31);
    });

    it('useStoreSync without `raw` still treats a function value as an updater', () => {
      const store = createTestStore();
      renderHook(() => useStoreSync<State, 'count'>('count', ((prev: number) => prev + 1) as never), {
        wrapper: wrapperFor(store)
      });

      expect(store.getState().count).toBe(2);
    });
  });
});
