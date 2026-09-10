import { describe, expect, it } from 'vitest';
import { chunk, maxUpdatedAt, mergeRemote, newerThan, overlapSince } from './syncEngine';
import { mk } from '../test/fixtures';

describe('newerThan', () => {
  it('compares instants, not strings, so Z and +00:00 forms agree', () => {
    expect(newerThan('2026-09-10T10:00:01.000Z', '2026-09-10T10:00:00+00:00')).toBe(true);
    expect(newerThan('2026-09-10T10:00:00+00:00', '2026-09-10T10:00:00.000Z')).toBe(false);
  });
});

describe('mergeRemote', () => {
  const remote = mk('a', null, { title: 'remote', updated_at: '2026-09-10T10:00:05.000Z' });
  it('takes the remote row when there is no local copy', () => {
    expect(mergeRemote(undefined, false, remote)).toBe(remote);
  });
  it('takes the remote row when local is clean, even if local looks newer', () => {
    const local = mk('a', null, { title: 'local', updated_at: '2026-09-10T10:00:09.000Z' });
    expect(mergeRemote(local, false, remote)).toBe(remote);
  });
  it('keeps a dirty local row that is newer than remote', () => {
    const local = mk('a', null, { title: 'local', updated_at: '2026-09-10T10:00:09.000Z' });
    expect(mergeRemote(local, true, remote)).toBe(local);
  });
  it('takes remote over a dirty local row that is older', () => {
    const local = mk('a', null, { title: 'local', updated_at: '2026-09-10T10:00:01.000Z' });
    expect(mergeRemote(local, true, remote)).toBe(remote);
  });
});

describe('chunk', () => {
  it('splits into fixed-size groups', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });
});

describe('overlapSince', () => {
  it('starts from the epoch when nothing was pulled', () => {
    expect(overlapSince(null)).toBe('1970-01-01T00:00:00.000Z');
  });
  it('subtracts the overlap window', () => {
    expect(overlapSince('2026-09-10T10:01:00.000Z', 60_000)).toBe('2026-09-10T10:00:00.000Z');
  });
  it('falls back to the epoch for an unparsable lastPulledAt', () => {
    expect(overlapSince('garbage')).toBe('1970-01-01T00:00:00.000Z');
  });
});

describe('maxUpdatedAt', () => {
  it('returns the latest instant among rows and the current value, normalised to ISO Z', () => {
    const rows = [mk('a', null, { updated_at: '2026-09-10T10:00:00+00:00' }), mk('b', null, { updated_at: '2026-09-10T10:00:02+00:00' })];
    expect(maxUpdatedAt(rows, '2026-09-10T10:00:01.000Z')).toBe('2026-09-10T10:00:02.000Z');
    expect(maxUpdatedAt([], 'x')).toBe('x');
  });
  it('ignores an unparsable current value instead of throwing', () => {
    const rows = [mk('a', null, { updated_at: '2026-09-10T10:00:00.000Z' })];
    expect(maxUpdatedAt(rows, 'not-a-date')).toBe('2026-09-10T10:00:00.000Z');
    expect(maxUpdatedAt([], 'not-a-date')).toBe('not-a-date');
  });
});
