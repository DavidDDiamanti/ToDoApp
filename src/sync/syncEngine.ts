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
  if (lastPulledAt === null) return new Date(0).toISOString();
  return new Date(Date.parse(lastPulledAt) - overlapMs).toISOString();
}

export function maxUpdatedAt(rows: Todo[], current: string | null): string | null {
  let best = current === null ? null : Date.parse(current);
  for (const r of rows) {
    const t = Date.parse(r.updated_at);
    if (best === null || t > best) best = t;
  }
  if (best === null) return null;
  if (rows.length === 0) return current;
  return new Date(best).toISOString();
}
