import getByPath from '../../helpers/getByPath';

import type { FreshnessEvent, FreshnessListener, PathFreshness, PathOf } from '../../types';

const MAX_DELAY = 2 ** 31 - 1;

const isWithin = (path: string, prefix: string): boolean => path === prefix || path.startsWith(`${prefix}.`);

// When each path written with a `ttl` was written and when it stops being current. A record covers its whole subtree,
// so a read of `a.b.c` answers from the record at `a.b` when `a.b.c` has none of its own — the most specific record
// wins. Holds nothing until a write asks for a TTL, and every operation is a no-op on an empty registry, so a store
// that never uses one pays a single size check.
//
// Listeners hear every change of freshness: a record written, expired, elapsed or dropped. `elapsed` is the one that
// needs a clock, so a timer — one, for the next record to run out — exists only while somebody listens.
class FreshnessRegistry {
  private records = new Map<string, PathFreshness>();
  private listeners = new Set<FreshnessListener>();
  // Records whose running out was already announced (by `expire` or by the timer), so it is announced once.
  private announced = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private snapshot: Readonly<Record<string, PathFreshness>> | undefined;

  constructor(private readonly reportError: (error: unknown, path: string) => void) {}

  get size(): number {
    return this.records.size;
  }

  // A stable object between changes, so a devtools panel can back `useSyncExternalStore` with it.
  getRecords(): Readonly<Record<string, PathFreshness>> {
    this.snapshot ??= Object.fromEntries(this.records);

    return this.snapshot;
  }

  subscribe(listener: FreshnessListener): () => void {
    this.listeners.add(listener);
    this.schedule();

    return () => {
      this.listeners.delete(listener);
      this.schedule();
    };
  }

  // A write replaces the subtree it lands on, so the records below it described values that are gone.
  record(path: string, ttl: number, now: number, silent: boolean): void {
    this.drop(path, silent, false);
    const life = Math.max(0, ttl);
    const freshness = { updatedAt: now, expiresAt: now + life, ttl: life };
    this.records.set(path, freshness);
    this.announced.delete(path);
    this.changed();
    if (!silent) {
      this.emit({ path, type: 'recorded', freshness });
    }
  }

  // Forgets `path` and everything below it — the `unmount` counterpart, where the values themselves are gone.
  drop(path: string, silent: boolean, includeSelf = true): void {
    if (this.records.size === 0) {
      return;
    }

    for (const key of [...this.records.keys()]) {
      if (key === path ? includeSelf : key.startsWith(`${path}.`)) {
        this.forget(key, silent);
      }
    }
  }

  // Forgets every record whose value differs between two states — for a write that replaced more than one path.
  dropChanged<T extends object>(prev: T, next: T, silent: boolean): void {
    for (const key of [...this.records.keys()]) {
      // Recorded keys are paths some write to this state was given, the same cast `handleFallback` makes.
      if (getByPath(prev, key as PathOf<T>) !== getByPath(next, key as PathOf<T>)) {
        this.forget(key, silent);
      }
    }
  }

  get(path: string): PathFreshness | undefined {
    if (this.records.size === 0) {
      return undefined;
    }

    let candidate = path;
    for (;;) {
      const record = this.records.get(candidate);
      if (record) {
        return record;
      }

      const dot = candidate.lastIndexOf('.');
      if (dot === -1) {
        return undefined;
      }

      candidate = candidate.slice(0, dot);
    }
  }

  // Everything whose value `path` is part of goes stale: the records at and below it, and the ancestors whose
  // subtree contains it. Without a path, every record. Returns the paths it expired, and announces each one — an
  // already-stale record included, since being told again that its data changed is what an `expire` is for.
  expire(path: string | undefined, now: number): string[] {
    const expired: string[] = [];
    this.records.forEach((record, key) => {
      if (path !== undefined && !isWithin(key, path) && !isWithin(path, key)) {
        return;
      }

      if (record.expiresAt > now) {
        this.records.set(key, { ...record, expiresAt: now });
      }

      this.announced.add(key);
      expired.push(key);
    });

    if (expired.length > 0) {
      this.changed();
      for (const key of expired) {
        this.emit({ path: key, type: 'expired', freshness: this.records.get(key) });
      }
    }

    return expired;
  }

  private forget(key: string, silent: boolean): void {
    const freshness = this.records.get(key);
    this.records.delete(key);
    this.announced.delete(key);
    this.changed();
    if (!silent) {
      this.emit({ path: key, type: 'dropped', freshness });
    }
  }

  private changed(): void {
    this.snapshot = undefined;
    this.schedule();
  }

  private emit(event: FreshnessEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        this.reportError(error, event.path);
      }
    }
  }

  // Arms the timer for the next record to run out that nobody has been told about yet — or disarms it.
  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.listeners.size === 0) {
      return;
    }

    let next = Infinity;
    this.records.forEach((record, key) => {
      if (!this.announced.has(key) && record.expiresAt < next) {
        next = record.expiresAt;
      }
    });

    if (next === Infinity) {
      return;
    }

    // Clamped to what a timer can hold: a longer delay fires at once, and firing early only schedules again.
    this.timer = setTimeout(() => this.elapse(), Math.min(MAX_DELAY, Math.max(0, next - Date.now())));
  }

  private elapse(): void {
    const now = Date.now();
    const elapsed: string[] = [];
    this.records.forEach((record, key) => {
      if (!this.announced.has(key) && record.expiresAt <= now) {
        this.announced.add(key);
        elapsed.push(key);
      }
    });

    for (const key of elapsed) {
      this.emit({ path: key, type: 'elapsed', freshness: this.records.get(key) });
    }

    this.schedule();
  }
}

export default FreshnessRegistry;
