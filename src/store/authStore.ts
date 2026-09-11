import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { authErrorMessage, parseAuthUrlError, windowUrlErrorSource, type UrlErrorSource } from '../lib/authUrlError';
import { setCurrentUserId } from './actions';
import { detachStoreForSignOut, switchStoreUser } from './todoStore';

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
  clearError(): void;
}

export function createAuthStore(
  client: AuthClient,
  onUser: (userId: string | null) => Promise<void>,
  urlErrors: UrlErrorSource = windowUrlErrorSource,
) {
  return create<AuthState>()((set, get) => {
    let lastUser: string | null = null;
    let subscription: { unsubscribe(): void } | null = null;
    let urlError: string | null = null;
    const apply = (session: Session) => {
      const userId = session?.user.id ?? null;
      set({ status: userId ? 'signed_in' : 'signed_out', userId, email: session?.user.email ?? null, error: userId ? null : urlError });
      if (userId) urlError = null;
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
        const parsed = parseAuthUrlError(urlErrors.read());
        if (parsed) {
          urlError = authErrorMessage(parsed);
          urlErrors.clear();
        }
        const { data } = await client.getSession();
        apply(data.session);
        if (!subscription) {
          subscription = client.onAuthStateChange((_event, session) => apply(session)).data.subscription;
        }
      },
      sendMagicLink: async (email) => {
        urlError = null;
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
      clearError: () => {
        urlError = null;
        set({ error: null });
      },
    };
  });
}

export const useAuthStore = createAuthStore(supabase.auth, async (userId) => {
  setCurrentUserId(userId ?? 'local');
  if (userId) await switchStoreUser(userId);
  else detachStoreForSignOut();
});
