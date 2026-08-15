import { useSyncExternalStore } from 'react';

import { createStore, persistMiddleware } from '@plitzi/nexus';
import { createStoreHook } from '@plitzi/nexus/react';

// The log dock's open/width preferences, persisted with `persistMiddleware` — so a refresh keeps your panel exactly
// as you left it. Another Nexus capability, used for real.
export type DockState = {
  open: boolean;
  width: number;
};

// Width of the collapse handle that stays on screen when the panel slides away.
export const DOCK_HANDLE_WIDTH = 36;

// A module singleton rather than a per-mount store: the hero reserves room for the panel, so its width has to be
// readable from outside the dock's own provider.
export const dockStore = createStore<DockState>(
  { open: true, width: 320 },
  { middlewares: [persistMiddleware<DockState>({ key: 'nexus.logdock', storage: 'local' })] }
);

export const { useStore: useDock, useStoreSetter: useDockSetter } = createStoreHook<DockState>();

// How much horizontal space the dock occupies right now — what the hero keeps clear so the panel never covers the
// playfield. Collapsed, only the handle remains, and that hangs over the very edge.
export const useDockInset = (): number =>
  useSyncExternalStore(
    cb => dockStore.watch(cb),
    () => {
      const { open, width } = dockStore.getState();

      return open ? width + DOCK_HANDLE_WIDTH : 0;
    }
  );
