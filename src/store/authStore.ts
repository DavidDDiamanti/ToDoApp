import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { setCurrentUserId } from './actions';
import { switchStoreUser } from './todoStore';

type Session = { user: { id: string; email?: string } } | null;

export interface AuthClient {
  getSession(): Promise<{ data: { session: Session } }>;
  onAuthStateChange(cb: (event: string, session: Session) => void): { data: { subscription: { unsubscribe(): void } } };
  signInWithOtp(args: { email: string; options?: { emailRedirectTo?: string } }): Promise<{ error: { message: string } | null }>;
  verifyOtp(args: { email: string; token: string; type: 'email' }): Promise<{ error: { message: string } | null }>;
  signOut(): Promise<{ error: { message: string } | null }>;
}

export interface AuthState {
  status: 'loading' | 'signed_out' | 'signed_in';
  userId: string | null;
  email: string | null;
  pendingEmail: string | null;
  error: string | null;
  init(): Promise<void>;
  sendMagicLink(email: string): Promise<void>;
  verifyCode(code: string): Promise<void>;
  signOut(): Promise<void>;
}

export function createAuthStore(client: AuthClient, onUser: (userId: string | null) => Promise<void>) {
  return create<AuthState>()((set, get) => {
    let lastUser: string | null = null;
    const apply = (session: Session) => {
      const userId = session?.user.id ?? null;
      set({ status: userId ? 'signed_in' : 'signed_out', userId, email: session?.user.email ?? null, error: null });
      if (userId !== lastUser) {
        lastUser = userId;
        void onUser(userId);
      }
    };
    return {
      status: 'loading',
      userId: null,
      email: null,
      pendingEmail: null,
      error: null,
      init: async () => {
        const { data } = await client.getSession();
        apply(data.session);
        client.onAuthStateChange((_event, session) => apply(session));
      },
      sendMagicLink: async (email) => {
        set({ pendingEmail: email, error: null });
        const { error } = await client.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
        if (error) set({ error: error.message });
      },
      verifyCode: async (code) => {
        const email = get().pendingEmail;
        if (!email) {
          set({ error: 'Enter your email first' });
          return;
        }
        const { error } = await client.verifyOtp({ email, token: code.trim(), type: 'email' });
        if (error) set({ error: error.message });
      },
      signOut: async () => {
        await client.signOut();
      },
    };
  });
}

export const useAuthStore = createAuthStore(supabase.auth, async (userId) => {
  setCurrentUserId(userId ?? 'local');
  if (userId) await switchStoreUser(userId);
});
