import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom has no IndexedDB. Back idb-keyval with an in-memory map so the
// persisted store's default (idbStorage-backed) singleton doesn't reject
// storage calls and spam unhandled-rejection noise across the test run.
vi.mock('idb-keyval', () => {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k),
    set: async (k: string, v: string) => {
      m.set(k, v);
    },
    del: async (k: string) => {
      m.delete(k);
    },
  };
});

afterEach(() => {
  cleanup();
});
