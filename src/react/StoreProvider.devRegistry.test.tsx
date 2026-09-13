import { render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, it, expect, vi } from 'vitest';

import { getDevStoresSnapshot } from '../devStoreRegistry';
import DevStoreScopeContext from './DevStoreScopeContext';
import StoreProvider from './StoreProvider';

vi.mock('../env', () => ({ MODE: 'production', isProd: true, isDev: false, isTest: false }));

const entryNamed = (name: string) => getDevStoresSnapshot().find(entry => entry.name === name);

/**
 * The registry in a PRODUCTION build, which is where a devtools panel that ships with the app runs.
 *
 * Gated on `isDev` alone, every provider skipped registration there, so a panel switched on in a shipped build listed
 * no stores at all — with nothing erroring, because an empty list is a plausible answer. The scope context is how the
 * panel says it is mounted; without it a production build keeps no bookkeeping.
 */
describe('StoreProvider and the dev store registry, in a production build', () => {
  it('registers nothing when no panel has mounted a scope context', () => {
    const { unmount } = render(createElement(StoreProvider, { name: 'unscoped', value: { a: 1 } }));

    expect(entryNamed('unscoped')).toBeUndefined();

    unmount();
  });

  it('registers beneath a scope context, tagged with it, and leaves on unmount', () => {
    const { unmount } = render(
      createElement(
        DevStoreScopeContext,
        { value: 'instance-1' },
        createElement(StoreProvider, { name: 'scoped', value: { a: 1 } })
      )
    );

    expect(entryNamed('scoped')?.scopeId).toBe('instance-1');

    unmount();

    expect(entryNamed('scoped')).toBeUndefined();
  });
});
