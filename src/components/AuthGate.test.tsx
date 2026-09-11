import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuthGate } from './AuthGate';
import { createAuthStore, type AuthClient } from '../store/authStore';
import { EXPIRED_LINK_MESSAGE, type UrlErrorSource } from '../lib/authUrlError';

function fake(session: { user: { id: string } } | null, urlErrors?: UrlErrorSource) {
  const client: AuthClient = {
    getSession: async () => ({ data: { session } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signInWithOtp: vi.fn(async () => ({ error: null })),
    verifyOtp: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  };
  return { client, store: createAuthStore(client, async () => {}, urlErrors) };
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

  it('stays on the email step and shows the error when sending fails', async () => {
    const { client, store } = fake(null);
    (client.signInWithOtp as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ error: { message: 'Email rate limit exceeded' } });
    render(<AuthGate store={store}><p>App body</p></AuthGate>);
    await userEvent.type(await screen.findByLabelText('Email'), 'me@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email rate limit exceeded');
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.queryByLabelText('6-digit code')).toBeNull();
  });

  it('clears a stale error when choosing a different email', async () => {
    const { client, store } = fake(null);
    (client.verifyOtp as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ error: { message: 'Token has expired' } });
    render(<AuthGate store={store}><p>App body</p></AuthGate>);
    await userEvent.type(await screen.findByLabelText('Email'), 'me@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }));
    await userEvent.type(await screen.findByLabelText('6-digit code'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Token has expired');
    await userEvent.click(screen.getByRole('button', { name: 'Use a different email' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the expired-link message from the URL on the email step, then clears it after sending a new link', async () => {
    const urlErrors: UrlErrorSource = {
      read: () => ({ hash: '#error=access_denied&error_code=otp_expired', search: '' }),
      clear: () => {},
    };
    const { store } = fake(null, urlErrors);
    render(<AuthGate store={store}><p>App body</p></AuthGate>);
    expect(await screen.findByRole('alert')).toHaveTextContent(EXPIRED_LINK_MESSAGE);
    await userEvent.type(screen.getByLabelText('Email'), 'me@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
