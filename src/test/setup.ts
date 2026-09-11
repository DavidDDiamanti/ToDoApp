import '@testing-library/jest-dom/vitest';
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect, vi } from 'vitest';

// The `/vitest` entry point is imported for its type augmentation (it is what teaches
// TypeScript about `toBeInTheDocument` and friends), but it is not relied on to register
// the matchers: jest-dom is externalised, so the `expect.extend` it runs internally can
// resolve a second vitest instance and land on a different `expect` than the one the test
// files import. Register the matchers again from here, against the `expect` we import.
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
