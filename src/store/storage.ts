import { del, get, set } from 'idb-keyval';
import type { StateStorage } from 'zustand/middleware';

export const idbStorage: StateStorage = {
  getItem: async (name) => (await get<string>(name)) ?? null,
  setItem: async (name, value) => {
    await set(name, value);
  },
  removeItem: async (name) => {
    await del(name);
  },
};

export function createMemoryStorage(): StateStorage & { dump(): Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    getItem: async (name) => data[name] ?? null,
    setItem: async (name, value) => {
      data[name] = value;
    },
    removeItem: async (name) => {
      delete data[name];
    },
    dump: () => ({ ...data }),
  };
}
