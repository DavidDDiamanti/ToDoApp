import { describe, expect, it } from 'vitest';
import type { StateStorage } from 'zustand/middleware';
import { browserStorage, createSettingsStore, resolveTheme, safeStorage, useSettingsStore } from './settingsStore';

/**
 * A synchronous fake of localStorage. createMemoryStorage in storage.ts is async
 * (it stands in for IndexedDB), which would make rehydration async; the settings
 * store is backed by localStorage, so it hydrates before the first render and the
 * assertions below can stay synchronous.
 */
function syncStorage(seed?: unknown): StateStorage & { dump(): Record<string, string> } {
  const data: Record<string, string> = {};
  if (seed !== undefined) data['todo-settings'] = JSON.stringify({ state: seed, version: 0 });
  return {
    getItem: (name) => data[name] ?? null,
    setItem: (name, value) => {
      data[name] = value;
    },
    removeItem: (name) => {
      delete data[name];
    },
    dump: () => ({ ...data }),
  };
}

describe('settingsStore', () => {
  it('starts on the device theme and a medium gap', () => {
    const store = createSettingsStore(syncStorage());
    expect(store.getState().theme).toBe('system');
    expect(store.getState().gap).toBe('medium');
  });

  it('setTheme and setGap replace the current values', () => {
    const store = createSettingsStore(syncStorage());
    store.getState().setTheme('dark');
    expect(store.getState().theme).toBe('dark');
    store.getState().setTheme('system');
    expect(store.getState().theme).toBe('system');
    store.getState().setGap('large');
    expect(store.getState().gap).toBe('large');
  });

  it('reset returns both settings to their defaults', () => {
    const store = createSettingsStore(syncStorage());
    store.getState().setTheme('light');
    store.getState().setGap('small');
    store.getState().reset();
    expect(store.getState().theme).toBe('system');
    expect(store.getState().gap).toBe('medium');
  });

  it('persists only theme and gap, under the name the bootstrap script reads', () => {
    const storage = syncStorage();
    const store = createSettingsStore(storage);
    store.getState().setTheme('dark');
    store.getState().setGap('small');
    const raw = storage.dump()['todo-settings'];
    expect(raw).toBeDefined();
    expect(JSON.parse(raw).state).toEqual({ theme: 'dark', gap: 'small' });
    expect(useSettingsStore.persist.getOptions().name).toBe('todo-settings');
  });

  it('rehydrates stored settings', () => {
    const store = createSettingsStore(syncStorage({ theme: 'dark', gap: 'small' }));
    expect(store.getState().theme).toBe('dark');
    expect(store.getState().gap).toBe('small');
  });

  it('falls back to the default for any stored value that is not a known literal', () => {
    const store = createSettingsStore(syncStorage({ theme: 'neon', gap: 42 }));
    expect(store.getState().theme).toBe('system');
    expect(store.getState().gap).toBe('medium');
  });

  it('falls back field by field, keeping the actions', () => {
    const store = createSettingsStore(syncStorage({ gap: 'large' }));
    expect(store.getState().theme).toBe('system');
    expect(store.getState().gap).toBe('large');
    expect(typeof store.getState().setTheme).toBe('function');
  });

  it('survives a stored value that is not an object at all', () => {
    const store = createSettingsStore(syncStorage(null));
    expect(store.getState().theme).toBe('system');
    expect(store.getState().gap).toBe('medium');
  });
});

describe('browserStorage', () => {
  it('falls back to memory when merely reading localStorage throws, and still never throws', () => {
    const storage = browserStorage(() => {
      throw new Error('SecurityError: access is denied for this document');
    });
    expect(() => storage.setItem('todo-settings', '{}')).not.toThrow();
    const store = createSettingsStore(storage);
    expect(store.getState().theme).toBe('system');
    expect(() => store.getState().setGap('large')).not.toThrow();
    expect(store.getState().gap).toBe('large');
  });

  it('uses the given storage when it is available', () => {
    const data: Record<string, string> = { 'todo-settings': JSON.stringify({ state: { theme: 'dark', gap: 'small' }, version: 0 }) };
    const storage = browserStorage(() => ({
      getItem: (name) => data[name] ?? null,
      setItem: (name, value) => { data[name] = value; },
      removeItem: (name) => { delete data[name]; },
    }));
    const store = createSettingsStore(storage);
    expect(store.getState().theme).toBe('dark');
    expect(store.getState().gap).toBe('small');
  });
});

describe('safeStorage', () => {
  it('swallows a rejected promise from an asynchronous storage', async () => {
    const broken: StateStorage = {
      getItem: () => Promise.reject(new Error('gone')),
      setItem: () => Promise.reject(new Error('gone')),
      removeItem: () => Promise.reject(new Error('gone')),
    };
    const safe = safeStorage(broken);
    await expect(safe.getItem('todo-settings')).resolves.toBeNull();
    await expect(safe.setItem('todo-settings', '{}')).resolves.toBeUndefined();
    await expect(safe.removeItem('todo-settings')).resolves.toBeUndefined();
  });

  it('swallows a storage that throws on write, so a settings change still applies in memory', () => {
    const broken: StateStorage = {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: () => { throw new Error('QuotaExceededError'); },
    };
    const store = createSettingsStore(safeStorage(broken));
    expect(() => store.getState().setTheme('dark')).not.toThrow();
    expect(store.getState().theme).toBe('dark');
    expect(() => store.persist.clearStorage()).not.toThrow();
  });

  it('treats a storage that throws on read as empty', () => {
    const broken: StateStorage = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    const store = createSettingsStore(safeStorage(broken));
    expect(store.getState().theme).toBe('system');
    expect(store.getState().gap).toBe('medium');
  });

  it('falls back per field when the stored state is a primitive', () => {
    const store = createSettingsStore(syncStorage('x'));
    expect(store.getState().theme).toBe('system');
    expect(store.getState().gap).toBe('medium');
  });
});

describe('resolveTheme', () => {
  it('follows the device only when the theme is system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});
