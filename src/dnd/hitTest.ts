import type { DropZone } from '../domain/place';

export interface RowRect {
  id: string;
  top: number; // page coordinates
  bottom: number; // page coordinates
}

export type RectReader = (el: HTMLElement) => { top: number; height: number };

export const defaultRectReader: RectReader = (el) => {
  const r = el.getBoundingClientRect();
  return { top: r.top, height: r.height };
};

export function resolveDropZone(pointerY: number, rect: { top: number; height: number }): DropZone {
  if (rect.height === 0) return 'inside';
  const offset = pointerY - rect.top;
  if (offset < rect.height * 0.25) return 'before';
  if (offset >= rect.height * 0.75) return 'after';
  return 'inside';
}

export function collectRowRects(root: HTMLElement, getRect: RectReader, scrollY: number): RowRect[] {
  const rows: RowRect[] = [];
  root.querySelectorAll<HTMLElement>('[data-todo-id]').forEach((el) => {
    const id = el.getAttribute('data-todo-id');
    if (id === null) return;
    const { top, height } = getRect(el);
    const pageTop = top + scrollY;
    rows.push({ id, top: pageTop, bottom: pageTop + height });
  });
  return rows;
}

export function hitTest(rows: RowRect[], pageY: number): { id: string; zone: DropZone } | null {
  for (const row of rows) {
    if (pageY >= row.top && pageY <= row.bottom) {
      return { id: row.id, zone: resolveDropZone(pageY, { top: row.top, height: row.bottom - row.top }) };
    }
  }
  return null;
}
