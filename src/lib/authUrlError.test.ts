import { describe, expect, it } from 'vitest';
import {
  authErrorMessage,
  EXPIRED_LINK_MESSAGE,
  parseAuthUrlError,
  windowUrlErrorSource,
  type AuthUrlError,
} from './authUrlError';

describe('parseAuthUrlError', () => {
  it('parses an implicit-flow hash with a decoded description', () => {
    const loc = {
      hash: '#error=access_denied&error_code=otp_expired&error_description=Email%20link%20is%20invalid%20or%20has%20expired',
      search: '',
    };
    expect(parseAuthUrlError(loc)).toEqual({
      error: 'access_denied',
      code: 'otp_expired',
      description: 'Email link is invalid or has expired',
    });
  });

  it('parses error params from the search string', () => {
    const loc = { hash: '', search: '?error=access_denied&error_code=otp_expired&error_description=Link+expired' };
    expect(parseAuthUrlError(loc)).toEqual({
      error: 'access_denied',
      code: 'otp_expired',
      description: 'Link expired',
    });
  });

  it('prefers the hash over the search when both carry an error', () => {
    const loc = { hash: '#error=hash_error&error_code=hash_code', search: '?error=search_error&error_code=search_code' };
    expect(parseAuthUrlError(loc)).toEqual({ error: 'hash_error', code: 'hash_code', description: null });
  });

  it('returns null when neither the hash nor the search carries an error', () => {
    expect(parseAuthUrlError({ hash: '', search: '' })).toBeNull();
    expect(parseAuthUrlError({ hash: '#access_token=abc', search: '?foo=bar' })).toBeNull();
  });
});

describe('authErrorMessage', () => {
  it('returns the expired-link message for otp_expired', () => {
    const err: AuthUrlError = { error: 'access_denied', code: 'otp_expired', description: 'ignored' };
    expect(authErrorMessage(err)).toBe(EXPIRED_LINK_MESSAGE);
  });

  it('falls back to the description for other codes', () => {
    const err: AuthUrlError = { error: 'access_denied', code: 'other_code', description: 'Something else went wrong' };
    expect(authErrorMessage(err)).toBe('Something else went wrong');
  });

  it('falls back to a generic message without a description', () => {
    const err: AuthUrlError = { error: 'access_denied', code: null, description: null };
    expect(authErrorMessage(err)).toBe('Sign-in failed. Enter your email to get a new link.');
  });
});

describe('windowUrlErrorSource', () => {
  it('reads the current hash and search from window.location', () => {
    window.history.replaceState(null, '', '/?error=access_denied#error=hash_error');
    expect(windowUrlErrorSource.read()).toEqual({ hash: '#error=hash_error', search: '?error=access_denied' });
  });

  it('clears the fragment and query while keeping the path', () => {
    window.history.replaceState(null, '', '/some/path?error=access_denied#error=hash_error');
    windowUrlErrorSource.clear();
    expect(window.location.hash).toBe('');
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/some/path');
  });
});
