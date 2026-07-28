# @plitzi/nexus — website

The marketing + docs landing page for [`@plitzi/nexus`](..). A Vite + React + Tailwind app
that **dogfoods the store straight from `../src`** — the live demos (path subscriptions, scoped
stores, batch, time-travel, async, persist, entities, intercept, middleware) all run against the real source.

## Dev

```bash
cd website
npm install
npm run dev
```

## Build

```bash
npm run build   # tsc + vite against source alias
```

The deploy CI also runs `npm run build` after installing root deps so tsc can follow the source alias to `../src`.

The prod build also sets `VITE_BASE=/nexus/` so GitHub Pages resolves scripts, styles and
assets under the right sub-path.

## How it works

`index.html` mounts a single React app. It is the same page for every route: hash-based routing
(`useHashRoute.ts`) switches between the landing sections (Features, API, Live Demo, Examples, Benchmarks,
Ecosystem) and the Docs sub-pages (`#/docs/getting-started`, `#/docs/api`, …).

It can run thanks to `resolve.dedupe: ['react', 'react-dom']` in `vite.config.ts` (@plitzi/nexus source and react-dom
both peer-depend on react; without dedupe Vite would bundle two React instances and hooks would silently break).

## Dogfooding the store from source

`vite.config.ts` aliases `@plitzi/nexus` and `@plitzi/nexus/*` to `../src`
so the live demos run against the actual store source — every edit to `src/` is immediately
reflected in the dev server.

The `tsconfig.json` has corresponding `paths` entries so TypeScript resolves the types from source too.
