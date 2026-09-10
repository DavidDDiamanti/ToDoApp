import { describe, expect, it } from 'vitest';
import { buildChildrenMap, getAncestorIds, getDescendantIds, isDescendant, nextSortOrder } from './tree';
import { byId, mk } from '../test/fixtures';

const ids = (todos: { id: string }[] | undefined) => (todos ?? []).map((t) => t.id);

describe('buildChildrenMap', () => {
  it('puts items without a parent under the null key', () => {
    const map = buildChildrenMap([mk('a'), mk('b')]);
    expect(ids(map.get(null))).toEqual(['a', 'b']);
  });

  it('groups children under their parent', () => {
    const map = buildChildrenMap([mk('shop'), mk('shoes', 'shop'), mk('paint', 'shop')]);
    expect(ids(map.get('shop'))).toEqual(['shoes', 'paint']);
    expect(ids(map.get(null))).toEqual(['shop']);
  });

  it('sorts siblings by sort_order then created_at', () => {
    const late = mk('late', null, { sort_order: 1 });
    const early = mk('early', null, { sort_order: 0 });
    const tie = mk('tie', null, { sort_order: 0 });
    const map = buildChildrenMap([late, tie, early]);
    expect(ids(map.get(null))).toEqual(['early', 'tie', 'late']);
  });

  it('tie-breaks siblings by created_at instant, not string form', () => {
    const early = mk('early', null, { sort_order: 0, created_at: '2026-01-01T00:00:00+00:00' });
    const late = mk('late', null, { sort_order: 0, created_at: '2026-01-01T00:00:01.000Z' });
    const map = buildChildrenMap([late, early]);
    expect(ids(map.get(null))).toEqual(['early', 'late']);
  });

  it('excludes tombstoned items', () => {
    const map = buildChildrenMap([mk('a'), mk('gone', null, { deleted_at: '2026-01-01T00:00:00Z' })]);
    expect(ids(map.get(null))).toEqual(['a']);
  });

  it('treats items whose parent is missing or deleted as top level', () => {
    const map = buildChildrenMap([
      mk('orphan', 'nope'),
      mk('dead', null, { deleted_at: '2026-01-01T00:00:00Z' }),
      mk('child-of-dead', 'dead'),
    ]);
    expect(ids(map.get(null))).toEqual(['orphan', 'child-of-dead']);
  });
});

describe('getDescendantIds', () => {
  it('returns every descendant at any depth', () => {
    const map = buildChildrenMap([mk('a'), mk('b', 'a'), mk('c', 'b'), mk('d', 'a'), mk('x')]);
    expect(getDescendantIds(map, 'a').sort()).toEqual(['b', 'c', 'd']);
  });
  it('returns an empty list for a leaf', () => {
    const map = buildChildrenMap([mk('a')]);
    expect(getDescendantIds(map, 'a')).toEqual([]);
  });
  it('terminates on a cyclic parent chain and lists each node once', () => {
    const map = buildChildrenMap([mk('a', 'b'), mk('b', 'a'), mk('c', 'a')]);
    expect(getDescendantIds(map, 'a').sort()).toEqual(['b', 'c']);
  });
});

describe('getAncestorIds', () => {
  it('returns parents up to the root, nearest first', () => {
    const all = byId(mk('a'), mk('b', 'a'), mk('c', 'b'));
    expect(getAncestorIds(all, 'c')).toEqual(['b', 'a']);
  });
  it('stops at a deleted or missing parent', () => {
    const all = byId(mk('a', null, { deleted_at: '2026-01-01T00:00:00Z' }), mk('b', 'a'), mk('c', 'b'));
    expect(getAncestorIds(all, 'c')).toEqual(['b']);
  });
});

describe('isDescendant', () => {
  it('is true for a grandchild and false for a sibling or itself', () => {
    const map = buildChildrenMap([mk('a'), mk('b', 'a'), mk('c', 'b'), mk('s')]);
    expect(isDescendant(map, 'c', 'a')).toBe(true);
    expect(isDescendant(map, 's', 'a')).toBe(false);
    expect(isDescendant(map, 'a', 'a')).toBe(false);
  });
});

describe('nextSortOrder', () => {
  it('is 0 for an empty bucket and max + 1 otherwise', () => {
    const map = buildChildrenMap([mk('a', null, { sort_order: 2 }), mk('b', null, { sort_order: 5 })]);
    expect(nextSortOrder(map, null)).toBe(6);
    expect(nextSortOrder(map, 'a')).toBe(0);
  });
});
