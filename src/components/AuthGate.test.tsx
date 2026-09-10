import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuthGate } from './AuthGate';
import { createAuthStore, type AuthClient } from '../store/authStore';

function fake(session: { user: { id: string } } | null) {
  const client: AuthClient = {
    getSession: async () => ({ data: { session } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signInWithOtp: vi.fn(async () => ({ error: null })),
    verifyOtp: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  };
  return { client, store: createAuthStore(client, async () => {}) };
}

describe('AuthGate', () => {
  it('shows the sign-in form when signed out, then the code step after sending', async () => {
    const { client, store } = fake(null);
    render(<AuthGate store={store}><p>App body</p></AuthGate>);
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
    expect(screen.queryByText('App body')).toBeNull();
    await userEvent.type(screen.getByLabelText('Email'), 'me@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }));
    expect(client.signInWithOtp).toHaveBeenCalled();
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('6-digit code'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with code' }));
    expect(client.verifyOtp).toHaveBeenCalledWith({ email: 'me@example.com', token: '123456', type: 'email' });
  });

  it('renders children when a session exists', async () => {
    const { store } = fake({ user: { id: 'u1' } });
    render(<AuthGate store={store}><p>App body</p></AuthGate>);
    expect(await screen.findByText('App body')).toBeInTheDocument();
  });
});
