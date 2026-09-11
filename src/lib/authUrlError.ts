export interface AuthUrlError {
  error: string;
  code: string | null;
  description: string | null;
}

export function parseAuthUrlError(loc: { hash: string; search: string }): AuthUrlError | null {
  const hashParams = new URLSearchParams(loc.hash.replace(/^#/, ''));
  const searchParams = new URLSearchParams(loc.search.replace(/^\?/, ''));
  const params = hashParams.get('error') !== null ? hashParams : searchParams;
  const error = params.get('error');
  if (error === null) return null;
  return {
    error,
    code: params.get('error_code'),
    description: params.get('error_description'),
  };
}

export const EXPIRED_LINK_MESSAGE = 'That sign-in link has expired or was already used. Enter your email to get a new one.';

export function authErrorMessage(err: AuthUrlError): string {
  if (err.code === 'otp_expired') return EXPIRED_LINK_MESSAGE;
  return err.description ?? 'Sign-in failed. Enter your email to get a new link.';
}

export interface UrlErrorSource {
  read(): { hash: string; search: string };
  clear(): void;
}

export const windowUrlErrorSource: UrlErrorSource = {
  read: () => ({ hash: window.location.hash, search: window.location.search }),
  clear: () => {
    window.history.replaceState(window.history.state, '', window.location.pathname);
  },
};
