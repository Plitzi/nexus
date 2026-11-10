/** One measurement of a case on one side of one turn: its median over the turn's repetitions (`gate.ts`). */
export type CaseTime = { label: string; ms: number };

/** One turn: the base measured, then the head, one right after the other on the same runner. */
export type Turn = { base: ReadonlyMap<string, CaseTime>; head: ReadonlyMap<string, CaseTime> };

export type CaseVerdict =
  | { id: string; label: string; kind: 'new'; ms: number }
  | {
      id: string;
      label: string;
      kind: 'compared';
      /** The best of each side over the turns, for reading — the verdict is `change`. */
      base: number;
      head: number;
      /** The median over the turns of head ÷ base measured side by side, less one. */
      change: number;
      turns: number;
      tolerance: number;
      slower: boolean;
    }
  | { id: string; label: string; kind: 'untolerated'; ms: number };

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * What the gate says of each case of the head against its base: the one rule, apart from reading files and printing,
 * so it is tested (`gateVerdict.test.ts`).
 *
 * A case is judged by the median of its turns' ratios, each turn's base and head measured one after the other: a
 * runner loaded for a moment slows both sides of that turn, or one side of one turn — which the median outvotes. The
 * best of each side over the turns, compared alone, was decided by whichever side the load happened to land on: CI
 * failed changes that changed nothing.
 *
 * A case the base has not got is new — nothing to be slower than, held from the next change on. A compared case without
 * a tolerance fails: a case is held to one, or it is not held.
 */
export const gateVerdict = (
  turns: readonly Turn[],
  tolerances: Readonly<Record<string, number | undefined>>
): { cases: CaseVerdict[]; failures: string[]; slower: string[] } => {
  const cases: CaseVerdict[] = [];
  const failures: string[] = [];
  const slower: string[] = [];
  const ids = [...new Set(turns.flatMap(turn => [...turn.head.keys()]))];
  for (const id of ids) {
    const paired = turns.flatMap(({ base, head }) => {
      const before = base.get(id);
      const after = head.get(id);

      return before && after ? [{ before, after }] : [];
    });
    const label = turns.find(turn => turn.head.has(id))?.head.get(id)?.label ?? id;
    const heads = turns.flatMap(turn => {
      const time = turn.head.get(id);

      return time ? [time.ms] : [];
    });
    if (paired.length === 0) {
      cases.push({ id, label, kind: 'new', ms: Math.min(...heads) });
      continue;
    }

    const tolerance = tolerances[id];
    if (tolerance === undefined) {
      cases.push({ id, label, kind: 'untolerated', ms: Math.min(...heads) });
      failures.push(`${id}: no tolerance in tolerances.json — ${label}`);
      continue;
    }

    const change = median(paired.map(({ before, after }) => after.ms / before.ms)) - 1;
    const isSlower = change > tolerance;
    cases.push({
      id,
      label,
      kind: 'compared',
      base: Math.min(...paired.map(({ before }) => before.ms)),
      head: Math.min(...paired.map(({ after }) => after.ms)),
      change,
      turns: paired.length,
      tolerance,
      slower: isSlower
    });
    if (isSlower) {
      slower.push(id);
      failures.push(
        `${id}: ${(change * 100).toFixed(1)}% slower than its base over ${String(paired.length)} turns, past its ${String(Math.round(tolerance * 100))}% — ${label}`
      );
    }
  }

  return { cases, failures, slower };
};
