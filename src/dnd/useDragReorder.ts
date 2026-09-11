import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { dropToPlacement, type Placement } from '../domain/place';
import { getDescendantIds, type ChildrenMap } from '../domain/tree';
import { useDragStore } from './dragStore';
import { collectRowRects, defaultRectReader, hitTest, type RectReader, type RowRect } from './hitTest';

interface Options {
  rootRef: RefObject<HTMLElement | null>;
  getMap(): ChildrenMap;
  getRect?: RectReader;
  /** `target` is null when the pointer was over a row the item cannot go to. */
  onDrop(id: string, target: Placement | null): void;
}

interface Session {
  id: string;
  pointerId: number;
  rows: RowRect[];
  blocked: Set<string>;
  onPointerMove(e: PointerEvent): void;
  onPointerUp(e: PointerEvent): void;
  onPointerCancel(e: PointerEvent): void;
  onKeyDown(e: KeyboardEvent): void;
  onWindowBlur(): void;
}

/**
 * Pointer reordering driven from the grip handle. Geometry is measured once on
 * pointer down; moves only write to the drag store, never to React state.
 */
export function useDragReorder(opts: Options): { onHandlePointerDown(id: string, e: ReactPointerEvent<HTMLElement>): void } {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const sessionRef = useRef<Session | null>(null);

  const finish = useCallback(() => {
    const session = sessionRef.current;
    if (session === null) return;
    sessionRef.current = null;
    window.removeEventListener('pointermove', session.onPointerMove);
    window.removeEventListener('pointerup', session.onPointerUp);
    window.removeEventListener('pointercancel', session.onPointerCancel);
    window.removeEventListener('keydown', session.onKeyDown);
    window.removeEventListener('blur', session.onWindowBlur);
    useDragStore.getState().end();
  }, []);

  useEffect(() => finish, [finish]);

  const onHandlePointerDown = useCallback(
    (id: string, e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      if (sessionRef.current !== null) return;
      const root = optsRef.current.rootRef.current;
      if (root === null) return;

      const pointerId = e.pointerId;
      const rows = collectRowRects(root, optsRef.current.getRect ?? defaultRectReader, window.scrollY);
      const blocked = new Set<string>([id, ...getDescendantIds(optsRef.current.getMap(), id)]);

      const targetAt = (clientY: number) => {
        const hit = hitTest(rows, clientY + window.scrollY);
        return hit !== null && !blocked.has(hit.id) ? hit : null;
      };

      const onPointerMove = (ev: PointerEvent) => {
        if (sessionRef.current === null) return;
        if (ev.pointerId !== pointerId) return;
        // No button left down: the mouse was released outside the window, so no pointerup is coming.
        if (ev.pointerType === 'mouse' && ev.buttons === 0) {
          finish();
          return;
        }
        const hit = targetAt(ev.clientY);
        useDragStore.getState().setIndicator(hit === null ? null : { targetId: hit.id, zone: hit.zone });
      };
      const onPointerUp = (ev: PointerEvent) => {
        if (sessionRef.current === null) return;
        if (ev.pointerId !== pointerId) return;
        const hit = hitTest(rows, ev.clientY + window.scrollY);
        if (hit !== null) {
          const target = blocked.has(hit.id) ? null : dropToPlacement(optsRef.current.getMap(), id, hit.id, hit.zone);
          optsRef.current.onDrop(id, target);
        }
        finish();
      };
      const onPointerCancel = (ev: PointerEvent) => {
        if (sessionRef.current === null) return;
        if (ev.pointerId !== pointerId) return;
        finish();
      };
      const onKeyDown = (ev: KeyboardEvent) => {
        if (sessionRef.current === null) return;
        if (ev.key !== 'Escape') return;
        ev.stopPropagation();
        ev.preventDefault();
        finish();
      };
      const onWindowBlur = () => {
        if (sessionRef.current === null) return;
        finish();
      };

      sessionRef.current = { id, pointerId, rows, blocked, onPointerMove, onPointerUp, onPointerCancel, onKeyDown, onWindowBlur };
      useDragStore.getState().start(id);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerCancel);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('blur', onWindowBlur);
    },
    [finish],
  );

  return { onHandlePointerDown };
}
