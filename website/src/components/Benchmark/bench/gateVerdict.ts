/** One measurement of a case: its best median over the turns (`gateCompare.ts`). */
export type CaseTime = { label: string; ms: number };

export type CaseVerdict =
  | { id: string; label: string; kind: 'new'; ms: number }
  | { id: string; label: string; kind: 'compared'; base: number; head: number; change: number; tolerance: number; slower: boolean }
  | { id: string; label: string; kind: 'untolerated'; ms: number };

/**
 * What the gate says of each case of the head against its base: the one rule, apart from reading files and printing,
 * so it is tested (`gateVerdict.test.ts`). A case the base has not got is new — nothing to be slower than, held from
 * the next change on: the 1.5.0 release added two and the gate failed on them. A compared case without a tolerance
 * fails: a case is held to one, or it is not held.
 */
export const gateVerdict = (
  base: ReadonlyMap<string, CaseTime>,
  head: ReadonlyMap<string, CaseTime>,
  tolerances: Readonly<Record<string, number | undefined>>
): { cases: CaseVerdict[]; failures: string[] } => {
  const cases: CaseVerdict[] = [];
  const failures: string[] = [];
  for (const [id, { label, ms }] of head) {
    const before = base.get(id);
    if (!before) {
      cases.push({ id, label, kind: 'new', ms });
      continue;
    }

    const tolerance = tolerances[id];
    if (tolerance === undefined) {
      cases.push({ id, label, kind: 'untolerated', ms });
      failures.push(`${id}: no tolerance in tolerances.json — ${label}`);
      continue;
    }

    const change = ms / before.ms - 1;
    const slower = change > tolerance;
    cases.push({ id, label, kind: 'compared', base: before.ms, head: ms, change, tolerance, slower });
    if (slower) {
      failures.push(
        `${id}: ${(change * 100).toFixed(1)}% slower than its base, past its ${String(Math.round(tolerance * 100))}% — ${label}`
      );
    }
  }

  return { cases, failures };
};
