import { useEffect } from 'react';
import { useUiStore } from '../store/uiStore';

/**
 * Handles presses that land away from what they would otherwise act on. Presses off every item
 * body deselect the active item; presses on any item body are ordinary interactions (expand,
 * tick, move), not dismissals, so only chrome and empty space ask to close an open editor.
 * Listens on `document` (not `window`) so it does not interfere with the drag-reorder
 * listener-count tests. Mounted once, in `Shell`, so it is live before the store finishes hydrating.
 */
export function useOutsidePress(): void {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      // Any open dialog owns the pointer: its backdrop is outside everything but changes nothing.
      if (document.querySelector('[role="dialog"]') !== null) return;
      const s = useUiStore.getState();
      const t = e.target;
      const el = t instanceof Element ? t : null;
      const insideItem = el !== null && el.closest('[data-item-body]') !== null;
      if (!insideItem && s.activeItemId !== null) s.setActive(null);
      if (s.openEditor === null) return;
      // A grip press is a move gesture, not a dismissal: the row it belongs to may be the one
      // being edited, and closing the editor underneath the pointer loses the draft. Chrome marked
      // [data-keeps-editor] (the settings wheel) opens something over the editor rather than instead of it.
      if (el !== null && el.closest('[data-editor-root], [data-editor-toggle], [data-drag-handle], [data-item-body], [data-keeps-editor]') !== null) return;
      s.requestClose();
      // The prompt mounts and focuses its Save button inside this very event; the compat mousedown
      // that follows would otherwise move focus to the pressed chrome (or the body). Cancelling the
      // pointerdown suppresses those compat mouse events.
      // Touch has no compat mouse events to suppress, and cancelling would stop the scroll.
      if (e.pointerType !== 'touch' && useUiStore.getState().pendingClose !== null) e.preventDefault();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);
}
