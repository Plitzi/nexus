import { describe, expect, it } from 'vitest';

import { gateVerdict } from './gateVerdict';

import type { Turn } from './gateVerdict';

const side = (entries: Record<string, number>) =>
  new Map(Object.entries(entries).map(([id, ms]) => [id, { label: id, ms }]));
const turn = (base: Record<string, number>, head: Record<string, number>): Turn => ({
  base: side(base),
  head: side(head)
});

describe('the benchmark gate', () => {
  it('fails a case slower than its base past its tolerance, and passes one within it', () => {
    const turns = [turn({ hot: 10, nested: 10 }, { hot: 11.4, nested: 11.6 })];
    const { cases, failures, slower } = gateVerdict(turns, { hot: 0.15, nested: 0.15 });

    expect(cases.map(verdict => (verdict.kind === 'compared' ? verdict.slower : verdict.kind))).toEqual([false, true]);
    expect(slower).toEqual(['nested']);
    expect(failures).toEqual(['nested: 16.0% slower than its base over 1 turns, past its 15% — nested']);
  });

  // CI, 2026-11-10: a loaded runner slowed the head's side of one turn, and a change that changed nothing failed.
  it('is not decided by one turn the runner was loaded on', () => {
    const turns = [
      turn({ nested: 10 }, { nested: 10.2 }),
      turn({ nested: 10 }, { nested: 14 }),
      turn({ nested: 10.1 }, { nested: 10 })
    ];

    expect(gateVerdict(turns, { nested: 0.15 }).failures).toEqual([]);
  });

  // The other way the best-of failed: the base's best turn ran on an idle moment, the head's never did.
  it('compares the two sides of each turn, not the best of each side', () => {
    const turns = [
      turn({ hot: 6 }, { hot: 6.1 }),
      turn({ hot: 8 }, { hot: 8.1 }),
      turn({ hot: 8.2 }, { hot: 8.1 })
    ];

    expect(gateVerdict(turns, { hot: 0.15 }).failures).toEqual([]);
  });

  it('fails what every turn finds slower', () => {
    const turns = [turn({ hot: 10 }, { hot: 13 }), turn({ hot: 11 }, { hot: 14 }), turn({ hot: 10 }, { hot: 12.5 })];

    expect(gateVerdict(turns, { hot: 0.15 }).slower).toEqual(['hot']);
  });

  // The 1.5.0 release added two cases, and the gate failed on them: "not measured on the base".
  it('says a case the base has not got is new, and does not fail on it', () => {
    const { cases, failures } = gateVerdict([turn({ hot: 10 }, { hot: 10, pagesMoving: 23 })], {
      hot: 0.15,
      pagesMoving: 0.15
    });

    expect(cases.find(verdict => verdict.id === 'pagesMoving')).toMatchObject({ kind: 'new', ms: 23 });
    expect(failures).toEqual([]);
  });

  it('fails a compared case that has no tolerance: a case is held to one, or it is not held', () => {
    expect(gateVerdict([turn({ hot: 10 }, { hot: 10 })], {}).failures).toEqual([
      'hot: no tolerance in tolerances.json — hot'
    ]);
  });

  it('never fails for a case the head dropped', () => {
    expect(gateVerdict([turn({ hot: 10, gone: 5 }, { hot: 10 })], { hot: 0.15 }).failures).toEqual([]);
  });
});
