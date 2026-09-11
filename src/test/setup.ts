import '@testing-library/jest-dom/vitest';
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect, vi } from 'vitest';

// jest-dom is externalised, so the `expect.extend` it runs internally can land on a
// different expect instance than the one the test files import. Register again from here.
expect.extend(jestDomMatchers);

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
