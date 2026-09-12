import { useEffect } from 'react';
import { useDragStore } from '../dnd/dragStore';
import { openAddUnder } from '../store/actions';
import { useUiStore } from '../store/uiStore';

/** Controls that own Enter themselves: activating them must not also create an item. */
const NATIVE = 'button, input, select, textarea, a, [contenteditable="true"]';

/**
 * Routes a bare Enter press to the editor it should open: the child editor of the selected item,
 * or the root "New item" editor when nothing is selected. Ignored while an editor, a discard
 * prompt or a dialog is open, during a drag, and whenever the press belongs to a native control.
 * Listens on `document` (not `window`) so it does not interfere with the drag-reorder
 * listener-count tests. Mounted once, in `Shell`.
 */
export function useEnterToCreate(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (document.querySelector('[role="dialog"]') !== null) return;
      if (useDragStore.getState().draggingId !== null) return;
      const s = useUiStore.getState();
      if (s.openEditor !== null || s.pendingClose !== null) return;
      const t = e.target;
      if (t instanceof Element && t.closest(NATIVE) !== null) return;
      e.preventDefault();
      if (s.activeItemId !== null) openAddUnder(s.activeItemId);
      else s.requestOpen({ kind: 'root' });
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
}
