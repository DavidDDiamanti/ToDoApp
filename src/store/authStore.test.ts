import { describe, expect, it, vi } from 'vitest';
import { createAuthStore, type AuthClient } from './authStore';

type Session = { user: { id: string; email?: string } } | null;

function fakeClient(initial: Session = null) {
  let listener: ((event: string, session: Session) => void) | null = null;
  let subscribeCount = 0;
  const client: AuthClient = {
    getSession: async () => ({ data: { session: initial } }),
    onAuthStateChange: (cb) => {
      subscribeCount += 1;
      listener = cb;
      return { data: { subscription: { unsubscribe: () => { listener = null; } } } };
    },
    signInWithOtp: vi.fn(async () => ({ error: null })),
    verifyOtp: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  };
  return {
    client,
    emit: (event: string, session: Session) => listener?.(event, session),
    get subscribeCount() {
      return subscribeCount;
    },
  };
}

describe('authStore', () => {
  it('starts loading, then reflects an existing session and notifies onUser', async () => {
    const { client } = fakeClient({ user: { id: 'u1', email: 'a@b.c' } });
    const onUser = vi.fn(async () => {});
    const store = createAuthStore(client, onUser);
    expect(store.getState().status).toBe('loading');
    await store.getState().init();
    expect(store.getState()).toMatchObject({ status: 'signed_in', userId: 'u1', email: 'a@b.c' });
    expect(onUser).toHaveBeenCalledWith('u1');
  });

  it('is signed out without a session and follows auth events', async () => {
    const { client, emit } = fakeClient(null);
    const onUser = vi.fn(async () => {});
    const store = createAuthStore(client, onUser);
    await store.getState().init();
    expect(store.getState().status).toBe('signed_out');
    emit('SIGNED_IN', { user: { id: 'u2' } });
    expect(store.getState().userId).toBe('u2');
    expect(onUser).toHaveBeenLastCalledWith('u2');
    emit('SIGNED_OUT', null);
    expect(store.getState().status).toBe('signed_out');
    expect(onUser).toHaveBeenLastCalledWith(null);
  });

  it('sendMagicLink calls the client with the current origin and remembers the email', async () => {
    const { client } = fakeClient(null);
    const store = createAuthStore(client, async () => {});
    await store.getState().sendMagicLink('me@example.com');
    expect(client.signInWithOtp).toHaveBeenCalledWith({ email: 'me@example.com', options: { emailRedirectTo: window.location.origin } });
    expect(store.getState().pendingEmail).toBe('me@example.com');
  });

  it('verifyCode uses the pending email and surfaces errors', async () => {
    const { client } = fakeClient(null);
    (client.verifyOtp as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ error: { message: 'Token has expired' } });
    const store = createAuthStore(client, async () => {});
    await store.getState().sendMagicLink('me@example.com');
    await store.getState().verifyCode('123456');
    expect(client.verifyOtp).toHaveBeenCalledWith({ email: 'me@example.com', token: '123456', type: 'email' });
    expect(store.getState().error).toBe('Token has expired');
  });

  it('init subscribes to auth changes only once even when called twice', async () => {
    const f = fakeClient(null);
    const store = createAuthStore(f.client, async () => {});
    await store.getState().init();
    await store.getState().init();
    expect(f.subscribeCount).toBe(1);
  });
});
