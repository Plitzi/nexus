# @plitzi/nexus

A type-safe state store with a framework-agnostic core and React / Vue / Next bindings: subscribe to dot-notation
paths, re-render only when that value changes. It is the store Plitzi's SDK, builder and dev tools run on, and an
open-source package of its own (Apache-2.0, website in `website/`). This file is for any agent working here (Claude
Code, OpenCode, Codex…); `CLAUDE.md` only imports it. The public API is documented in `README.md`.

## Where this repo sits

Plitzi is five repos under `/Users/Carlos/htdocs/`; the map is in `plitzi-workspace/AGENTS.md` § What Plitzi is.
nexus is consumed by `plitzi-workspace` (apps/sdk, apps/builder, sdk-shared, sdk-elements, sdk-dev-tools, sdk-auth)
and by `plitzi-sdk-server`, from npm — or, while an unpublished change is tried, through a Yarn `portal:../nexus` in
their `resolutions` (check, never assume). With a portal they read this repo's `dist`, so rebuild after any change.

## How we work

Owned by `plitzi-workspace/AGENTS.md` § How we work (read it when you can); in a line each:

- Talk to Carlos in **Spanish**; code, comments, docs and commits in **English**. Report failures and skipped steps
  as they are.
- **Quality and zero tech debt first**; type-safe (no `any`/`as` without a reason in a comment); **one source of
  truth**; no legacy shims unless asked.
- **Nothing silent**: misuse warns or throws in dev with the fix in the message; never fail quietly.
- **The core stays generic**: no Plitzi-specific behaviour here — a need of the SDK is solved as a general feature or
  in the consumer.
- Shared working tree: never `git stash`/`checkout --`/`restore`/`reset --hard`/`clean`; temp scripts outside the
  repo. **Confirm before deleting** anything not agreed — every export is public API.
- Commit/push/publish only when asked; **Carlos publishes**. No sub-agents unless he authorizes them.

## Commands

```bash
yarn test              # vitest run (unit, jsdom)
yarn test:coverage     # keep coverage high (~97% statements); new code comes with its tests
yarn typecheck         # tsc -p tsconfig.app.json --noEmit (tests included)
yarn lint              # eslint ./src
yarn build:dev         # vite build + scripts/generate-exports.mjs (the exports map is generated from dist)
yarn build:prod
cd website && npm run bench        # store benchmark vs Zustand/Jotai/Valtio/Redux… (CLI)
cd website && npm run check:docs   # the website's code samples against the real API
```

## Layout

- `src/` root = the **agnostic core** (zero React): `createStore/`, `async/`, `derived/`, `entities/`, `middleware/`,
  `history/`, `helpers/`, `rsc/`, `advanced/`, `types/`, `env.ts`.
- `src/react/` → `@plitzi/nexus/react`, `src/vue/` → `/vue`, `src/next/` → `/next`. Bindings never leak into a core
  barrel.
- A feature folder has its factory at its root and its hooks in `feature/hooks/` (tests beside what they test).
- Middlewares are named `*Middleware` and the file is named after its export (`persistMiddleware.ts`). `cascade` is a
  decorator, not a middleware. Interception (`beforeChange`, `CANCEL`) is only through middleware — no imperative
  `store.intercept`.
- `examples/` (react, next, astro-6/7, vue, svelte) and `docs/integrations/` are reference code for consumers.

## Rules that go wrong most

- **Hot paths stay free when nothing observes.** Change listeners, interceptors and wakes are guarded by a length
  check; notification loops are indexed `for` loops with the length cached (a `forEach` doubled the `hot` bench).
  Run the benchmark before and after any change to `createStore/` and say the numbers.
- **`getState()` never returns the live object.** Single-segment writes mutate in place because every snapshot is a
  clone; multi-segment writes stay immutable with structural sharing. Do not break either side of that invariant.
- **The codegen writer (`new Function`) has a recursive fallback** for CSP without `unsafe-eval`; tests cover both and
  injection. Numeric segments (array indexes) always take the recursive, array-preserving writer.
- **Unsubscribing during a notification must not skip a sibling** (`Subscribers` tombstones, then compacts).
- **`isDev` comes from `src/env.ts`** (the replaceable `process.env.NODE_ENV` first, the guard in the `catch`) — never
  `import.meta.env`, never `typeof process` in front. Dev-only behaviour disappears in consumers' production builds
  (Plitzi's CI builds prod), so test both modes.
- **Contexts are shared across copies** (`src/react/sharedContext.ts`, `Symbol.for('@plitzi/nexus.contexts.v1')`): an
  app and a plugin built apart each bundle nexus and must see the same providers. A new context goes through it.
- **A `StoreProvider` without `inherit` is isolated**; overriding one key is `inherit="live"`, a diverging draft is
  `'snapshot'`.
- Middlewares do not cascade to child stores (persist would re-hydrate every child, history would record N times).
- For large maps edited per item, `createEntityStore` (O(1), per-id wakes), not `setState('items.<id>…')`.
- **Build:** `formats: ['es']` only (a CJS pass overwrote the `.mjs`); only `index.*` files are entries, so a new
  public subpath is a folder with an `index.ts`, with named re-exports (`export *` alone is tree-shaken away under
  `sideEffects: false`). `dist` is emptied only in production builds — after moving files, `rm -rf dist` before
  `build:dev`.

## Finishing a change

Every change to nexus comes with:

1. Unit tests (edge cases included: abuse, re-entrancy, StrictMode, SSR where it applies).
2. The `plitzi-workspace` e2e that exercises it, covered or updated (nexus has no e2e of its own; they live in
   `plitzi-workspace/e2e`).
3. A `CHANGELOG.md` entry and the version bump in `package.json` (`vX.Y.Z` commits). Entries explain the behaviour
   change in prose — what was wrong or missing, what it does now, what covers it.
4. `yarn typecheck`, `yarn lint`, `yarn test` green; `yarn build:dev` if a consumer reads the portal; README / website
   samples updated when the API changes (`npm run check:docs`).

## Code style

Same conventions as `plitzi-workspace` (`AGENTS.md` § Code Style there): Prettier 120 columns, single quotes, no
trailing commas, `arrowParens: avoid`; strict type-checked ESLint; `import type` for types; braces always; a blank
line after an `if` block and before `return`; comments only for a non-obvious WHY (the invariants above are exactly
those comments — keep them).
