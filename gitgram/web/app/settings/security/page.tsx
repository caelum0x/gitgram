'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useRouter } from 'next/navigation'
import { settingsService } from '@/services/settingsService'
import api from '@/services/api'
import { useToast } from '@/components/ui/toast'
import { getErrorMessage } from '@/utils/error'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Session {
  id: string
  device: string
  browser: string
  os: string
  ip: string
  lastActive: string
  location?: string
  current?: boolean
}

interface LoginHistoryEntry {
  id: string
  date: string
  ip: string
  device: string
  success: boolean
}

interface ConnectedApp {
  id: string
  name: string
  description?: string
  scopes: string[]
  authorizedAt: string
  iconUrl?: string
}

interface SecurityKey {
  id: string
  name: string
  createdAt: string
  lastUsed?: string
}

type TwoFaStep = 'idle' | 'setup' | 'verify' | 'backup-codes' | 'disable'

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRelative(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SectionProps {
  title: string
  description?: string
  children: React.ReactNode
}

function Section({ title, description, children }: SectionProps) {
  return (
    <section className="p-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl space-y-5">
      <div>
        <h2 className="text-base font-semibold text-[var(--foreground)]">{title}</h2>
        {description && (
          <p className="text-sm text-[var(--foreground-secondary)] mt-1">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}

interface BadgeProps {
  enabled: boolean
}

function StatusBadge({ enabled }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
        enabled
          ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
          : 'bg-[var(--surface-secondary)] text-[var(--foreground-secondary)]'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-[var(--accent)]' : 'bg-[var(--foreground-secondary)]'}`}
      />
      {enabled ? 'Enabled' : 'Disabled'}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SecuritySettingsPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const { showToast } = useToast()

  // -------------------------------------------------------------------------
  // 2FA state
  // -------------------------------------------------------------------------
  const [twoFaEnabled, setTwoFaEnabled] = useState(false)
  const [twoFaStep, setTwoFaStep] = useState<TwoFaStep>('idle')
  const [qrCode, setQrCode] = useState('')
  const [totpSecret, setTotpSecret] = useState('')
  const [verifyToken, setVerifyToken] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [disablePassword, setDisablePassword] = useState('')
  const [twoFaLoading, setTwoFaLoading] = useState(false)
  const [backupCodesVisible, setBackupCodesVisible] = useState(false)

  // -------------------------------------------------------------------------
  // Sessions state
  // -------------------------------------------------------------------------
  const [sessions, setSessions] = useState<Session[]>([])
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null)
  const [revokingAll, setRevokingAll] = useState(false)

  // -------------------------------------------------------------------------
  // Login history state
  // -------------------------------------------------------------------------
  const [loginHistory, setLoginHistory] = useState<LoginHistoryEntry[]>([])

  // -------------------------------------------------------------------------
  // Connected apps state
  // -------------------------------------------------------------------------
  const [connectedApps, setConnectedApps] = useState<ConnectedApp[]>([])
  const [revokingAppId, setRevokingAppId] = useState<string | null>(null)

  // -------------------------------------------------------------------------
  // Security keys state
  // -------------------------------------------------------------------------
  const [securityKeys, setSecurityKeys] = useState<SecurityKey[]>([])
  const [registeringKey, setRegisteringKey] = useState(false)
  const [removingKeyId, setRemovingKeyId] = useState<string | null>(null)

  // -------------------------------------------------------------------------
  // Page loading
  // -------------------------------------------------------------------------
  const [pageLoading, setPageLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)

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
      const [sessionsData, statusData, historyData, appsData, keysData] =
        await Promise.allSettled([
          settingsService.getActiveSessions(),
          api.get('/v1/auth/2fa/status'),
          api.get('/v1/auth/login-history'),
          api.get('/v1/auth/connected-apps'),
          api.get('/v1/auth/security-keys'),
        ])

      if (sessionsData.status === 'fulfilled') {
        setSessions(Array.isArray(sessionsData.value) ? sessionsData.value : [])
      }
      if (statusData.status === 'fulfilled') {
        setTwoFaEnabled(statusData.value.data?.enabled ?? false)
      }
      if (historyData.status === 'fulfilled') {
        setLoginHistory(Array.isArray(historyData.value.data) ? historyData.value.data : [])
      }
      if (appsData.status === 'fulfilled') {
        setConnectedApps(Array.isArray(appsData.value.data) ? appsData.value.data : [])
      }
      if (keysData.status === 'fulfilled') {
        setSecurityKeys(Array.isArray(keysData.value.data) ? keysData.value.data : [])
      }
    } catch (error: unknown) {
      console.error('Failed to load security settings:', error)
      setPageError('Failed to load security settings. Please try again.')
    } finally {
      setPageLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated) loadData()
  }, [isAuthenticated, loadData])

  if (!isAuthenticated) return null

  // -------------------------------------------------------------------------
  // 2FA handlers
  // -------------------------------------------------------------------------

  const handleSetup2Fa = async () => {
    setTwoFaLoading(true)
    try {
      const response = await api.post('/v1/auth/2fa/setup')
      setQrCode(response.data.qrCode ?? '')
      setTotpSecret(response.data.secret ?? '')
      setTwoFaStep('setup')
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setTwoFaLoading(false)
    }
  }

  const handleVerify2Fa = async () => {
    if (verifyToken.length !== 6) {
      showToast('Enter the 6-digit code from your authenticator app', 'error')
      return
    }
    setTwoFaLoading(true)
    try {
      const response = await api.post('/v1/auth/2fa/verify', { token: verifyToken })
      setBackupCodes(Array.isArray(response.data.backupCodes) ? response.data.backupCodes : [])
      setTwoFaEnabled(true)
      setTwoFaStep('backup-codes')
      setVerifyToken('')
      showToast('Two-factor authentication enabled!', 'success')
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setTwoFaLoading(false)
    }
  }

  const handleDisable2Fa = async () => {
    if (!disablePassword) {
      showToast('Enter your password to disable 2FA', 'error')
      return
    }
    setTwoFaLoading(true)
    try {
      await api.post('/v1/auth/2fa/disable', { password: disablePassword })
      setTwoFaEnabled(false)
      setDisablePassword('')
      setTwoFaStep('idle')
      showToast('Two-factor authentication disabled', 'success')
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setTwoFaLoading(false)
    }
  }

  const handleRegenerateBackupCodes = async () => {
    setTwoFaLoading(true)
    try {
      const response = await api.post('/v1/auth/2fa/backup-codes/regenerate')
      setBackupCodes(Array.isArray(response.data.backupCodes) ? response.data.backupCodes : [])
      setBackupCodesVisible(true)
      showToast('New backup codes generated. Store them safely!', 'success')
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setTwoFaLoading(false)
    }
  }

  const copyBackupCodes = () => {
    navigator.clipboard
      .writeText(backupCodes.join('\n'))
      .then(() => showToast('Backup codes copied to clipboard', 'success'))
      .catch(() => showToast('Failed to copy. Please select and copy manually.', 'error'))
  }

  // -------------------------------------------------------------------------
  // Session handlers
  // -------------------------------------------------------------------------

  const handleRevokeSession = async (sessionId: string) => {
    setRevokingSessionId(sessionId)
    try {
      await settingsService.revokeSession(sessionId)
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      showToast('Session revoked', 'success')
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setRevokingSessionId(null)
    }
  }

  const handleRevokeAllSessions = async () => {
    setRevokingAll(true)
    try {
      await api.delete('/v1/auth/sessions/others')
      setSessions((prev) => prev.filter((s) => s.current))
      showToast('All other sessions revoked', 'success')
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setRevokingAll(false)
    }
  }

  // -------------------------------------------------------------------------
  // Connected app handlers
  // -------------------------------------------------------------------------

  const handleRevokeApp = async (appId: string) => {
    setRevokingAppId(appId)
    try {
      await api.delete(`/v1/auth/connected-apps/${appId}`)
      setConnectedApps((prev) => prev.filter((a) => a.id !== appId))
      showToast('App access revoked', 'success')
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setRevokingAppId(null)
    }
  }

  // -------------------------------------------------------------------------
  // Security key handlers
  // -------------------------------------------------------------------------

  const handleRegisterKey = async () => {
    if (!window.PublicKeyCredential) {
      showToast('Your browser does not support WebAuthn security keys', 'error')
      return
    }
    setRegisteringKey(true)
    try {
      // 1. Get challenge options from server
      const optionsRes = await api.post('/v1/auth/security-keys/challenge')
      const options = optionsRes.data as PublicKeyCredentialCreationOptions & {
        challenge: string
        user: { id: string; name: string; displayName: string }
      }

      // Decode base64url fields
      const publicKeyOptions: PublicKeyCredentialCreationOptions = {
        ...options,
        challenge: Uint8Array.from(atob(options.challenge), (c) => c.charCodeAt(0)),
        user: {
          ...options.user,
          id: Uint8Array.from(atob(options.user.id), (c) => c.charCodeAt(0)),
        },
      }

      // 2. Create credential via browser WebAuthn API
      const credential = (await navigator.credentials.create({
        publicKey: publicKeyOptions,
      })) as PublicKeyCredential | null

      if (!credential) {
        showToast('Key registration was cancelled', 'error')
        return
      }

      const response = credential.response as AuthenticatorAttestationResponse

      // 3. Send attestation to server
      const regRes = await api.post('/v1/auth/security-keys/register', {
        id: credential.id,
        rawId: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))),
        type: credential.type,
        response: {
          attestationObject: btoa(
            String.fromCharCode(...new Uint8Array(response.attestationObject)),
          ),
          clientDataJSON: btoa(
            String.fromCharCode(...new Uint8Array(response.clientDataJSON)),
          ),
        },
      })

      const newKey = regRes.data as SecurityKey
      setSecurityKeys((prev) => [...prev, newKey])
      showToast('Security key registered successfully!', 'success')
    } catch (error: unknown) {
      const msg = getErrorMessage(error)
      if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('abort')) {
        showToast('Registration cancelled', 'error')
      } else {
        showToast(msg, 'error')
      }
    } finally {
      setRegisteringKey(false)
    }
  }

  const handleRemoveKey = async (keyId: string) => {
    setRemovingKeyId(keyId)
    try {
      await api.delete(`/v1/auth/security-keys/${keyId}`)
      setSecurityKeys((prev) => prev.filter((k) => k.id !== keyId))
      showToast('Security key removed', 'success')
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setRemovingKeyId(null)
    }
  }

  // -------------------------------------------------------------------------
  // Shared classes
  // -------------------------------------------------------------------------

  const inputCls =
    'w-full px-4 py-3 bg-[var(--background)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-colors text-sm'

  const dangerBtnCls =
    'px-4 py-1.5 text-sm border border-[var(--error)] text-[var(--error)] rounded-lg hover:bg-[var(--error)]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

  const ghostBtnCls =
    'px-4 py-2 text-sm border border-[var(--border)] text-[var(--foreground)] rounded-lg hover:bg-[var(--surface-secondary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

  const primaryBtnCls =
    'px-4 py-2 text-sm bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold'

  // -------------------------------------------------------------------------
  // Loading skeleton
  // -------------------------------------------------------------------------

  if (pageLoading) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="h-8 w-52 bg-[var(--surface)] rounded-lg animate-pulse mb-2" />
        <div className="h-4 w-80 bg-[var(--surface)] rounded animate-pulse mb-8" />
        <div className="space-y-6">
          {[1, 2, 3, 4, 5].map((i) => (
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
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-8">Security</h1>
        <div className="p-8 bg-[var(--error)]/5 border border-[var(--error)]/20 rounded-xl text-center">
          <svg
            className="w-12 h-12 text-[var(--error)] mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
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
  // Other sessions count for "Revoke All" button
  // -------------------------------------------------------------------------
  const otherSessionsCount = sessions.filter((s) => !s.current).length

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Security</h1>
        <p className="text-sm text-[var(--foreground-secondary)] mt-1">
          Manage authentication, active sessions, and connected applications.
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 1. Two-Factor Authentication                                        */}
      {/* ------------------------------------------------------------------ */}
      <Section
        title="Two-Factor Authentication"
        description="Add an extra layer of security — require a one-time code when signing in."
      >
        {/* Status row */}
        <div className="flex items-center justify-between p-4 bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center flex-shrink-0">
              <svg
                className="w-5 h-5 text-[var(--primary)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--foreground)]">
                Authenticator App
              </p>
              <p className="text-xs text-[var(--foreground-secondary)]">
                TOTP-based two-factor authentication
              </p>
            </div>
          </div>
          <StatusBadge enabled={twoFaEnabled} />
        </div>

        {/* Idle / not enabled */}
        {!twoFaEnabled && twoFaStep === 'idle' && (
          <button
            onClick={handleSetup2Fa}
            disabled={twoFaLoading}
            className={primaryBtnCls}
          >
            {twoFaLoading ? 'Setting up…' : 'Enable 2FA'}
          </button>
        )}

        {/* Setup: show QR code */}
        {twoFaStep === 'setup' && (
          <div className="space-y-5 p-5 bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              Step 1 — Scan the QR code
            </p>
            <p className="text-xs text-[var(--foreground-secondary)]">
              Open your authenticator app (Google Authenticator, Authy, 1Password, etc.) and
              scan the code below.
            </p>
            {qrCode && (
              <div className="flex justify-center p-4 bg-white rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCode} alt="2FA QR code" className="w-52 h-52" />
              </div>
            )}
            {totpSecret && (
              <div>
                <p className="text-xs text-[var(--foreground-secondary)] mb-1">
                  Or enter this secret manually:
                </p>
                <code className="block w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded text-xs font-mono break-all text-[var(--foreground)]">
                  {totpSecret}
                </code>
              </div>
            )}

            <p className="text-sm font-semibold text-[var(--foreground)]">
              Step 2 — Enter the 6-digit verification code
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              value={verifyToken}
              onChange={(e) =>
                setVerifyToken(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              placeholder="000000"
              maxLength={6}
              className={`${inputCls} text-center text-2xl tracking-[0.5em] font-mono`}
              autoComplete="one-time-code"
            />
            <div className="flex gap-3">
              <button
                onClick={handleVerify2Fa}
                disabled={twoFaLoading || verifyToken.length !== 6}
                className={primaryBtnCls}
              >
                {twoFaLoading ? 'Verifying…' : 'Verify & Enable'}
              </button>
              <button
                onClick={() => {
                  setTwoFaStep('idle')
                  setVerifyToken('')
                  setQrCode('')
                  setTotpSecret('')
                }}
                className={ghostBtnCls}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Backup codes after successful enable */}
        {twoFaStep === 'backup-codes' && backupCodes.length > 0 && (
          <div className="space-y-4 p-5 bg-[var(--warning)]/5 border border-[var(--warning)]/30 rounded-lg">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-[var(--warning)] flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div>
                <p className="text-sm font-semibold text-[var(--foreground)]">
                  Save your backup codes
                </p>
                <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">
                  Each code can be used once if you lose access to your authenticator.
                  Store them in a secure location — they will not be shown again.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 p-4 bg-[var(--background)] border border-[var(--border)] rounded-lg font-mono text-sm text-[var(--foreground)]">
              {backupCodes.map((code) => (
                <span key={code} className="tabular-nums">
                  {code}
                </span>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={copyBackupCodes} className={ghostBtnCls}>
                Copy codes
              </button>
              <button
                onClick={() => {
                  setTwoFaStep('idle')
                  setBackupCodes([])
                }}
                className={primaryBtnCls}
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* 2FA enabled: management actions */}
        {twoFaEnabled && twoFaStep === 'idle' && (
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleRegenerateBackupCodes}
              disabled={twoFaLoading}
              className={ghostBtnCls}
            >
              {twoFaLoading ? 'Regenerating…' : 'Regenerate backup codes'}
            </button>
            <button
              onClick={() => setTwoFaStep('disable')}
              className={dangerBtnCls}
            >
              Disable 2FA
            </button>
          </div>
        )}

        {/* Regenerated backup codes inline display */}
        {twoFaEnabled && backupCodesVisible && backupCodes.length > 0 && twoFaStep === 'idle' && (
          <div className="space-y-3 p-4 bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg">
            <p className="text-xs text-[var(--foreground-secondary)]">New backup codes:</p>
            <div className="grid grid-cols-2 gap-2 font-mono text-sm text-[var(--foreground)]">
              {backupCodes.map((code) => (
                <span key={code} className="tabular-nums">
                  {code}
                </span>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={copyBackupCodes} className={ghostBtnCls}>
                Copy
              </button>
              <button
                onClick={() => {
                  setBackupCodesVisible(false)
                  setBackupCodes([])
                }}
                className={ghostBtnCls}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Disable 2FA flow */}
        {twoFaStep === 'disable' && (
          <div className="space-y-4 p-5 bg-[var(--error)]/5 border border-[var(--error)]/20 rounded-lg">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              Confirm your password to disable 2FA
            </p>
            <input
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              placeholder="Enter your password"
              className={inputCls}
              autoComplete="current-password"
            />
            <div className="flex gap-3">
              <button
                onClick={handleDisable2Fa}
                disabled={twoFaLoading || !disablePassword}
                className="px-4 py-2 text-sm bg-[var(--error)] text-white rounded-lg hover:bg-[var(--error)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
              >
                {twoFaLoading ? 'Disabling…' : 'Disable 2FA'}
              </button>
              <button
                onClick={() => {
                  setTwoFaStep('idle')
                  setDisablePassword('')
                }}
                className={ghostBtnCls}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 2. Active Sessions                                                  */}
      {/* ------------------------------------------------------------------ */}
      <Section
        title="Active Sessions"
        description="Manage every device where you are currently signed in."
      >
        {sessions.length === 0 ? (
          <div className="p-6 text-center bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg">
            <p className="text-sm text-[var(--foreground-secondary)]">No active sessions found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`flex items-center justify-between p-4 border rounded-lg transition-colors ${
                  session.current
                    ? 'bg-[var(--primary)]/5 border-[var(--primary)]/30'
                    : 'bg-[var(--surface-secondary)] border-[var(--border)]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center flex-shrink-0">
                    <svg
                      className="w-5 h-5 text-[var(--foreground-secondary)]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-[var(--foreground)] truncate">
                        {session.device}
                      </p>
                      {session.current && (
                        <span className="text-xs font-medium text-[var(--primary)] bg-[var(--primary)]/10 px-2 py-0.5 rounded-full">
                          This device
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--foreground-secondary)] truncate">
                      {[session.browser, session.os].filter(Boolean).join(' — ')}
                      {session.ip && ` · ${session.ip}`}
                    </p>
                    <p className="text-xs text-[var(--foreground-secondary)]">
                      {session.location && `${session.location} · `}
                      {formatRelative(session.lastActive)}
                    </p>
                  </div>
                </div>
                {!session.current && (
                  <button
                    onClick={() => handleRevokeSession(session.id)}
                    disabled={revokingSessionId === session.id}
                    className={`${dangerBtnCls} ml-3 flex-shrink-0`}
                  >
                    {revokingSessionId === session.id ? 'Revoking…' : 'Revoke'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {otherSessionsCount > 1 && (
          <div className="pt-2 border-t border-[var(--border)]">
            <button
              onClick={handleRevokeAllSessions}
              disabled={revokingAll}
              className={dangerBtnCls}
            >
              {revokingAll
                ? 'Revoking…'
                : `Revoke all other sessions (${otherSessionsCount})`}
            </button>
          </div>
        )}
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 3. Login History                                                    */}
      {/* ------------------------------------------------------------------ */}
      <Section
        title="Login History"
        description="The last 10 sign-in attempts on your account."
      >
        {loginHistory.length === 0 ? (
          <div className="p-6 text-center bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg">
            <p className="text-sm text-[var(--foreground-secondary)]">No login history available</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {loginHistory.slice(0, 10).map((entry) => (
              <div key={entry.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--foreground)] truncate">{entry.device}</p>
                  <p className="text-xs text-[var(--foreground-secondary)]">
                    {entry.ip} · {formatDate(entry.date)}
                  </p>
                </div>
                <span
                  className={`ml-3 flex-shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                    entry.success
                      ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                      : 'bg-[var(--error)]/10 text-[var(--error)]'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      entry.success ? 'bg-[var(--accent)]' : 'bg-[var(--error)]'
                    }`}
                  />
                  {entry.success ? 'Success' : 'Failed'}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="pt-3 border-t border-[var(--border)]">
          <a
            href="mailto:security@gitgram.app?subject=Suspicious%20Activity%20Report"
            className="text-sm text-[var(--error)] hover:underline"
          >
            Suspicious activity? Report it
          </a>
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 4. Connected Apps                                                   */}
      {/* ------------------------------------------------------------------ */}
      <Section
        title="Connected Apps"
        description="Third-party applications authorised to access your account."
      >
        {connectedApps.length === 0 ? (
          <div className="p-6 text-center bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg">
            <p className="text-sm text-[var(--foreground-secondary)]">
              No connected applications
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {connectedApps.map((app) => (
              <div
                key={app.id}
                className="flex items-start justify-between p-4 bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg gap-4"
              >
                <div className="flex items-start gap-3 min-w-0">
                  {app.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={app.iconUrl}
                      alt={`${app.name} icon`}
                      className="w-9 h-9 rounded-lg object-cover border border-[var(--border)] flex-shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center flex-shrink-0">
                      <svg
                        className="w-5 h-5 text-[var(--foreground-secondary)]"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--foreground)] truncate">
                      {app.name}
                    </p>
                    {app.description && (
                      <p className="text-xs text-[var(--foreground-secondary)] mt-0.5 line-clamp-1">
                        {app.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {app.scopes.map((scope) => (
                        <span
                          key={scope}
                          className="px-1.5 py-0.5 text-xs bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--foreground-secondary)] font-mono"
                        >
                          {scope}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-[var(--foreground-secondary)] mt-1.5">
                      Authorised {formatDate(app.authorizedAt)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleRevokeApp(app.id)}
                  disabled={revokingAppId === app.id}
                  className={`${dangerBtnCls} flex-shrink-0`}
                >
                  {revokingAppId === app.id ? 'Revoking…' : 'Revoke'}
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 5. Security Keys (WebAuthn)                                         */}
      {/* ------------------------------------------------------------------ */}
      <Section
        title="Security Keys"
        description="Physical hardware keys (FIDO2 / WebAuthn) for passwordless or second-factor authentication."
      >
        {securityKeys.length === 0 ? (
          <div className="p-6 text-center bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg">
            <svg
              className="w-10 h-10 text-[var(--foreground-secondary)] mx-auto mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
            <p className="text-sm text-[var(--foreground-secondary)]">No security keys registered</p>
            <p className="text-xs text-[var(--foreground-secondary)] mt-1">
              Use a YubiKey, Touch ID, or Face ID as a phishing-resistant authenticator.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {securityKeys.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between p-4 bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center flex-shrink-0">
                    <svg
                      className="w-5 h-5 text-[var(--foreground-secondary)]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                      />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--foreground)] truncate">
                      {key.name}
                    </p>
                    <p className="text-xs text-[var(--foreground-secondary)]">
                      Added {formatDate(key.createdAt)}
                      {key.lastUsed && ` · Last used ${formatRelative(key.lastUsed)}`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveKey(key.id)}
                  disabled={removingKeyId === key.id}
                  className={`${dangerBtnCls} ml-3 flex-shrink-0`}
                >
                  {removingKeyId === key.id ? 'Removing…' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleRegisterKey}
          disabled={registeringKey}
          className={`${ghostBtnCls} flex items-center gap-2`}
        >
          {registeringKey ? (
            <>
              <span className="animate-spin w-4 h-4 border-2 border-[var(--foreground-secondary)] border-t-transparent rounded-full" />
              Waiting for key…
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Register new security key
            </>
          )}
        </button>
      </Section>
    </div>
  )
}
