import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { createMemoryStorage } from './storage';

export type Theme = 'system' | 'light' | 'dark';
export type Gap = 'small' | 'medium' | 'large';

/** Multiples of the v4 --gap-item (6px): 4.2px, 6px, 7.8px. */
export const GAP_SCALE: Record<Gap, number> = { small: 0.7, medium: 1, large: 1.3 };

export interface PersistedSettingsState {
  theme: Theme;
  gap: Gap;
}

export interface SettingsState extends PersistedSettingsState {
  setTheme(theme: Theme): void;
  setGap(gap: Gap): void;
  reset(): void;
}

const DEFAULTS: PersistedSettingsState = { theme: 'system', gap: 'medium' };

function isTheme(v: unknown): v is Theme {
  return v === 'system' || v === 'light' || v === 'dark';
}

function isGap(v: unknown): v is Gap {
  return v === 'small' || v === 'medium' || v === 'large';
}

/** 'system' is the only theme that asks the device; the other two are explicit overrides. */
export function resolveTheme(theme: Theme, systemDark: boolean): 'light' | 'dark' {
  if (theme === 'system') return systemDark ? 'dark' : 'light';
  return theme;
}

/**
 * Storage that never throws: a browser with storage disabled or over quota (Safari private mode
 * throws on setItem) must still let the settings change in memory for the session.
 */
export function safeStorage(storage: StateStorage): StateStorage {
  return {
    getItem: (name) => {
      try {
        return storage.getItem(name);
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        return storage.setItem(name, value);
      } catch {
        return undefined;
      }
    },
    removeItem: (name) => {
      try {
        return storage.removeItem(name);
      } catch {
        return undefined;
      }
    },
  };
}

export function createSettingsStore(storage: StateStorage) {
  return create<SettingsState>()(
    persist(
      (set) => ({
        ...DEFAULTS,
        setTheme: (theme) => set({ theme }),
        setGap: (gap) => set({ gap }),
        reset: () => set({ ...DEFAULTS }),
      }),
      {
        name: 'todo-settings',
        storage: createJSONStorage(() => storage),
        partialize: (s) => ({ theme: s.theme, gap: s.gap }),
        // Anything the inline bootstrap script or a stale build could have written is
        // untrusted: each field falls back to its default unless it is a known literal.
        merge: (persisted, current) => {
          const p = (persisted ?? {}) as Partial<Record<keyof PersistedSettingsState, unknown>>;
          return {
            ...current,
            theme: isTheme(p.theme) ? p.theme : DEFAULTS.theme,
            gap: isGap(p.gap) ? p.gap : DEFAULTS.gap,
          };
        },
      },
    ),
  );
}

// localStorage is synchronous, so this store is hydrated before the first render:
// no hydration flag and no flash of the default theme. (The memory fallback keeps
// the module importable where there is no DOM; it rehydrates asynchronously, but
// nothing is persisted there anyway.)
export const useSettingsStore = createSettingsStore(
  safeStorage(typeof localStorage === 'undefined' ? createMemoryStorage() : localStorage),
);
