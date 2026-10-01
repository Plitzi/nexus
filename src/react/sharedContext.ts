import { createContext } from 'react';

import type { Context } from 'react';

/**
 * Bumped when a shared context's value changes shape in a way an older copy could not read: copies on either side of
 * the bump then keep contexts of their own rather than handing each other values they would misread.
 */
const SHARED_CONTEXTS_VERSION = 1;

const REGISTRY = Symbol.for(`@plitzi/nexus.contexts.v${String(SHARED_CONTEXTS_VERSION)}`);

type Registry = Map<string, Context<unknown>>;

const registryOf = (scope: typeof globalThis & { [REGISTRY]?: Registry }): Registry => {
  scope[REGISTRY] ??= new Map();

  return scope[REGISTRY];
};

/**
 * A React context every copy of nexus on a page agrees on.
 *
 * Two bundles that each carry nexus — an app and a plugin it loads, built apart — would each make their own contexts
 * with `createContext`, and a store provided by one would be invisible to a hook from the other: the plugin read the
 * nearest provider of ITS copy, or none. Made once per page, under `name`, by whichever copy asks first and handed to
 * every other, a provider from any copy is seen by a hook from any copy.
 */
export const sharedContext = <T>(name: string, defaultValue: T): Context<T> => {
  const registry = registryOf(globalThis);
  const found = registry.get(name);
  if (found) {
    // Registered under this name by `sharedContext` alone, which only ever stores the context it made for that name's
    // value type: every caller of a name declares the same type, so reading it back as that type is sound.
    return found as Context<T>;
  }

  const context = createContext(defaultValue);
  context.displayName = name;
  registry.set(name, context as Context<unknown>);

  return context;
};
