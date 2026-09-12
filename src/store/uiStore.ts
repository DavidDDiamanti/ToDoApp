import { create, type StoreApi, type UseBoundStore } from 'zustand';

export type EditorKey = { kind: 'root' } | { kind: 'edit' | 'add'; id: string };

export interface UiState {
  activeItemId: string | null;
  openEditor: EditorKey | null;
  editorDirty: boolean;
  pendingClose: { next: EditorKey | null } | null;
  setActive(id: string | null): void;
  requestOpen(key: EditorKey): void;
  requestClose(): void;
  resolvePending(): void;
  confirmDiscard(): void;
  /** Forgets a remembered next editor that names this item (it is gone, so it cannot open). */
  dropNext(id: string): void;
  keepEditing(): void;
  setDirty(dirty: boolean): void;
  closeEditor(): void;
  reset(): void;
}

export function sameKey(a: EditorKey, b: EditorKey): boolean {
  if (a.kind === 'root' || b.kind === 'root') return a.kind === b.kind;
  return a.kind === b.kind && a.id === b.id;
}

export function editorKindFor(key: EditorKey | null, id: string): 'edit' | 'add' | null {
  if (key === null || key.kind === 'root') return null;
  return key.id === id ? key.kind : null;
}

const defaults = {
  activeItemId: null,
  openEditor: null,
  editorDirty: false,
  pendingClose: null,
} as const;

export function createUiStore(): UseBoundStore<StoreApi<UiState>> {
  return create<UiState>()((set, get) => ({
    ...defaults,
    setActive: (id) => set({ activeItemId: id }),
    requestOpen: (key) => {
      const { openEditor, editorDirty, pendingClose } = get();
      if (pendingClose !== null) return;
      if (openEditor === null) {
        set({ openEditor: key, editorDirty: false });
        return;
      }
      if (sameKey(openEditor, key)) {
        if (editorDirty) set({ pendingClose: { next: null } });
        else set({ openEditor: null });
        return;
      }
      if (editorDirty) set({ pendingClose: { next: key } });
      else set({ openEditor: key, editorDirty: false });
    },
    requestClose: () => {
      const { openEditor, editorDirty, pendingClose } = get();
      if (openEditor === null || pendingClose !== null) return;
      if (editorDirty) set({ pendingClose: { next: null } });
      else set({ openEditor: null });
    },
    /** Settles the prompt: the requested editor takes over, whether the draft was saved or thrown away. */
    resolvePending: () => {
      const { pendingClose } = get();
      if (pendingClose === null) return;
      set({ openEditor: pendingClose.next, editorDirty: false, pendingClose: null });
    },
    // Kept as a store-level alias of resolvePending; the app closes prompts through
    // resolvePendingEditor in actions.ts, which also reveals a remembered child editor.
    confirmDiscard: () => get().resolvePending(),
    keepEditing: () => set({ pendingClose: null }),
    dropNext: (id) => {
      const { pendingClose } = get();
      if (pendingClose === null || pendingClose.next === null || pendingClose.next.kind === 'root') return;
      if (pendingClose.next.id === id) set({ pendingClose: { next: null } });
    },
    setDirty: (dirty) => {
      const { openEditor, editorDirty } = get();
      if (openEditor === null || editorDirty === dirty) return;
      set({ editorDirty: dirty });
    },
    closeEditor: () => set({ openEditor: null, editorDirty: false, pendingClose: null }),
    reset: () => set({ ...defaults }),
  }));
}

export const useUiStore = createUiStore();
