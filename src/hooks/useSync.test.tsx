import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSync } from './useSync';
import { useAuthStore } from '../store/authStore';
import { useSyncStatus } from '../store/syncStatusStore';
import { useTodoStore } from '../store/todoStore';
import type { SyncEngine } from '../sync/syncEngine';

function fakeEngine(): SyncEngine {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    sync: vi.fn(async () => {}),
    isRunning: vi.fn(() => true),
  };
}

function Harness({ engine }: { engine: SyncEngine }) {
  useSync(engine);
  return null;
}

beforeEach(async () => {
  await useTodoStore.persist.rehydrate();
});

afterEach(() => {
  useAuthStore.setState({ userId: null, status: 'signed_out' });
});

describe('useSync', () => {
  it('starts and syncs the engine once signed in and hydrated', async () => {
    useAuthStore.setState({ userId: 'u1', status: 'signed_in' });
    const engine = fakeEngine();
    render(<Harness engine={engine} />);

    await waitFor(() => expect(engine.start).toHaveBeenCalledWith('u1'));
    expect(engine.sync).toHaveBeenCalledTimes(1);
  });

  it('syncs again on an online event', async () => {
    useAuthStore.setState({ userId: 'u1', status: 'signed_in' });
    const engine = fakeEngine();
    render(<Harness engine={engine} />);
    await waitFor(() => expect(engine.sync).toHaveBeenCalledTimes(1));

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(engine.sync).toHaveBeenCalledTimes(2));
  });

  it('syncs again when the tab becomes visible', async () => {
    useAuthStore.setState({ userId: 'u1', status: 'signed_in' });
    const engine = fakeEngine();
    render(<Harness engine={engine} />);
    await waitFor(() => expect(engine.sync).toHaveBeenCalledTimes(1));

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => expect(engine.sync).toHaveBeenCalledTimes(2));
  });

  it('stops the engine and resets sync status on unmount', async () => {
    useAuthStore.setState({ userId: 'u1', status: 'signed_in' });
    const engine = fakeEngine();
    useSyncStatus.getState().set('synced', '2026-09-10T10:00:00.000Z');
    const { unmount } = render(<Harness engine={engine} />);
    await waitFor(() => expect(engine.sync).toHaveBeenCalledTimes(1));

    unmount();

    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(useSyncStatus.getState().state).toBe('pending');
  });

  it('does not start the engine when there is no signed-in user', async () => {
    useAuthStore.setState({ userId: null, status: 'signed_out' });
    const engine = fakeEngine();
    render(<Harness engine={engine} />);

    await new Promise((r) => setTimeout(r, 0));
    expect(engine.start).not.toHaveBeenCalled();
  });
});
