import { describe, expect, it, vi } from 'vitest';
import { collectRowRects, defaultRectReader, hitTest, resolveDropZone } from './hitTest';
import type { RectReader, RowRect } from './hitTest';

describe('resolveDropZone', () => {
  const rect = { top: 0, height: 44 };

  it.each([0, 10])('classifies offset %d as before', (y) => {
    expect(resolveDropZone(y, rect)).toBe('before');
  });

  it.each([11, 32])('classifies offset %d as inside', (y) => {
    expect(resolveDropZone(y, rect)).toBe('inside');
  });

  it.each([33, 43])('classifies offset %d as after', (y) => {
    expect(resolveDropZone(y, rect)).toBe('after');
  });

  it('treats a zero-height rect as inside', () => {
    expect(resolveDropZone(5, { top: 5, height: 0 })).toBe('inside');
  });

  it('measures the offset relative to rect.top', () => {
    expect(resolveDropZone(100, { top: 100, height: 44 })).toBe('before');
    expect(resolveDropZone(110, { top: 100, height: 44 })).toBe('before');
    expect(resolveDropZone(111, { top: 100, height: 44 })).toBe('inside');
    expect(resolveDropZone(132, { top: 100, height: 44 })).toBe('inside');
    expect(resolveDropZone(133, { top: 100, height: 44 })).toBe('after');
    expect(resolveDropZone(143, { top: 100, height: 44 })).toBe('after');
  });
});

describe('defaultRectReader', () => {
  it('reads top and height from getBoundingClientRect', () => {
    const el = document.createElement('div');
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      top: 12,
      height: 44,
      bottom: 56,
      left: 0,
      right: 0,
      width: 0,
      x: 0,
      y: 12,
      toJSON: () => ({}),
    });

    expect(defaultRectReader(el)).toEqual({ top: 12, height: 44 });
  });
});

describe('collectRowRects', () => {
  it('reads [data-todo-id] elements in document order and adds scrollY', () => {
    document.body.innerHTML = `
      <ul id="root">
        <li data-todo-id="a"></li>
        <li data-todo-id="b"></li>
        <li data-todo-id="c"></li>
      </ul>
    `;
    const root = document.getElementById('root');
    if (root === null) throw new Error('missing #root');

    const order = ['a', 'b', 'c'];
    const getRect: RectReader = (el) => {
      const id = el.getAttribute('data-todo-id') ?? '';
      return { top: order.indexOf(id) * 44, height: 44 };
    };

    expect(collectRowRects(root, getRect, 100)).toEqual<RowRect[]>([
      { id: 'a', top: 100, bottom: 144 },
      { id: 'b', top: 144, bottom: 188 },
      { id: 'c', top: 188, bottom: 232 },
    ]);
  });

  it('returns an empty array when the root has no rows', () => {
    document.body.innerHTML = '<ul id="root"></ul>';
    const root = document.getElementById('root');
    if (root === null) throw new Error('missing #root');

    expect(collectRowRects(root, defaultRectReader, 0)).toEqual([]);
  });
});

describe('hitTest', () => {
  const rows: RowRect[] = [
    { id: 'a', top: 0, bottom: 44 },
    { id: 'b', top: 100, bottom: 144 },
    { id: 'c', top: 144, bottom: 188 },
  ];

  it('picks the containing row along with its resolved zone', () => {
    expect(hitTest(rows, 5)).toEqual({ id: 'a', zone: 'before' });
    expect(hitTest(rows, 20)).toEqual({ id: 'a', zone: 'inside' });
    expect(hitTest(rows, 130)).toEqual({ id: 'b', zone: 'inside' });
    expect(hitTest(rows, 187)).toEqual({ id: 'c', zone: 'after' });
  });

  it('returns null above the first row', () => {
    expect(hitTest(rows, -10)).toBeNull();
  });

  it('returns null below the last row', () => {
    expect(hitTest(rows, 300)).toBeNull();
  });

  it('returns null in a gap between rows', () => {
    expect(hitTest(rows, 70)).toBeNull();
  });
});
