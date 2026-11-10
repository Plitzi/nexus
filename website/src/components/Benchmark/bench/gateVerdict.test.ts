import { describe, expect, it } from 'vitest';

import { gateVerdict } from './gateVerdict';

const times = (entries: Record<string, number>) =>
  new Map(Object.entries(entries).map(([id, ms]) => [id, { label: id, ms }]));

describe('the benchmark gate', () => {
  it('fails a case slower than its base past its tolerance, and passes one within it', () => {
    const { cases, failures } = gateVerdict(
      times({ hot: 10, nested: 10 }),
      times({ hot: 11.4, nested: 11.6 }),
      { hot: 0.15, nested: 0.15 }
    );

    expect(cases.map(verdict => (verdict.kind === 'compared' ? verdict.slower : verdict.kind))).toEqual([false, true]);
    expect(failures).toEqual(['nested: 16.0% slower than its base, past its 15% — nested']);
  });

  // The 1.5.0 release added two cases, and the gate failed on them: "not measured on the base".
  it('says a case the base has not got is new, and does not fail on it', () => {
    const { cases, failures } = gateVerdict(times({ hot: 10 }), times({ hot: 10, pagesMoving: 23 }), {
      hot: 0.15,
      pagesMoving: 0.15
    });

    expect(cases.find(verdict => verdict.id === 'pagesMoving')).toMatchObject({ kind: 'new', ms: 23 });
    expect(failures).toEqual([]);
  });

  it('fails a compared case that has no tolerance: a case is held to one, or it is not held', () => {
    const { failures } = gateVerdict(times({ hot: 10 }), times({ hot: 10 }), {});

    expect(failures).toEqual(['hot: no tolerance in tolerances.json — hot']);
  });

  it('never fails for a case the head dropped', () => {
    expect(gateVerdict(times({ hot: 10, gone: 5 }), times({ hot: 10 }), { hot: 0.15 }).failures).toEqual([]);
  });
});
