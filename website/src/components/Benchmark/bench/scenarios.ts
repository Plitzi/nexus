import { jotaiAdapter } from './jotaiStore';
import { mobxAdapter } from './mobxStore';
import { naiveAdapter } from './naiveStore';
import { pagesMoving, pathsRotating } from './pathCaches';
import { reduxAdapter } from './reduxStore';
import { sdkAdapter } from './sdkStore';
import { guardSink, resetSink } from './shared';
import { valtioAdapter } from './valtioStore';
import { zustandAdapter } from './zustandStore';

import type { BenchmarkResult, LibResult, Sample, ScenarioResult, StoreAdapter } from './shared';

const ADAPTERS: StoreAdapter[] = [
  sdkAdapter,
  zustandAdapter,
  jotaiAdapter,
  reduxAdapter,
  mobxAdapter,
  valtioAdapter,
  naiveAdapter
];

type ScenarioConfig = {
  id: string;
  label: string;
  description: string;
  warmup: (adapter: StoreAdapter) => void;
  run: (adapter: StoreAdapter) => Sample;
};

const SCENARIOS: ScenarioConfig[] = [
  {
    id: 'wide',
    label: 'Wide state · 2,000 values, update 1',
    description: 'Atom stores touch only the changed cell; a single immutable tree must copy every sibling.',
    warmup: adapter => void adapter.wide(500, 50),
    run: adapter => adapter.wide(2000, 100)
  },
  {
    id: 'hot',
    label: 'Hot value · 1,000 subscribers, 60 updates',
    description: 'One value, many watchers — everyone must wake. A fair test of raw notification throughput.',
    warmup: adapter => void adapter.hot(200, 20),
    run: adapter => adapter.hot(1000, 60)
  },
  {
    id: 'nested',
    label: 'Nested state · 3,000 deep-leaf updates',
    description: 'A realistic shape: every store copies only the changed path, so all are competitive.',
    warmup: adapter => void adapter.nested(500),
    run: adapter => adapter.nested(3000)
  },
  {
    id: 'churn',
    label: 'Churn · 10,000 writes to one value',
    description: 'Raw per-update throughput: tiny store, a single subscriber, a flood of writes.',
    warmup: adapter => void adapter.churn(2000),
    run: adapter => adapter.churn(10000)
  },
  {
    id: 'deepMap',
    label: 'Normalized map · 2,000 items, update 1 nested leaf',
    description:
      'The real shape of app state (an entities map). Immutable stores copy the whole map per edit; atom and proxy stores touch only the item.',
    warmup: adapter => void adapter.deepMap(500, 20),
    run: adapter => adapter.deepMap(2000, 100)
  },
  {
    id: 'fanout',
    label: 'Fan-out · 100 keys × 20 rounds, one watcher each',
    description: 'A broad write burst: every key changes and wakes its own watcher. Tests write + dispatch volume.',
    warmup: adapter => void adapter.fanout(40, 5),
    run: adapter => adapter.fanout(100, 20)
  },
  {
    id: 'derived',
    label: 'Derived · sum of 2,000 inputs, update 1 input ×200',
    description:
      'A memoized computed value (reselect / Jotai derived atom / MobX computed / sdk createDerived). One input changes each tick, the derived recomputes and its single subscriber wakes only when the result changes.',
    warmup: adapter => void adapter.derived(500, 20),
    run: adapter => adapter.derived(2000, 200)
  },
  {
    id: 'liveFeed',
    label: 'Live feed · 2,000 rows, 500 streamed updates',
    description:
      'A live dashboard / data feed: 500 writes land on many distinct rows across a large collection, each row watched. Fine-grained stores touch one row; a single immutable tree copies the whole collection on every write.',
    warmup: adapter => void adapter.liveFeed(500, 100),
    run: adapter => adapter.liveFeed(2000, 500)
  },
  {
    id: 'selection',
    label: 'Selection · 2,000 rows, move selection 200×',
    description:
      'Moving the current selection in a large list or editor. A per-item flag wakes only the two affected rows (O(1)); a central selectedId with one selector per row re-checks every row on each move (O(rows)).',
    warmup: adapter => void adapter.selection(500, 50),
    run: adapter => adapter.selection(2000, 200)
  }
];

/** nexus's own cases, which no other store has a counterpart of: measured by the gate alone (`runNexusOnly`). */
const NEXUS_SCENARIOS: { id: string; label: string; warmup: () => void; run: () => Sample }[] = [
  {
    id: 'pagesMoving',
    label: 'Pages moved through · 20 new pages of 1,000 paths, each read 5×',
    warmup: () => void pagesMoving(4, 1000, 2),
    run: () => pagesMoving(20, 1000, 5)
  },
  {
    id: 'pathsInRotation',
    label: 'Paths read in rotation · 10,000, 5 rounds',
    warmup: () => void pathsRotating(10_000, 1),
    run: () => pathsRotating(10_000, 5)
  }
];

// Repeats a measurement and reports the median (robust to GC/JIT spikes) plus the best run. A single timed pass is
// what makes benchmark numbers swing between clicks — repeating and taking the median makes them reproducible.
const measure = (run: () => Sample, reps: number): LibResult => {
  const samples: number[] = [];
  let last: Sample | undefined;
  for (let r = 0; r < reps; r++) {
    last = run();
    samples.push(last.ms);
  }

  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];

  return { name: last?.name ?? '', wakes: last?.wakes ?? 0, ms: median, min: samples[0] };
};

// Runs every scenario against all four stores. Each store is warmed first so JIT compilation doesn't skew the timed
// passes, then measured `reps` times.
export function runBenchmark(reps = 5): BenchmarkResult {
  resetSink();

  for (const scenario of SCENARIOS) {
    for (const adapter of ADAPTERS) {
      scenario.warmup(adapter);
    }
  }

  const scenarios = SCENARIOS.map(scenario => ({
    id: scenario.id,
    label: scenario.label,
    description: scenario.description,
    results: ADAPTERS.map(adapter => measure(() => scenario.run(adapter), reps))
  }));

  guardSink();

  return { scenarios };
}

/**
 * nexus alone, each scenario's median of `reps` — what the CI gate compares between a change and its base on one
 * runner (`gate.ts`). The other stores are left out: they do not change with this repository, and they are most of the
 * time a full run takes.
 */
export function runNexusOnly(reps = 15): { id: string; label: string; ms: number }[] {
  resetSink();
  for (const scenario of SCENARIOS) {
    scenario.warmup(sdkAdapter);
  }

  const results = SCENARIOS.map(scenario => ({
    id: scenario.id,
    label: scenario.label,
    ms: measure(() => scenario.run(sdkAdapter), reps).ms
  }));
  // After the others, each warmed up just before it is measured: the path caches are the process's, and their thousands
  // of paths would be in the caches the others are measured with — or one's in the other's.
  for (const scenario of NEXUS_SCENARIOS) {
    scenario.warmup();
    results.push({ id: scenario.id, label: scenario.label, ms: measure(scenario.run, reps).ms });
  }
  guardSink();

  return results;
}

// Same workloads, but emits each scenario as it finishes so a worker can stream progress to the UI. Warms every
// store first (so JIT compilation doesn't skew the first timed scenario), then measures one scenario at a time.
export function runBenchmarkStreaming(reps: number, onScenario: (scenario: ScenarioResult) => void): void {
  resetSink();

  for (const scenario of SCENARIOS) {
    for (const adapter of ADAPTERS) {
      scenario.warmup(adapter);
    }
  }

  for (const scenario of SCENARIOS) {
    onScenario({
      id: scenario.id,
      label: scenario.label,
      description: scenario.description,
      results: ADAPTERS.map(adapter => measure(() => scenario.run(adapter), reps))
    });
  }

  guardSink();
}
