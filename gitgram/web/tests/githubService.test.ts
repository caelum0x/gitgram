/// <reference types="vitest/globals" />
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { githubService } from '@/services/githubService'

/**
 * connectGitHub is the "Sign in with GitHub" entry point surfaced on the login
 * screens. It must redirect to GitHub's OAuth authorize endpoint with the
 * client id, the callback redirect URI, and the scopes the backend needs to
 * write back stars/follows and read the user's email.
 */
describe('githubService.connectGitHub', () => {
  const originalLocation = window.location
  const originalClientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { origin: 'https://app.gitgram.com', href: '' },
    })
    process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID = 'test-client-123'
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
    process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID = originalClientId
  })

  it('redirects to the GitHub authorize endpoint', () => {
    githubService.connectGitHub()
    expect(window.location.href).toContain('https://github.com/login/oauth/authorize')
  })

  it('includes the configured client id, callback redirect, and scopes', () => {
    githubService.connectGitHub()
    const url = new URL(window.location.href)
    expect(url.searchParams.get('client_id')).toBe('test-client-123')
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.gitgram.com/auth/github/callback')
    expect(url.searchParams.get('scope')).toBe('user:email,repo,read:user')
  })
})
