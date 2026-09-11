import { create } from 'zustand';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { DropZone } from '../domain/place';

export interface DragState {
  draggingId: string | null;
  indicator: { targetId: string; zone: DropZone } | null;
  announcement: { text: string; seq: number };
  focusId: string | null;
  start(id: string): void;
  setIndicator(next: { targetId: string; zone: DropZone } | null): void;
  end(): void;
  announce(text: string): void;
  requestFocus(id: string | null): void;
}

function sameIndicator(a: DragState['indicator'], b: DragState['indicator']): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return a.targetId === b.targetId && a.zone === b.zone;
}

export function createDragStore(): UseBoundStore<StoreApi<DragState>> {
  return create<DragState>()((set, get) => ({
    draggingId: null,
    indicator: null,
    announcement: { text: '', seq: 0 },
    focusId: null,
    start(id) {
      set({ draggingId: id });
    },
    setIndicator(next) {
      if (sameIndicator(get().indicator, next)) return;
      set({ indicator: next });
    },
    end() {
      set({ draggingId: null, indicator: null });
    },
    announce(text) {
      set((s) => ({ announcement: { text, seq: s.announcement.seq + 1 } }));
    },
    requestFocus(id) {
      set({ focusId: id });
    },
  }));
}

export const useDragStore = createDragStore();
