# @plitzi/nexus

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
