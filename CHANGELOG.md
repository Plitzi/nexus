# @plitzi/nexus

## 1.2.1

### Fixed

- **A path both a scope and its chain hold is the same object until one of them changes.** When a scoped store and
  an ancestor each contribute an object at a path — a list row and its list publishing under one source key — the
  read is a merge. The merge was cached with every other chain read, and that cache drops on any ancestor commit, so
  a write anywhere above (a source registering, the route changing) handed back a new object with the same content.
  Every `useSyncExternalStore` reading the path took that for a change and rendered again: on a page with a list,
  each navigation re-rendered every row several times for nothing.

  The merge is now remembered per path together with the two values it was made from, and handed back for as long
  as both are the same references. It also merges just that subtree instead of the whole scoped state. Covered by
  `src/scopedStoreGetPath.test.ts`.

## 1.2.0

### Added

- **Freshness per path: `setState(path, value, { ttl })`, `isStale`, `getFreshness` and `expire`.** A write can now
  say how long, in milliseconds, the value it lands counts as current. The store records when the path was written
  and when it stops being current, and `isStale(path)` answers from that record — or from the nearest ancestor's,
  since a record covers its subtree. `expire(path?)` pulls the record forward to now for the path, the records below
  it and the ancestors that contain it (every record, without a path), and returns the paths it expired.

  This is what a stale-while-revalidate cache is made of, and it belongs with the value: a cache that keeps its own
  timestamps beside a store has two places that can disagree about the same answer, and neither of them is the one
  the devtools show. Keeping the fact on the path makes "is this still good?" a question the store answers.

  It is freshness, not expiry of the value. Nothing is removed and nobody is woken when a `ttl` elapses or a path is
  expired, because a stale value is still the best one there is until a new one lands; a caller that refreshes on
  expiry acts on the paths `expire` returns.

  The rules, all covered by `src/ttl.test.ts`:

  - A path never written with a `ttl` is stale — nothing ever said how long it stays current.
  - A write replaces the subtree at its path, so the records inside it go: a `ttl` write puts its own in their place
    — even when the value is unchanged, since an identical answer still says it is current — and any other write
    leaves the path stale. Records above the path stay: a change inside a current value leaves it current. A
    whole-state write drops the records of every value it replaced, `unmount` those of what it removes, and a write
    an interceptor cancels touches nothing.
  - The record is in place before subscribers are woken, so one reading freshness in response sees this write's.
  - Records live in the scope that commits the write. A delegated write is recorded by its owner, and a scoped store
    reads (`getFreshness`, `isStale`) and expires through its parent.

  A store that never passes a `ttl` pays one `undefined` check per write.

- **Freshness events: `watchFreshness` and `getFreshnessRecords`.** `store.watchFreshness(listener)` — or
  `watchFreshness(path, listener)` for a path, the records below it and the ancestors covering it — hears every
  change: `recorded` by a `ttl` write, `expired` by `expire`, `elapsed` when a `ttl` runs out and `dropped` when the
  value a record described was replaced or removed. `elapsed` needs a clock, so the store keeps one timer, for the
  next record to run out, and only while somebody listens. Silent (`canPropagate: false`) writes announce nothing,
  as they wake nobody; a listener that throws goes to `onError` like any subscriber. A scoped store also hears its
  parent. `getFreshnessRecords()` lists a scope's own records, with a snapshot that is stable between changes — what
  a devtools panel needs.

- **Hooks: `useFreshness`, `useOnStale`, and `ttl` on `useStoreSync`.** `useFreshness(path)` answers
  `{ isStale, updatedAt, expiresAt }` and re-renders when the path is written, expired or runs out.
  `useOnStale(path, callback)` calls back — with the latest callback — when the path is expired or its `ttl` runs out,
  the event saying which. Both are in the `createStoreHook` bundle too. `useStoreSync(path, value, { ttl })` writes
  every synced value with that `ttl`; the setters `useStore` returns already took it through their options.

## 1.1.4

### Fixed

- **A devtools panel in a production build listed no stores.** `StoreProvider` registered its store in the dev
  store registry only when `isDev` was true, so in a production bundle nothing ever registered — including under a
  panel that ships with the app and is switched on per session. The panel's store picker was simply empty: no error,
  no warning, and an empty list is a plausible enough answer that it reads as a panel nobody finished rather than a
  registry nobody filled.

  A provider now also registers whenever it sits beneath a `DevStoreScopeContext`, in any build. Providing the
  context is the panel saying it is mounted, so it is the opt-in: a production build that never mounts it keeps no
  registry bookkeeping, exactly as before. Dev builds are unchanged — every provider registers.

- **Registering N stores copied the registry N times.** The snapshot array was rebuilt on every register and
  unregister, which made mounting a page of stores quadratic in the number of stores. It is now rebuilt on read, once
  per change, and keeps the same stable identity between changes that `useSyncExternalStore` relies on.

## 1.1.3

### Fixed

- **`persistMiddleware` restored state written under a version it could not read.** `version` exists to say "the
  shape changed", and the option pairs with `migrate` for turning an old shape into the current one. Without a
  `migrate`, a mismatch fell through to applying the stored payload anyway — which is the one thing the option
  cannot be for.

  It fails silently, because the values still LAND. A list persisted as strings, restored into a build that now
  stores `{ id, value }` records, renders a row per entry with nothing in it: every label reads `.value` and finds
  nothing, and every control addresses `.id` and does nothing. Nothing throws, nothing is logged, and the page is
  simply inert — which is a long way from the stored data being the suspect.

  A mismatch with no `migrate` now leaves the store on its initial state. The payload is left where it is rather
  than deleted: it is readable, just not by this build, so a later one that ships a `migrate` can still make sense
  of it — and the next commit overwrites it with the current version regardless.

## 1.1.2

### Fixed

- **The sibling scope-collision guard reported collisions that were over.** A scope registers the unowned paths it
  delegates to its parent, tagged with its scope id, so a second child delegating the same path can be flagged —
  but `destroy()` never released those registrations. A claim therefore outlived its claimant, and the scope that
  REPLACES one on a remount is a new store with a new id: a modal closed and reopened, a page navigated away from
  and back to, a keyed subtree remounted. The replacement delegated the same path, found the dead scope's claim
  still standing, and warned about a collision with a scope that no longer existed.

  In a React tree this reads as a real bug that cannot be found, because the second writer is not on screen. The
  report that surfaced it was one element's state (`runtime.elements.<id>`, written from a modal's scope) named as
  clobbered by a sibling, in a document where that element exists exactly once.

  `createScopeClaims` now keeps a reverse index of what each scope claimed, and `destroy()` releases it. StrictMode
  is unaffected either way — it reuses the same store instance through `destroy()` → `reconnect()`, so its scope id
  never changed. Two live siblings delegating the same path are still reported, unchanged.

### Notes

- Dev-only, both before and after: the whole guard is compiled out of production builds. No API change.
- Covered by `src/scopedStoreGetPath.test.ts`: a destroyed scope's replacement may delegate the path it held, and a
  live sibling is still caught when a different sibling was the one destroyed.

## 1.1.1

### Fixed

- **Nexus believed it was in production inside every browser bundle.** `resolveMode` read the environment as
  `typeof process !== 'undefined' && process.env.NODE_ENV`. A bundler statically replaces the exact text
  `process.env.NODE_ENV` with a string literal — but only that text, and the guard in front of it is still
  evaluated at runtime. In a browser there is no `process`, so the guard short-circuits and the literal the
  bundler just injected is never read: `MODE` fell through to `'production'`, and `isDev` was `false`, no matter
  what the consumer defined. Node, `tsx` and SSR were unaffected, which is what kept it hidden.

  The replaceable expression now comes first and the guard is a `catch`, which is the only form that works in all
  four cases: bundled with a define, bundled without one, plain Node, and a browser with no build step.

  Everything gated on `isDev` was silently inert in the browser. All of it is live again:

  - **The dev-store registry.** `StoreProvider` never called `registerDevStore`, so a devtools panel could not
    enumerate a single store — its store inspector and instance dropdown came up empty, while the tabs that do
    not depend on the registry carried on working and made it look deliberate.
  - **Read-only path enforcement.** A write to a `readOnly` path is meant to throw in development and no-op in
    production. It only ever no-opped: the write vanished and nothing said so.
  - **Sibling scope-collision detection.** `scopeClaims` was never attached, so two sibling scopes delegating a
    write to the same unowned parent path went unreported.
  - **The duplicate `StoreProvider id` warning**, which exists precisely because a shadowed id makes
    `useStoreById` resolve to the nearer store without complaint.

### Notes

- No API change, and no behaviour change outside the browser. A consumer still has to define
  `process.env.NODE_ENV` for its bundle — that has always been the contract; it just could not be honoured
  before. A browser bundle with no define at all still resolves to `production`, which is the safe default.
- Covered by `src/env.test.ts`: the mode is read from the environment rather than assumed, and the fallback holds
  where there is genuinely no `process` and nothing replaced it.

## 1.1.0

### Added

- **`raw` — store a function as a value.** A bare function in a write is the updater form (`prev => next`), so a
  callback you wanted to *keep* in state (an event handler, a renderer, a formatter) was called instead of stored,
  and what landed in the store was its return value — `undefined` for a handler that returns nothing. There is no
  way to tell the two apart at runtime, so the intent is now explicit: `set(path, fn, { raw: true })` writes the
  value verbatim and never calls it. Works at any depth, through `withBase`, down the scope chain, and from every
  React setter. `beforeChange` interceptors see the function itself.
- **`useStoreSync(path, value, { raw: true })`** mirrors a callback prop into the store without running it — the
  same option, at the hook that exists to mirror props.

### Fixed

- **React setters dropped their options argument.** The setters returned by `useStore` (single- and multi-path)
  called `store.setState(path, value)` and discarded anything else, so `canPropagate` / `unmount` — and now `raw` —
  were unreachable from a component. They forward the third argument now: `setValue(v, { unmount: true })`.
- **`useStore()` (no path) advertised the wrong setter type.** It was typed as `StoreApi<T>['setState']`, whose
  first parameter is a *path*, while the runtime setter has always taken the state value directly. Writing
  `setState('a.b', v)` type-checked and then spread a path string into the state at runtime. It is now
  `FullStateSetter<T>` — `(state | updater, options?)` — which is what the hook actually does.

### Types

- `SetStateOptions` gains `raw?: boolean`; `PathSetter<T, P>` and the multi-path setters gain the optional
  `options` argument; new `FullStateSetter<T>`. `createStoreHook`'s string-path overloads now reuse `PathSetter`
  instead of restating it, so the two signatures can no longer drift.

### Notes

- Default behaviour is unchanged: without `raw`, a function is still an updater. That contract now has its own
  regression net (`src/updaterForm.test.tsx`) covering every write route — single-segment, multi-segment under
  **both** `writeByPath` implementations, arrays, whole-state, `withBase`, entity-adapter updaters, the scope
  chain, batches, interceptors — plus the two cases where the updater must *not* run (a read-only path throws
  before resolving it; an `unmount` never touches the value).

## 1.0.1

### Fixed

- **`useStoreSync` woke subscribers from inside a render when syncing several paths at once.** The mount sync
  runs during the render on purpose, so whatever renders below reads the value on that same pass; the
  single-path variant already committed it silently (`canPropagate: false`), the multi-path one did not. Any
  component already subscribed to one of those paths therefore received a `setState` from inside another
  component's render, which React reports as _"Cannot update a component (`X`) while rendering a different
  component (`Y`)"_. It shows up whenever a provider syncing several paths mounts while a sibling subtree is
  still alive — a keyed editor provider remounting over a live canvas, for instance. Both variants now commit
  the mount sync silently; later syncs keep waking from the layout effect, as before.

### Documentation

- `useStoreSync` now states when its write lands and why: silent during the render on mount, waking from a
  layout effect afterwards, and `syncStrategy: 'render'` waking on every sync — an escape hatch for subtrees
  nothing outside subscribes to. The `syncStrategy` type carries the same contract at the call site.

### Notes

- The multi-path mount sync no longer wakes a component that was already mounted and subscribed to one of those
  paths; that component reads the value on its next render instead. This is the behaviour the single-path
  variant — and therefore `StoreProvider`'s own seeding — has always had, and the wake it used to perform was
  the one React refuses to accept.

## 1.0.0

First stable release, and the first published from the standalone
[Plitzi/nexus](https://github.com/Plitzi/nexus) repository — `@plitzi/nexus` previously lived inside the
`plitzi-workspace` monorepo as `packages/nexus`.

### Fixed

- **The build emitted CommonJS inside `.mjs` files.** `build.lib` ran without an explicit `formats`, so Vite also
  performed a `cjs` pass; both passes wrote `[name].mjs` and the CommonJS output silently overwrote the ESM one.
  Every published `dist/*.mjs` contained `require()`/`exports`, so `import '@plitzi/nexus'` failed with
  `ReferenceError: exports is not defined in ES module scope`. **All 0.32.x releases are affected — upgrade to
  1.0.0.**
- `main` and `module` pointed at `dist/index.js`, a file the build never produced (entries are `.mjs`).

### Changed

- Every `exports` subpath now ends with a `default` condition pointing at its ESM entry. The package is ESM-only, so
  there is no `.cjs` for the `require` condition, and without `default` any resolver outside the `import` condition
  got `ERR_PACKAGE_PATH_NOT_EXPORTED` — including Node versions that can `require()` ESM. `require('@plitzi/nexus')`
  now works on Node ≥ 22.12.

### Notes

- The package remains **ESM-only** by design. A dual CJS/ESM build would risk loading two copies of the store
  registry in a single process, which is exactly the failure mode a state library must not have.
- Releases `0.30.x` – `0.32.x` were published from the monorepo and their changelog carried no descriptions (each
  entry was only a version bump), so they are not reproduced here.
