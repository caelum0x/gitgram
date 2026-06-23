'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'
import { useToast } from '@/components/ui/toast'
import { getErrorMessage } from '@/utils/error'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const TOKEN_SCOPES = [
  'repo:read',
  'repo:write',
  'user:read',
  'user:write',
  'posts:read',
  'posts:write',
  'webhooks:manage',
] as const

type TokenScope = (typeof TOKEN_SCOPES)[number]

interface PersonalAccessToken {
  id: string
  name: string
  scopes: string[]
  lastUsedAt: string | null
  createdAt: string
}

interface OAuthApp {
  id: string
  name: string
  clientId: string
  redirectUri: string
  scopes: string[]
  createdAt: string
}

interface AccountWebhook {
  id: string
  url: string
  events: string[]
  active: boolean
  createdAt: string
}

interface ApiUsageStats {
  requestsThisMonth: number
  rateLimitTier: string
  rateLimitPerHour: number
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function formatDate(dateString: string | null): string {
  if (!dateString) return 'Never'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SectionProps {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
}

function Section({ title, description, action, children }: SectionProps) {
  return (
    <section className="p-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--foreground)]">{title}</h2>
          {description && (
            <p className="text-sm text-[var(--foreground-secondary)] mt-1">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

interface ScopePillsProps {
  scopes: string[]
}

function ScopePills({ scopes }: ScopePillsProps) {
  if (scopes.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {scopes.map((scope) => (
        <span
          key={scope}
          className="px-1.5 py-0.5 text-xs bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--foreground-secondary)] font-mono"
        >
          {scope}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DeveloperSettingsPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const { showToast } = useToast()

  const [tokens, setTokens] = useState<PersonalAccessToken[]>([])
  const [oauthApps, setOAuthApps] = useState<OAuthApp[]>([])
  const [webhooks, setWebhooks] = useState<AccountWebhook[]>([])
  const [usage, setUsage] = useState<ApiUsageStats | null>(null)

  const [pageLoading, setPageLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)

  // Token creation
  const [tokenModalOpen, setTokenModalOpen] = useState(false)
  const [tokenName, setTokenName] = useState('')
  const [tokenScopes, setTokenScopes] = useState<Set<TokenScope>>(new Set())
  const [creatingToken, setCreatingToken] = useState(false)
  const [generatedToken, setGeneratedToken] = useState<string | null>(null)
  const [revokingTokenId, setRevokingTokenId] = useState<string | null>(null)

  // OAuth app creation
  const [oauthFormOpen, setOAuthFormOpen] = useState(false)
  const [oauthName, setOAuthName] = useState('')
  const [oauthRedirectUri, setOAuthRedirectUri] = useState('')
  const [oauthScopes, setOAuthScopes] = useState<Set<TokenScope>>(new Set())
  const [creatingOAuth, setCreatingOAuth] = useState(false)

  // Webhook creation
  const [webhookUrl, setWebhookUrl] = useState('')
  const [addingWebhook, setAddingWebhook] = useState(false)
  const [removingWebhookId, setRemovingWebhookId] = useState<string | null>(null)

  // -------------------------------------------------------------------------
  // Auth guard
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated) router.replace('/login')
  }, [isAuthenticated, router])

  // -------------------------------------------------------------------------
  // Load all data
  // -------------------------------------------------------------------------
  const loadData = useCallback(async () => {
    setPageLoading(true)
    setPageError(null)
    try {
      const [tokensRes, appsRes, hooksRes, usageRes] = await Promise.allSettled([
        api.get('/v1/developer/tokens'),
        api.get('/v1/developer/oauth-apps'),
        api.get('/v1/developer/webhooks'),
        api.get('/v1/developer/usage'),
      ])

      if (tokensRes.status === 'fulfilled') {
        setTokens(Array.isArray(tokensRes.value.data) ? tokensRes.value.data : [])
      }
      if (appsRes.status === 'fulfilled') {
        setOAuthApps(Array.isArray(appsRes.value.data) ? appsRes.value.data : [])
      }
      if (hooksRes.status === 'fulfilled') {
        setWebhooks(Array.isArray(hooksRes.value.data) ? hooksRes.value.data : [])
      }
      if (usageRes.status === 'fulfilled' && usageRes.value.data) {
        setUsage(usageRes.value.data as ApiUsageStats)
      }
    } catch (error: unknown) {
      console.error('Failed to load developer settings:', error)
      setPageError('Failed to load developer settings. Please try again.')
    } finally {
      setPageLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated) loadData()
  }, [isAuthenticated, loadData])

  if (!isAuthenticated) return null

  // -------------------------------------------------------------------------
  // Scope toggles
  // -------------------------------------------------------------------------

  const toggleScope = (
    set: Set<TokenScope>,
    setter: (next: Set<TokenScope>) => void,
    scope: TokenScope,
  ) => {
    const next = new Set(set)
    if (next.has(scope)) {
      next.delete(scope)
    } else {
      next.add(scope)
    }
    setter(next)
  }

  // -------------------------------------------------------------------------
  // Token handlers
  // -------------------------------------------------------------------------

  const handleCreateToken = async () => {
    if (!tokenName.trim()) {
      showToast('Give your token a name', 'error')
      return
    }
    if (tokenScopes.size === 0) {
      showToast('Select at least one scope', 'error')
      return
    }
    setCreatingToken(true)
    try {
      const response = await api.post('/v1/developer/tokens', {
        name: tokenName.trim(),
        scopes: Array.from(tokenScopes),
      })
      const created = response.data as PersonalAccessToken & { token?: string }
      setTokens((prev) => [
        {
          id: created.id,
          name: created.name,
          scopes: created.scopes,
          lastUsedAt: created.lastUsedAt ?? null,
          createdAt: created.createdAt,
        },
        ...prev,
      ])
      setGeneratedToken(created.token ?? null)
      setTokenName('')
      setTokenScopes(new Set())
      showToast('Personal access token generated', 'success')
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setCreatingToken(false)
    }
  }

  const handleRevokeToken = async (tokenId: string) => {
    setRevokingTokenId(tokenId)
    try {
      await api.delete(`/v1/developer/tokens/${tokenId}`)
      setTokens((prev) => prev.filter((t) => t.id !== tokenId))
      showToast('Token revoked', 'success')
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setRevokingTokenId(null)
    }
  }

  const copyGeneratedToken = () => {
    if (!generatedToken) return
    navigator.clipboard
      .writeText(generatedToken)
      .then(() => showToast('Token copied to clipboard', 'success'))
      .catch(() => showToast('Failed to copy. Please select and copy manually.', 'error'))
  }

  const closeTokenModal = () => {
    setTokenModalOpen(false)
    setGeneratedToken(null)
    setTokenName('')
    setTokenScopes(new Set())
  }

  // -------------------------------------------------------------------------
  // OAuth app handlers
  // -------------------------------------------------------------------------

  const handleCreateOAuthApp = async () => {
    if (!oauthName.trim()) {
      showToast('Give your OAuth app a name', 'error')
      return
    }
    if (!oauthRedirectUri.trim()) {
      showToast('A redirect URI is required', 'error')
      return
    }
    setCreatingOAuth(true)
    try {
      const response = await api.post('/v1/developer/oauth-apps', {
        name: oauthName.trim(),
        redirectUri: oauthRedirectUri.trim(),
        scopes: Array.from(oauthScopes),
      })
      const created = response.data as OAuthApp
      setOAuthApps((prev) => [created, ...prev])
      setOAuthName('')
      setOAuthRedirectUri('')
      setOAuthScopes(new Set())
      setOAuthFormOpen(false)
      showToast('OAuth app created', 'success')
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setCreatingOAuth(false)
    }
  }

  const copyClientId = (clientId: string) => {
    navigator.clipboard
      .writeText(clientId)
      .then(() => showToast('Client ID copied', 'success'))
      .catch(() => showToast('Failed to copy', 'error'))
  }

  // -------------------------------------------------------------------------
  // Webhook handlers
  // -------------------------------------------------------------------------

  const handleAddWebhook = async () => {
    if (!webhookUrl.trim()) {
      showToast('Enter a webhook URL', 'error')
      return
    }
    setAddingWebhook(true)
    try {
      const response = await api.post('/v1/developer/webhooks', {
        url: webhookUrl.trim(),
      })
      const created = response.data as AccountWebhook
      setWebhooks((prev) => [created, ...prev])
      setWebhookUrl('')
      showToast('Webhook added', 'success')
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setAddingWebhook(false)
    }
  }

  const handleRemoveWebhook = async (webhookId: string) => {
    setRemovingWebhookId(webhookId)
    try {
      await api.delete(`/v1/developer/webhooks/${webhookId}`)
      setWebhooks((prev) => prev.filter((w) => w.id !== webhookId))
      showToast('Webhook removed', 'success')
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setRemovingWebhookId(null)
    }
  }

  // -------------------------------------------------------------------------
  // Shared classes
  // -------------------------------------------------------------------------

  const inputCls =
    'w-full px-4 py-3 bg-[var(--background)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-colors text-sm'

  const primaryBtnCls =
    'px-4 py-2 text-sm bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold'

  const ghostBtnCls =
    'px-4 py-2 text-sm border border-[var(--border)] text-[var(--foreground)] rounded-lg hover:bg-[var(--surface-secondary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

  const dangerBtnCls =
    'px-4 py-1.5 text-sm border border-[var(--error)] text-[var(--error)] rounded-lg hover:bg-[var(--error)]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

  const scopeBtnCls = (active: boolean) =>
    `px-2.5 py-1 text-xs font-mono rounded-md border transition-colors ${
      active
        ? 'bg-[var(--primary)]/15 border-[var(--primary)]/40 text-[var(--primary)]'
        : 'bg-[var(--background)] border-[var(--border)] text-[var(--foreground-secondary)] hover:border-[var(--foreground-secondary)]'
    }`

  // -------------------------------------------------------------------------
  // Loading skeleton
  // -------------------------------------------------------------------------

  if (pageLoading) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="h-8 w-52 bg-[var(--surface)] rounded-lg animate-pulse mb-2" />
        <div className="h-4 w-80 bg-[var(--surface)] rounded animate-pulse mb-8" />
        <div className="space-y-6">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="p-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl space-y-4"
            >
              <div className="h-5 w-40 bg-[var(--surface-secondary)] rounded animate-pulse" />
              <div className="h-4 w-full bg-[var(--surface-secondary)] rounded animate-pulse" />
              <div className="h-12 w-full bg-[var(--surface-secondary)] rounded-lg animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  if (pageError) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-8">Developer</h1>
        <div className="p-8 bg-[var(--error)]/5 border border-[var(--error)]/20 rounded-xl text-center">
          <p className="text-[var(--error)] font-semibold mb-2">Failed to load settings</p>
          <p className="text-sm text-[var(--foreground-secondary)] mb-5">{pageError}</p>
          <button onClick={loadData} className={primaryBtnCls}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Developer</h1>
        <p className="text-sm text-[var(--foreground-secondary)] mt-1">
          Personal access tokens, OAuth apps, webhooks, and API usage.
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 1. Personal access tokens                                           */}
      {/* ------------------------------------------------------------------ */}
      <Section
        title="Personal Access Tokens"
        description="Use tokens to authenticate with the Gitgram API from scripts and CLI tools."
        action={
          <button onClick={() => setTokenModalOpen(true)} className={primaryBtnCls}>
            Generate new token
          </button>
        }
      >
        {tokens.length === 0 ? (
          <div className="p-6 text-center bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg">
            <p className="text-sm text-[var(--foreground-secondary)]">
              You have no personal access tokens yet.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tokens.map((token) => (
              <div
                key={token.id}
                className="flex items-start justify-between gap-4 p-4 bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--foreground)] truncate">
                    {token.name}
                  </p>
                  <ScopePills scopes={token.scopes} />
                  <p className="text-xs text-[var(--foreground-secondary)] mt-2">
                    Created {formatDate(token.createdAt)} · Last used{' '}
                    {formatDate(token.lastUsedAt)}
                  </p>
                </div>
                <button
                  onClick={() => handleRevokeToken(token.id)}
                  disabled={revokingTokenId === token.id}
                  className={`${dangerBtnCls} flex-shrink-0`}
                >
                  {revokingTokenId === token.id ? 'Revoking…' : 'Revoke'}
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 2. OAuth apps                                                       */}
      {/* ------------------------------------------------------------------ */}
      <Section
        title="OAuth Apps"
        description="Applications you've registered to authenticate Gitgram users."
        action={
          <button
            onClick={() => setOAuthFormOpen((v) => !v)}
            className={oauthFormOpen ? ghostBtnCls : primaryBtnCls}
          >
            {oauthFormOpen ? 'Cancel' : 'New OAuth App'}
          </button>
        }
      >
        {oauthFormOpen && (
          <div className="space-y-4 p-5 bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg">
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                Application name
              </label>
              <input
                type="text"
                value={oauthName}
                onChange={(e) => setOAuthName(e.target.value)}
                placeholder="My Gitgram Integration"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                Redirect URI
              </label>
              <input
                type="url"
                value={oauthRedirectUri}
                onChange={(e) => setOAuthRedirectUri(e.target.value)}
                placeholder="https://example.com/auth/callback"
                className={inputCls}
              />
            </div>
            <div>
              <p className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Scopes</p>
              <div className="flex flex-wrap gap-2">
                {TOKEN_SCOPES.map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => toggleScope(oauthScopes, setOAuthScopes, scope)}
                    className={scopeBtnCls(oauthScopes.has(scope))}
                  >
                    {scope}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleCreateOAuthApp}
              disabled={creatingOAuth}
              className={primaryBtnCls}
            >
              {creatingOAuth ? 'Creating…' : 'Create OAuth App'}
            </button>
          </div>
        )}

        {oauthApps.length === 0 ? (
          <div className="p-6 text-center bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg">
            <p className="text-sm text-[var(--foreground-secondary)]">
              You haven&apos;t created any OAuth apps.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {oauthApps.map((app) => (
              <div
                key={app.id}
                className="p-4 bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg"
              >
                <p className="text-sm font-semibold text-[var(--foreground)] truncate">
                  {app.name}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <code className="px-2 py-1 text-xs font-mono bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground-secondary)] truncate">
                    {app.clientId}
                  </code>
                  <button
                    onClick={() => copyClientId(app.clientId)}
                    className="text-xs text-[var(--primary)] hover:underline flex-shrink-0"
                  >
                    Copy ID
                  </button>
                </div>
                <p className="text-xs text-[var(--foreground-secondary)] mt-2 truncate">
                  {app.redirectUri}
                </p>
                <ScopePills scopes={app.scopes} />
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 3. Webhooks                                                         */}
      {/* ------------------------------------------------------------------ */}
      <Section
        title="Webhooks"
        description="Account-level webhooks notified of events across your account."
      >
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://example.com/webhook"
            className={inputCls}
          />
          <button
            onClick={handleAddWebhook}
            disabled={addingWebhook}
            className={`${primaryBtnCls} flex-shrink-0`}
          >
            {addingWebhook ? 'Adding…' : 'Add'}
          </button>
        </div>

        {webhooks.length === 0 ? (
          <div className="p-6 text-center bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg">
            <p className="text-sm text-[var(--foreground-secondary)]">No webhooks configured.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {webhooks.map((webhook) => (
              <div
                key={webhook.id}
                className="flex items-center justify-between gap-4 p-4 bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        webhook.active ? 'bg-[var(--accent)]' : 'bg-[var(--foreground-secondary)]'
                      }`}
                    />
                    <p className="text-sm text-[var(--foreground)] font-mono truncate">
                      {webhook.url}
                    </p>
                  </div>
                  <p className="text-xs text-[var(--foreground-secondary)] mt-1">
                    Added {formatDate(webhook.createdAt)}
                  </p>
                </div>
                <button
                  onClick={() => handleRemoveWebhook(webhook.id)}
                  disabled={removingWebhookId === webhook.id}
                  className={`${dangerBtnCls} flex-shrink-0`}
                >
                  {removingWebhookId === webhook.id ? 'Removing…' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 4. API usage                                                       */}
      {/* ------------------------------------------------------------------ */}
      <Section title="API Usage" description="Your API consumption for the current month.">
        {usage ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg">
              <p className="text-xs text-[var(--foreground-secondary)]">Requests this month</p>
              <p className="text-xl font-bold text-[var(--foreground)] tabular-nums mt-1">
                {usage.requestsThisMonth.toLocaleString()}
              </p>
            </div>
            <div className="p-4 bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg">
              <p className="text-xs text-[var(--foreground-secondary)]">Rate limit tier</p>
              <p className="text-xl font-bold text-[var(--foreground)] capitalize mt-1">
                {usage.rateLimitTier}
              </p>
            </div>
            <div className="p-4 bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg">
              <p className="text-xs text-[var(--foreground-secondary)]">Requests / hour</p>
              <p className="text-xl font-bold text-[var(--foreground)] tabular-nums mt-1">
                {usage.rateLimitPerHour.toLocaleString()}
              </p>
            </div>
          </div>
        ) : (
          <div className="p-6 text-center bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg">
            <p className="text-sm text-[var(--foreground-secondary)]">
              Usage data is not available right now.
            </p>
          </div>
        )}
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* Token generation modal                                             */}
      {/* ------------------------------------------------------------------ */}
      {tokenModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          role="dialog"
          aria-modal="true"
          aria-labelledby="token-modal-title"
          onClick={() => !creatingToken && closeTokenModal()}
        >
          <div
            className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            {generatedToken ? (
              <>
                <h3
                  id="token-modal-title"
                  className="text-base font-semibold text-[var(--foreground)]"
                >
                  Copy your new token
                </h3>
                <div className="flex items-start gap-3 p-4 bg-[var(--warning)]/5 border border-[var(--warning)]/30 rounded-lg">
                  <p className="text-xs text-[var(--foreground-secondary)]">
                    Make sure to copy your token now. For security reasons,{' '}
                    <span className="font-semibold text-[var(--foreground)]">
                      you won&apos;t be able to see it again.
                    </span>
                  </p>
                </div>
                <code className="block w-full px-3 py-3 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm font-mono break-all text-[var(--foreground)]">
                  {generatedToken}
                </code>
                <div className="flex justify-end gap-3">
                  <button onClick={copyGeneratedToken} className={ghostBtnCls}>
                    Copy token
                  </button>
                  <button onClick={closeTokenModal} className={primaryBtnCls}>
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3
                  id="token-modal-title"
                  className="text-base font-semibold text-[var(--foreground)]"
                >
                  Generate a personal access token
                </h3>
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                    Token name
                  </label>
                  <input
                    type="text"
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                    placeholder="CI deploy token"
                    className={inputCls}
                    autoFocus
                  />
                </div>
                <div>
                  <p className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                    Scopes
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {TOKEN_SCOPES.map((scope) => (
                      <button
                        key={scope}
                        type="button"
                        onClick={() => toggleScope(tokenScopes, setTokenScopes, scope)}
                        className={scopeBtnCls(tokenScopes.has(scope))}
                      >
                        {scope}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={closeTokenModal}
                    disabled={creatingToken}
                    className={ghostBtnCls}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateToken}
                    disabled={creatingToken}
                    className={primaryBtnCls}
                  >
                    {creatingToken ? 'Generating…' : 'Generate token'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
