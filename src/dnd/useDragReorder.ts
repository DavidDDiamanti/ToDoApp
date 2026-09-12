import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { dropToPlacement, type Placement } from '../domain/place';
import { getDescendantIds, type ChildrenMap } from '../domain/tree';
import { useDragStore } from './dragStore';
import { collectRowRects, defaultRectReader, hitTest, type RectReader, type RowRect } from './hitTest';

/** How far a mouse or pen may travel before the press counts as a drag rather than a click. */
const MOVE_THRESHOLD_PX = 6;
/** How long a finger must rest on the surface before the drag takes over from scrolling. */
const LONG_PRESS_MS = 350;

interface Options {
  rootRef: RefObject<HTMLElement | null>;
  getMap(): ChildrenMap;
  getRect?: RectReader;
  /** `target` is null when the pointer was over a row the item cannot go to. */
  onDrop(id: string, target: Placement | null): void;
}

export interface DragStarters {
  onHandlePointerDown(id: string, e: ReactPointerEvent<HTMLElement>): void;
  onSurfacePointerDown(id: string, e: ReactPointerEvent<HTMLElement>): void;
}

interface Session {
  id: string;
  pointerId: number;
  /** The grip activates at once; the surface waits for movement or a hold. */
  fromHandle: boolean;
  touch: boolean;
  startX: number;
  startY: number;
  /** False while the press is still pending, true once the drag owns the pointer. */
  active: boolean;
  timer: number | null;
  rows: RowRect[];
  blocked: Set<string>;
  onPointerMove(e: PointerEvent): void;
  onPointerUp(e: PointerEvent): void;
  onPointerCancel(e: PointerEvent): void;
  onKeyDown(e: KeyboardEvent): void;
  onWindowBlur(): void;
  onTouchMove: ((e: Event) => void) | null;
}

function movedPast(session: Session, clientX: number, clientY: number): boolean {
  return Math.hypot(clientX - session.startX, clientY - session.startY) > MOVE_THRESHOLD_PX;
}

/**
 * Pointer reordering. The grip starts a drag on pointer down; the rest of the item
 * surface starts one after 6 px of mouse movement or a 350 ms touch hold, so ordinary
 * clicks and page scrolling still work. Geometry is measured when the drag activates;
 * moves only write to the drag store, never to React state.
 */
export function useDragReorder(opts: Options): DragStarters {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const sessionRef = useRef<Session | null>(null);
  // Lives outside the session: it has to outlive the pointer up that fires it.
  const swallowClickRef = useRef<((e: MouseEvent) => void) | null>(null);

  const removeClickSwallower = useCallback(() => {
    const listener = swallowClickRef.current;
    if (listener === null) return;
    swallowClickRef.current = null;
    window.removeEventListener('click', listener, true);
  }, []);

  const finish = useCallback(
    (keepClickSwallower?: boolean) => {
      if (keepClickSwallower !== true) removeClickSwallower();
      const session = sessionRef.current;
      if (session === null) return;
      sessionRef.current = null;
      if (session.timer !== null) window.clearTimeout(session.timer);
      window.removeEventListener('pointermove', session.onPointerMove);
      window.removeEventListener('pointerup', session.onPointerUp);
      window.removeEventListener('pointercancel', session.onPointerCancel);
      window.removeEventListener('keydown', session.onKeyDown);
      window.removeEventListener('blur', session.onWindowBlur);
      if (session.onTouchMove !== null) window.removeEventListener('touchmove', session.onTouchMove);
      if (session.active) useDragStore.getState().end();
    },
    [removeClickSwallower],
  );

  useEffect(() => finish, [finish]);

  /** Takes the pointer over: measures the rows as they sit now and starts the drag. */
  const activate = useCallback(() => {
    const session = sessionRef.current;
    if (session === null || session.active) return;
    if (session.timer !== null) {
      window.clearTimeout(session.timer);
      session.timer = null;
    }
    const root = optsRef.current.rootRef.current;
    if (root === null) {
      finish();
      return;
    }
    session.rows = collectRowRects(root, optsRef.current.getRect ?? defaultRectReader, window.scrollY);
    session.blocked = new Set<string>([session.id, ...getDescendantIds(optsRef.current.getMap(), session.id)]);
    session.active = true;
    useDragStore.getState().start(session.id);
    if (session.fromHandle) return;

    // The browser fires a click on release: without this it would toggle the details
    // of the row that was just dragged.
    removeClickSwallower();
    const onClick = (ev: MouseEvent) => {
      removeClickSwallower();
      ev.stopPropagation();
      ev.preventDefault();
    };
    swallowClickRef.current = onClick;
    window.addEventListener('click', onClick, true);

    if (!session.touch) return;
    const onTouchMove = (ev: Event) => ev.preventDefault();
    session.onTouchMove = onTouchMove;
    window.addEventListener('touchmove', onTouchMove, { passive: false });
  }, [finish, removeClickSwallower]);

  const begin = useCallback(
    (id: string, e: ReactPointerEvent<HTMLElement>, fromHandle: boolean) => {
      if (e.button !== 0) return;
      if (sessionRef.current !== null) return;
      if (optsRef.current.rootRef.current === null) return;

      const pointerId = e.pointerId;
      const targetAt = (clientY: number) => {
        const session = sessionRef.current;
        if (session === null) return null;
        const hit = hitTest(session.rows, clientY + window.scrollY);
        return hit !== null && !session.blocked.has(hit.id) ? hit : null;
      };

      const onPointerMove = (ev: PointerEvent) => {
        const session = sessionRef.current;
        if (session === null) return;
        if (ev.pointerId !== pointerId) return;
        // No button left down: the mouse was released outside the window, so no pointerup is coming.
        if (ev.pointerType === 'mouse' && ev.buttons === 0) {
          finish();
          return;
        }
        if (!session.active) {
          if (!movedPast(session, ev.clientX, ev.clientY)) return;
          // A finger that travels before the hold completes is scrolling, not dragging.
          if (session.touch) {
            finish();
            return;
          }
          activate();
          if (sessionRef.current === null) return;
        }
        const hit = targetAt(ev.clientY);
        useDragStore.getState().setIndicator(hit === null ? null : { targetId: hit.id, zone: hit.zone });
      };
      const onPointerUp = (ev: PointerEvent) => {
        const session = sessionRef.current;
        if (session === null) return;
        if (ev.pointerId !== pointerId) return;
        if (session.active) {
          const hit = hitTest(session.rows, ev.clientY + window.scrollY);
          // A release over the dragged row itself (a plain click on the grip) is not a drop attempt.
          if (hit !== null && hit.id !== id) {
            const target = session.blocked.has(hit.id) ? null : dropToPlacement(optsRef.current.getMap(), id, hit.id, hit.zone);
            optsRef.current.onDrop(id, target);
          }
        }
        // The click swallower has to survive this: its click has not been dispatched yet.
        finish(true);
      };
      const onPointerCancel = (ev: PointerEvent) => {
        if (sessionRef.current === null) return;
        if (ev.pointerId !== pointerId) return;
        finish();
      };
      const onKeyDown = (ev: KeyboardEvent) => {
        const session = sessionRef.current;
        if (session === null) return;
        if (ev.key !== 'Escape') return;
        if (session.active) {
          ev.stopPropagation();
          ev.preventDefault();
        }
        finish();
      };
      const onWindowBlur = () => {
        if (sessionRef.current === null) return;
        finish();
      };

      sessionRef.current = {
        id,
        pointerId,
        fromHandle,
        touch: e.pointerType === 'touch',
        startX: e.clientX,
        startY: e.clientY,
        active: false,
        timer: null,
        rows: [],
        blocked: new Set<string>(),
        onPointerMove,
        onPointerUp,
        onPointerCancel,
        onKeyDown,
        onWindowBlur,
        onTouchMove: null,
      };
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerCancel);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('blur', onWindowBlur);

      if (fromHandle) {
        activate();
        return;
      }
      if (sessionRef.current.touch) sessionRef.current.timer = window.setTimeout(activate, LONG_PRESS_MS);
    },
    [activate, finish],
  );

  const onHandlePointerDown = useCallback((id: string, e: ReactPointerEvent<HTMLElement>) => begin(id, e, true), [begin]);
  const onSurfacePointerDown = useCallback((id: string, e: ReactPointerEvent<HTMLElement>) => begin(id, e, false), [begin]);

  return { onHandlePointerDown, onSurfacePointerDown };
}
