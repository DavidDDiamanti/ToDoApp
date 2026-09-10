import type { Todo } from '../types';

export function newerThan(a: string, b: string): boolean {
  return Date.parse(a) > Date.parse(b);
}

/** Last-write-wins with a dirty-local guard. */
export function mergeRemote(local: Todo | undefined, localDirty: boolean, remote: Todo): Todo {
  if (local && localDirty && newerThan(local.updated_at, remote.updated_at)) return local;
  return remote;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function overlapSince(lastPulledAt: string | null, overlapMs = 60_000): string {
  const t = lastPulledAt === null ? NaN : Date.parse(lastPulledAt);
  if (Number.isNaN(t)) return new Date(0).toISOString();
  return new Date(t - overlapMs).toISOString();
}

export function maxUpdatedAt(rows: Todo[], current: string | null): string | null {
  const parsedCurrent = current === null ? NaN : Date.parse(current);
  let best: number | null = Number.isNaN(parsedCurrent) ? null : parsedCurrent;
  for (const r of rows) {
    const t = Date.parse(r.updated_at);
    if (best === null || t > best) best = t;
  }
  if (rows.length === 0) return current;
  if (best === null) return null;
  return new Date(best).toISOString();
}
