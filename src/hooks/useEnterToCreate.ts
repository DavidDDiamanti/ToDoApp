import { useEffect } from 'react';
import { useDragStore } from '../dnd/dragStore';
import { openAddUnder } from '../store/actions';
import { useUiStore } from '../store/uiStore';

/** Controls that own Enter themselves: activating them must not also create an item. */
const NATIVE = 'button, input, select, textarea, a, [contenteditable="true"]';

/**
 * True while Enter must not open anything: a dialog or prompt is up, an editor is already open,
 * or a drag is in progress. Shared with the title button, which handles its own Enter.
 */
export function enterBlocked(): boolean {
  if (document.querySelector('[role="dialog"]') !== null) return true;
  if (useDragStore.getState().draggingId !== null) return true;
  const s = useUiStore.getState();
  return s.openEditor !== null || s.pendingClose !== null;
}

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
      // A held key repeats; only the first press may open an editor, or the repeat would land in it.
      if (e.key !== 'Enter' || e.repeat || e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (enterBlocked()) return;
      const s = useUiStore.getState();
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
