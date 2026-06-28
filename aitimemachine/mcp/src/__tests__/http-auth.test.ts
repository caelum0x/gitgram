/**
 * http-auth.test.ts
 *
 * Unit tests for the HTTP transport auth gate and CORS policy.
 */

import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import {
  checkAuth,
  loadHttpAuthConfig,
  resolveAllowedOrigin,
} from '../lib/http-auth.js';

function fakeRequest(headers: Record<string, string | undefined>): Request {
  return { headers } as unknown as Request;
}

describe('loadHttpAuthConfig', () => {
  it('treats empty/whitespace env values as unset', () => {
    const config = loadHttpAuthConfig({
      AITM_MCP_AUTH_TOKEN: '   ',
      AITM_MCP_ALLOWED_ORIGINS: '',
    });
    expect(config.authToken).toBeUndefined();
    expect(config.allowedOrigins).toBeUndefined();
  });

  it('parses a comma-separated origin allow-list', () => {
    const config = loadHttpAuthConfig({
      AITM_MCP_AUTH_TOKEN: 'tok',
      AITM_MCP_ALLOWED_ORIGINS: 'https://a.com, https://b.com ',
    });
    expect(config.authToken).toBe('tok');
    expect(config.allowedOrigins).toEqual(['https://a.com', 'https://b.com']);
  });
});

describe('checkAuth', () => {
  it('allows any request when no token is configured', () => {
    expect(checkAuth(fakeRequest({}), {})).toBeNull();
  });

  it('rejects a missing credential when a token is configured', () => {
    const result = checkAuth(fakeRequest({}), { authToken: 'tok' });
    expect(result?.code).toBe(401);
    expect(result?.message).toMatch(/AITM_MCP_AUTH_TOKEN/);
  });

  it('accepts a matching Bearer token', () => {
    const result = checkAuth(
      fakeRequest({ authorization: 'Bearer tok' }),
      { authToken: 'tok' }
    );
    expect(result).toBeNull();
  });

  it('accepts a matching X-API-Key', () => {
    const result = checkAuth(
      fakeRequest({ 'x-api-key': 'tok' }),
      { authToken: 'tok' }
    );
    expect(result).toBeNull();
  });

  it('rejects a wrong token', () => {
    const result = checkAuth(
      fakeRequest({ authorization: 'Bearer wrong' }),
      { authToken: 'tok' }
    );
    expect(result?.code).toBe(401);
    expect(result?.message).toBe('Invalid credentials.');
  });

  it('rejects a token of a different length (timing-safe path)', () => {
    const result = checkAuth(
      fakeRequest({ 'x-api-key': 'short' }),
      { authToken: 'a-much-longer-token' }
    );
    expect(result?.code).toBe(401);
  });
});

describe('resolveAllowedOrigin', () => {
  it('returns * when no allow-list is configured', () => {
    expect(resolveAllowedOrigin('https://x.com', {})).toBe('*');
  });

  it('echoes a matching origin', () => {
    expect(
      resolveAllowedOrigin('https://x.com', { allowedOrigins: ['https://x.com'] })
    ).toBe('https://x.com');
  });

  it('returns undefined for a non-matching origin', () => {
    expect(
      resolveAllowedOrigin('https://evil.com', { allowedOrigins: ['https://x.com'] })
    ).toBeUndefined();
  });

  it('honours a wildcard entry in the allow-list', () => {
    expect(
      resolveAllowedOrigin('https://anything.com', { allowedOrigins: ['*'] })
    ).toBe('*');
  });
});
