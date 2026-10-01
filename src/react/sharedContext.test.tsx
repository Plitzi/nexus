import { render } from '@testing-library/react';
import { use } from 'react';
import { describe, expect, it } from 'vitest';

import { sharedContext } from './sharedContext';
import { StoreContext } from './StoreContext';

describe('contexts every copy of nexus on a page agrees on', () => {
  it('is one context per name, whoever asks', () => {
    expect(sharedContext('test.same', 0)).toBe(sharedContext('test.same', 0));
    expect(sharedContext('test.same', 0)).not.toBe(sharedContext('test.other', 0));
  });

  /** An app's provider and a plugin's hook, from two bundles that each carry nexus: the plugin reads the app's store. */
  it('lets a hook from one copy read a store provided by another', () => {
    const FromAnotherCopy = sharedContext<unknown>('StoreContext', undefined);
    const store = { id: 'app' };
    const Plugin = () => <span>{use(StoreContext) === store ? 'app store' : 'none'}</span>;

    const { container } = render(
      <FromAnotherCopy value={store}>
        <Plugin />
      </FromAnotherCopy>
    );

    expect(container.textContent).toBe('app store');
  });
});
