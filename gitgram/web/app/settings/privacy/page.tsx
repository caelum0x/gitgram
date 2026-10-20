'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useRouter } from 'next/navigation'
import { settingsService } from '@/services/settingsService'
import { requestAndDownloadDataExport, DataExportTimeoutError } from '@/utils/dataExportFlow'

// ─── Types ────────────────────────────────────────────────────────────────────

type DmPermission = 'everyone' | 'followers' | 'nobody'

interface PrivacySettings {
  isPrivate: boolean
  showInDiscovery: boolean
  dmPermission: DmPermission
  showActivityStatus: boolean
  hideLikesCount: boolean
  twoFactorEnabled: boolean
}

const DEFAULT_SETTINGS: PrivacySettings = {
  isPrivate: false,
  showInDiscovery: true,
  dmPermission: 'everyone',
  showActivityStatus: true,
  hideLikesCount: false,
  twoFactorEnabled: false,
}

function fromApi(data: Record<string, unknown>): PrivacySettings {
  return {
    isPrivate: (data.isPrivate as boolean) ?? DEFAULT_SETTINGS.isPrivate,
    showInDiscovery: (data.showInDiscovery as boolean) ?? DEFAULT_SETTINGS.showInDiscovery,
    dmPermission: (data.dmPermission as DmPermission) ?? DEFAULT_SETTINGS.dmPermission,
    showActivityStatus: (data.showActivityStatus as boolean) ?? DEFAULT_SETTINGS.showActivityStatus,
    hideLikesCount: (data.hideLikesCount as boolean) ?? DEFAULT_SETTINGS.hideLikesCount,
    twoFactorEnabled: (data.twoFactorEnabled as boolean) ?? DEFAULT_SETTINGS.twoFactorEnabled,
  }
}

// ─── Primitives ───────────────────────────────────────────────────────────────

interface ToggleProps {
  checked: boolean
  onChange: () => void
  disabled?: boolean
}

function Toggle({ checked, onChange, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      style={{
        position: 'relative',
        width: '48px',
        height: '26px',
        borderRadius: '9999px',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background-color 0.2s',
        backgroundColor: disabled ? '#2d2d44' : checked ? '#7C3AED' : '#2d2d44',
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '3px',
          left: checked ? '25px' : '3px',
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          backgroundColor: '#ffffff',
          transition: 'left 0.2s',
        }}
      />
    </button>
  )
}

interface SettingRowProps {
  label: string
  description: string
  checked: boolean
  onChange: () => void
  disabled?: boolean
  last?: boolean
}

function SettingRow({ label, description, checked, onChange, disabled = false, last = false }: SettingRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        padding: '14px 0',
        borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 500, fontSize: '15px', color: '#e2e8f0' }}>{label}</p>
        <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#6b7280' }}>{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  )
}

interface SectionCardProps {
  title: string
  subtitle?: string
  children: React.ReactNode
  danger?: boolean
}

function SectionCard({ title, subtitle, children, danger = false }: SectionCardProps) {
  return (
    <div
      style={{
        backgroundColor: danger ? 'rgba(218,54,51,0.06)' : '#1A1A2E',
        borderRadius: '12px',
        border: danger ? '1px solid rgba(218,54,51,0.3)' : '1px solid rgba(255,255,255,0.08)',
        padding: '20px 24px',
      }}
    >
      <h2
        style={{
          margin: '0 0 4px',
          fontSize: '17px',
          fontWeight: 600,
          color: danger ? '#ef4444' : '#e2e8f0',
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#6b7280' }}>{subtitle}</p>
      )}
      <div style={{ marginTop: subtitle ? 0 : '12px' }}>{children}</div>
    </div>
  )
}

// ─── Delete Account Modal ─────────────────────────────────────────────────────

interface DeleteModalProps {
  username: string
  onConfirm: () => void
  onCancel: () => void
  deleting: boolean
}

function DeleteAccountModal({ username, onConfirm, onCancel, deleting }: DeleteModalProps) {
  const [typed, setTyped] = useState('')

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
    >
      <div
        style={{
          backgroundColor: '#1A1A2E',
          border: '1px solid rgba(218,54,51,0.4)',
          borderRadius: '16px',
          padding: '32px',
          maxWidth: '460px',
          width: '100%',
        }}
      >
        <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 700, color: '#ef4444' }}>
          Delete Account
        </h2>
        <p style={{ margin: '0 0 20px', fontSize: '14px', color: '#9ca3af', lineHeight: 1.6 }}>
          This action is permanent and cannot be undone. All your posts, followers, repositories,
          and data will be deleted immediately.
        </p>
        <p style={{ margin: '0 0 10px', fontSize: '14px', color: '#e2e8f0' }}>
          Type <strong style={{ color: '#ef4444' }}>{username}</strong> to confirm:
        </p>
        <input
          type="text"
          value={typed}
          onChange={e => setTyped(e.target.value)}
          placeholder={username}
          autoFocus
          style={{
            width: '100%',
            padding: '10px 14px',
            backgroundColor: '#0F0F1A',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '8px',
            color: '#e2e8f0',
            fontSize: '15px',
            outline: 'none',
            marginBottom: '20px',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '11px',
              backgroundColor: 'transparent',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '8px',
              color: '#9ca3af',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={typed !== username || deleting}
            style={{
              flex: 1,
              padding: '11px',
              backgroundColor: typed === username ? '#ef4444' : '#3a1a1a',
              border: 'none',
              borderRadius: '8px',
              color: typed === username ? '#fff' : '#6b7280',
              fontSize: '15px',
              fontWeight: 600,
              cursor: typed === username && !deleting ? 'pointer' : 'not-allowed',
              transition: 'background-color 0.2s',
            }}
          >
            {deleting ? 'Deleting...' : 'Delete My Account'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PrivacySettingsPage() {
  const router = useRouter()
  const { isAuthenticated, user, logout } = useAuthStore()

  const [settings, setSettings] = useState<PrivacySettings>(DEFAULT_SETTINGS)
  const [pageLoading, setPageLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [exportLoading, setExportLoading] = useState(false)
  const [exportMessage, setExportMessage] = useState<string | null>(null)

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [toggling2FA, setToggling2FA] = useState(false)
  const [tfaMessage, setTfaMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) router.replace('/login')
  }, [isAuthenticated, router])

  useEffect(() => {
    if (!isAuthenticated) return
    const load = async () => {
      setPageLoading(true)
      setPageError(null)
      try {
        const data = await settingsService.getPrivacySettings()
        setSettings(fromApi(data as Record<string, unknown>))
      } catch (err: unknown) {
        setPageError('Failed to load privacy settings. Please try again.')
      } finally {
        setPageLoading(false)
      }
    }
    load()
  }, [isAuthenticated])

  const toggle = useCallback((key: keyof Omit<PrivacySettings, 'dmPermission'>) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }))
    setSaved(false)
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await settingsService.updatePrivacySettings({
        isPrivate: settings.isPrivate,
        showInDiscovery: settings.showInDiscovery,
        dmPermission: settings.dmPermission,
        showActivityStatus: settings.showActivityStatus,
        hideLikesCount: settings.hideLikesCount,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }, [settings])

  const handleDataExport = useCallback(async () => {
    setExportLoading(true)
    setExportMessage(null)
    try {
      await requestAndDownloadDataExport((phase) => {
        if (phase === 'processing') setExportMessage('Preparing your export… this can take a couple of minutes.')
        if (phase === 'downloading') setExportMessage('Export ready — starting download…')
      })
      setExportMessage('Your data export downloaded successfully.')
    } catch (err: unknown) {
      setExportMessage(
        err instanceof DataExportTimeoutError
          ? 'Still preparing your export. Please check back in a few minutes.'
          : err instanceof Error
            ? `Failed: ${err.message}`
            : 'Failed to request data export. Please try again.',
      )
    } finally {
      setExportLoading(false)
    }
  }, [])

  const handle2FAToggle = useCallback(async () => {
    setToggling2FA(true)
    setTfaMessage(null)
    try {
      if (settings.twoFactorEnabled) {
        router.push('/settings/2fa')
      } else {
        router.push('/settings/2fa')
      }
    } catch (err: unknown) {
      setTfaMessage('Failed to update 2FA settings.')
      setToggling2FA(false)
    }
  }, [settings.twoFactorEnabled, router])

  const handleDeleteAccount = useCallback(async () => {
    setDeleting(true)
    try {
      await logout()
      router.replace('/')
    } catch (err: unknown) {
      setDeleting(false)
      setShowDeleteModal(false)
    }
  }, [logout, router])

  if (!isAuthenticated) return null

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (pageLoading) {
    return (
      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '32px 16px' }}>
        <div
          style={{
            height: '34px',
            width: '200px',
            backgroundColor: '#1A1A2E',
            borderRadius: '6px',
            marginBottom: '32px',
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div
              key={i}
              style={{
                backgroundColor: '#1A1A2E',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.08)',
                height: '120px',
              }}
            />
          ))}
        </div>
      </div>
    )
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (pageError) {
    return (
      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '32px 16px' }}>
        <h1 style={{ margin: '0 0 32px', fontSize: '26px', fontWeight: 700, color: '#e2e8f0' }}>
          Privacy Settings
        </h1>
        <div
          style={{
            backgroundColor: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '12px',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#ef4444' }}>Failed to Load Settings</p>
          <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#6b7280' }}>{pageError}</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px',
              backgroundColor: '#7C3AED',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {showDeleteModal && (
        <DeleteAccountModal
          username={user?.username ?? 'my-username'}
          onConfirm={handleDeleteAccount}
          onCancel={() => setShowDeleteModal(false)}
          deleting={deleting}
        />
      )}

      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#0F0F1A',
          padding: '32px 16px 80px',
        }}
      >
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>

          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '32px',
            }}
          >
            <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 700, color: '#e2e8f0' }}>
              Privacy Settings
            </h1>
            <span
              style={{
                padding: '6px 14px',
                backgroundColor: 'rgba(34,197,94,0.15)',
                border: '1px solid rgba(34,197,94,0.4)',
                borderRadius: '9999px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#22c55e',
                transition: 'opacity 0.3s',
                opacity: saved ? 1 : 0,
                pointerEvents: 'none',
              }}
            >
              Saved
            </span>
          </div>

          {saveError && (
            <div
              style={{
                backgroundColor: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '16px',
                fontSize: '14px',
                color: '#ef4444',
              }}
            >
              {saveError}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* ── 1. Account Visibility ─────────────────────────────────────── */}
            <SectionCard
              title="Account Visibility"
              subtitle="Control who can see your profile and content."
            >
              {/* Public / Private radio */}
              <div
                style={{
                  padding: '14px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.07)',
                }}
              >
                <p style={{ margin: '0 0 10px', fontWeight: 500, fontSize: '15px', color: '#e2e8f0' }}>
                  Account Privacy
                </p>
                <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#6b7280' }}>
                  Private accounts require approval before new followers can see your posts.
                </p>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {(['public', 'private'] as const).map(opt => (
                    <label
                      key={opt}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 20px',
                        borderRadius: '8px',
                        border: `1px solid ${(settings.isPrivate ? 'private' : 'public') === opt ? '#7C3AED' : 'rgba(255,255,255,0.12)'}`,
                        backgroundColor: (settings.isPrivate ? 'private' : 'public') === opt ? 'rgba(124,58,237,0.12)' : 'transparent',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#e2e8f0',
                      }}
                    >
                      <input
                        type="radio"
                        name="accountPrivacy"
                        checked={(settings.isPrivate ? 'private' : 'public') === opt}
                        onChange={() =>
                          setSettings(prev => ({ ...prev, isPrivate: opt === 'private' }))
                        }
                        style={{ accentColor: '#7C3AED' }}
                      />
                      {opt === 'public' ? 'Public' : 'Private'}
                    </label>
                  ))}
                </div>
              </div>

              <SettingRow
                label="Show in Discovery"
                description="Allow your profile to appear in Explore, suggestions, and search results"
                checked={settings.showInDiscovery}
                onChange={() => toggle('showInDiscovery')}
              />
              <SettingRow
                label="Show Activity Status"
                description="Let others see when you were last active on Gitgram"
                checked={settings.showActivityStatus}
                onChange={() => toggle('showActivityStatus')}
              />
              <SettingRow
                label="Hide Likes Count"
                description="Others won't see how many likes your posts have received"
                checked={settings.hideLikesCount}
                onChange={() => toggle('hideLikesCount')}
                last
              />
            </SectionCard>

            {/* ── 2. Direct Messages ────────────────────────────────────────── */}
            <SectionCard
              title="Direct Messages"
              subtitle="Choose who can send you direct messages."
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px 0' }}>
                {([
                  { value: 'everyone', label: 'Everyone', desc: 'Anyone on Gitgram can message you' },
                  { value: 'followers', label: 'Followers Only', desc: 'Only people you follow back can message you' },
                  { value: 'nobody', label: 'Nobody', desc: 'Disable all incoming messages' },
                ] as const).map(opt => (
                  <label
                    key={opt.value}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: `1px solid ${settings.dmPermission === opt.value ? '#7C3AED' : 'rgba(255,255,255,0.08)'}`,
                      backgroundColor: settings.dmPermission === opt.value ? 'rgba(124,58,237,0.1)' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="dmPermission"
                      checked={settings.dmPermission === opt.value}
                      onChange={() => setSettings(prev => ({ ...prev, dmPermission: opt.value }))}
                      style={{ accentColor: '#7C3AED', flexShrink: 0 }}
                    />
                    <div>
                      <p style={{ margin: 0, fontWeight: 500, fontSize: '14px', color: '#e2e8f0' }}>
                        {opt.label}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#6b7280' }}>
                        {opt.desc}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </SectionCard>

            {/* ── 3. Two-Factor Authentication ──────────────────────────────── */}
            <SectionCard
              title="Two-Factor Authentication"
              subtitle="Add an extra layer of security to your account."
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  padding: '4px 0',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                    <span
                      style={{
                        padding: '2px 10px',
                        borderRadius: '9999px',
                        fontSize: '12px',
                        fontWeight: 700,
                        backgroundColor: settings.twoFactorEnabled ? 'rgba(34,197,94,0.15)' : 'rgba(107,114,128,0.2)',
                        color: settings.twoFactorEnabled ? '#22c55e' : '#9ca3af',
                      }}
                    >
                      {settings.twoFactorEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
                    {settings.twoFactorEnabled
                      ? 'Your account is protected with two-factor authentication.'
                      : 'Enable 2FA with an authenticator app to protect your account.'}
                  </p>
                  {tfaMessage && (
                    <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#a78bfa' }}>{tfaMessage}</p>
                  )}
                </div>
                <button
                  onClick={handle2FAToggle}
                  disabled={toggling2FA}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: settings.twoFactorEnabled ? 'rgba(239,68,68,0.15)' : 'rgba(124,58,237,0.2)',
                    border: `1px solid ${settings.twoFactorEnabled ? 'rgba(239,68,68,0.4)' : 'rgba(124,58,237,0.4)'}`,
                    borderRadius: '8px',
                    color: settings.twoFactorEnabled ? '#ef4444' : '#a78bfa',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: toggling2FA ? 'not-allowed' : 'pointer',
                    opacity: toggling2FA ? 0.6 : 1,
                    flexShrink: 0,
                  }}
                >
                  {settings.twoFactorEnabled ? 'Manage 2FA' : 'Enable 2FA'}
                </button>
              </div>
            </SectionCard>

            {/* ── 4. Save Button ────────────────────────────────────────────── */}
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                width: '100%',
                padding: '14px',
                backgroundColor: saving ? '#4a3a7d' : '#7C3AED',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s',
              }}
            >
              {saving ? 'Saving...' : 'Save Privacy Settings'}
            </button>

            {/* ── 5. Your Data ──────────────────────────────────────────────── */}
            <SectionCard
              title="Your Data"
              subtitle="Request a full export of all data Gitgram holds about your account."
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '16px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <p style={{ margin: 0, fontSize: '13px', color: '#6b7280', lineHeight: 1.6 }}>
                    Includes your posts, followers, messages, repositories, and account metadata.
                    Preparation takes a couple of minutes; the file downloads automatically when ready.
                  </p>
                  {exportMessage && (
                    <p
                      style={{
                        margin: '10px 0 0',
                        fontSize: '13px',
                        color: exportMessage.startsWith('Failed') ? '#ef4444' : '#22c55e',
                      }}
                    >
                      {exportMessage}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleDataExport}
                  disabled={exportLoading}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: 'rgba(88,166,255,0.1)',
                    border: '1px solid rgba(88,166,255,0.3)',
                    borderRadius: '8px',
                    color: '#58a6ff',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: exportLoading ? 'not-allowed' : 'pointer',
                    opacity: exportLoading ? 0.6 : 1,
                    flexShrink: 0,
                  }}
                >
                  {exportLoading ? 'Requesting...' : 'Download My Data'}
                </button>
              </div>
            </SectionCard>

            {/* ── 6. Danger Zone ────────────────────────────────────────────── */}
            <SectionCard
              title="Danger Zone"
              subtitle="Permanent actions that cannot be reversed."
              danger
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '16px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: '15px', color: '#ef4444' }}>
                    Delete Account
                  </p>
                  <p style={{ margin: 0, fontSize: '13px', color: '#6b7280', lineHeight: 1.6 }}>
                    Permanently delete your account and all associated data. This cannot be undone.
                    All followers, posts, and repositories will be removed.
                  </p>
                </div>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.4)',
                    borderRadius: '8px',
                    color: '#ef4444',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  Delete Account
                </button>
              </div>
            </SectionCard>

          </div>
        </div>
      </div>
    </>
  )
}
