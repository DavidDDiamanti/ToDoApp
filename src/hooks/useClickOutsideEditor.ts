import { useEffect } from 'react';
import { useUiStore } from '../store/uiStore';

/**
 * Closes the open editor when the user presses outside it. Listens on `document`
 * (not `window`) so it does not interfere with the drag-reorder listener-count tests.
 * Mounted once, in `Shell`, so it is live before the store finishes hydrating.
 */
export function useClickOutsideEditor(): void {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const s = useUiStore.getState();
      if (s.openEditor === null) return;
      // Any open dialog owns the pointer: its backdrop is outside the editor but must not close it.
      if (document.querySelector('[role="dialog"]') !== null) return;
      const t = e.target;
      // A grip press is a move gesture, not a dismissal: the row it belongs to may be the one
      // being edited, and closing the editor underneath the pointer loses the draft.
      if (t instanceof Element && t.closest('[data-editor-root], [data-editor-toggle], [data-drag-handle], [role="dialog"]') !== null) return;
      s.requestClose();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);
}
