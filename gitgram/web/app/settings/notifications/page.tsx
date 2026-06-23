'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useRouter } from 'next/navigation'
import { settingsService } from '@/services/settingsService'

interface NotificationPreferences {
  // Push — master toggle
  pushEnabled: boolean
  // Push — per-type
  pushLikes: boolean
  pushComments: boolean
  pushFollows: boolean
  pushMentions: boolean
  pushDMs: boolean
  pushRepoStars: boolean
  // Email
  emailWeeklyDigest: boolean
  emailActivitySummary: boolean
  emailSecurityAlerts: boolean
  // Story
  storyViews: boolean
  storyReplies: boolean
  // Quiet hours
  quietHoursEnabled: boolean
  quietHoursFrom: string
  quietHoursTo: string
}

const DEFAULT_PREFS: NotificationPreferences = {
  pushEnabled: true,
  pushLikes: true,
  pushComments: true,
  pushFollows: true,
  pushMentions: true,
  pushDMs: true,
  pushRepoStars: true,
  emailWeeklyDigest: true,
  emailActivitySummary: false,
  emailSecurityAlerts: true,
  storyViews: false,
  storyReplies: true,
  quietHoursEnabled: false,
  quietHoursFrom: '22:00',
  quietHoursTo: '08:00',
}

// Map API shape → local shape
function fromApi(data: Record<string, unknown>): NotificationPreferences {
  return {
    pushEnabled: (data.pushEnabled as boolean) ?? DEFAULT_PREFS.pushEnabled,
    pushLikes: (data.likes as boolean) ?? DEFAULT_PREFS.pushLikes,
    pushComments: (data.comments as boolean) ?? DEFAULT_PREFS.pushComments,
    pushFollows: (data.follows as boolean) ?? DEFAULT_PREFS.pushFollows,
    pushMentions: (data.mentions as boolean) ?? DEFAULT_PREFS.pushMentions,
    pushDMs: (data.messages as boolean) ?? DEFAULT_PREFS.pushDMs,
    pushRepoStars: (data.repoStars as boolean) ?? DEFAULT_PREFS.pushRepoStars,
    emailWeeklyDigest: (data.emailWeeklyDigest as boolean) ?? DEFAULT_PREFS.emailWeeklyDigest,
    emailActivitySummary: (data.emailActivitySummary as boolean) ?? DEFAULT_PREFS.emailActivitySummary,
    emailSecurityAlerts: (data.emailSecurityAlerts as boolean) ?? DEFAULT_PREFS.emailSecurityAlerts,
    storyViews: (data.storyViews as boolean) ?? DEFAULT_PREFS.storyViews,
    storyReplies: (data.storyReplies as boolean) ?? DEFAULT_PREFS.storyReplies,
    quietHoursEnabled: (data.quietHoursEnabled as boolean) ?? DEFAULT_PREFS.quietHoursEnabled,
    quietHoursFrom: (data.quietHoursFrom as string) ?? DEFAULT_PREFS.quietHoursFrom,
    quietHoursTo: (data.quietHoursTo as string) ?? DEFAULT_PREFS.quietHoursTo,
  }
}

// Map local shape → API shape
function toApi(prefs: NotificationPreferences) {
  return {
    pushEnabled: prefs.pushEnabled,
    likes: prefs.pushLikes,
    comments: prefs.pushComments,
    follows: prefs.pushFollows,
    mentions: prefs.pushMentions,
    messages: prefs.pushDMs,
    repoStars: prefs.pushRepoStars,
    emailWeeklyDigest: prefs.emailWeeklyDigest,
    emailActivitySummary: prefs.emailActivitySummary,
    emailSecurityAlerts: prefs.emailSecurityAlerts,
    storyViews: prefs.storyViews,
    storyReplies: prefs.storyReplies,
    quietHoursEnabled: prefs.quietHoursEnabled,
    quietHoursFrom: prefs.quietHoursFrom,
    quietHoursTo: prefs.quietHoursTo,
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
        backgroundColor: disabled ? '#3a3a5c' : checked ? '#7C3AED' : '#3a3a5c',
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
}

function SectionCard({ title, subtitle, children }: SectionCardProps) {
  return (
    <div
      style={{
        backgroundColor: '#1A1A2E',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.08)',
        padding: '20px 24px',
      }}
    >
      <h2
        style={{
          margin: '0 0 4px',
          fontSize: '17px',
          fontWeight: 600,
          color: '#e2e8f0',
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NotificationsSettingsPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()

  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS)
  const [pageLoading, setPageLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [savedVisible, setSavedVisible] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isAuthenticated) router.replace('/login')
  }, [isAuthenticated, router])

  useEffect(() => {
    if (!isAuthenticated) return
    const load = async () => {
      setPageLoading(true)
      setPageError(null)
      try {
        const data = await settingsService.getNotificationPreferences()
        setPrefs(fromApi(data as Record<string, unknown>))
      } catch (err: unknown) {
        console.error('Failed to load notification preferences:', err)
        setPageError('Failed to load notification preferences. Please try again.')
      } finally {
        setPageLoading(false)
      }
    }
    load()
  }, [isAuthenticated])

  const scheduleSave = useCallback((nextPrefs: NotificationPreferences) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSaveError(null)
      try {
        await settingsService.updateNotificationPreferences(toApi(nextPrefs))
        setSavedVisible(true)
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
        savedTimerRef.current = setTimeout(() => setSavedVisible(false), 2000)
      } catch (err: unknown) {
        console.error('Failed to save notification preferences:', err)
        setSaveError(err instanceof Error ? err.message : 'Failed to save preferences')
      }
    }, 500)
  }, [])

  const toggle = useCallback(
    (key: keyof NotificationPreferences) => {
      setPrefs(prev => {
        const next = { ...prev, [key]: !prev[key] }
        scheduleSave(next)
        return next
      })
    },
    [scheduleSave],
  )

  const setTimeField = useCallback(
    (key: 'quietHoursFrom' | 'quietHoursTo', value: string) => {
      setPrefs(prev => {
        const next = { ...prev, [key]: value }
        scheduleSave(next)
        return next
      })
    },
    [scheduleSave],
  )

  if (!isAuthenticated) return null

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (pageLoading) {
    return (
      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '32px 16px' }}>
        <div
          style={{
            height: '34px',
            width: '220px',
            backgroundColor: '#1A1A2E',
            borderRadius: '6px',
            marginBottom: '32px',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[1, 2, 3, 4].map(i => (
            <div
              key={i}
              style={{
                backgroundColor: '#1A1A2E',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.08)',
                padding: '20px 24px',
                height: '160px',
              }}
            />
          ))}
        </div>
      </div>
    )
  }

  // ── Error state ─────────────────────────────────────────────────────────────
  if (pageError) {
    return (
      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '32px 16px' }}>
        <h1 style={{ margin: '0 0 32px', fontSize: '26px', fontWeight: 700, color: '#e2e8f0' }}>
          Notification Preferences
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

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0F0F1A',
        padding: '32px 16px 64px',
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
          <h1
            style={{
              margin: 0,
              fontSize: '26px',
              fontWeight: 700,
              color: '#e2e8f0',
            }}
          >
            Notification Preferences
          </h1>

          {/* Saved badge */}
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
              opacity: savedVisible ? 1 : 0,
              pointerEvents: 'none',
            }}
          >
            Saved
          </span>
        </div>

        {/* Save error */}
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

          {/* ── 1. Push Notifications ───────────────────────────────────────── */}
          <SectionCard
            title="Push Notifications"
            subtitle="Control which push notifications you receive on your devices."
          >
            {/* Master toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                padding: '14px 0',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <div>
                <p
                  style={{
                    margin: 0,
                    fontWeight: 600,
                    fontSize: '15px',
                    color: '#a78bfa',
                  }}
                >
                  Enable Push Notifications
                </p>
                <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#6b7280' }}>
                  Master switch — turn off to silence all push alerts
                </p>
              </div>
              <Toggle checked={prefs.pushEnabled} onChange={() => toggle('pushEnabled')} />
            </div>

            {/* Per-type rows */}
            <SettingRow
              label="Likes"
              description="When someone likes your post or comment"
              checked={prefs.pushLikes}
              onChange={() => toggle('pushLikes')}
              disabled={!prefs.pushEnabled}
            />
            <SettingRow
              label="Comments"
              description="When someone comments on your post"
              checked={prefs.pushComments}
              onChange={() => toggle('pushComments')}
              disabled={!prefs.pushEnabled}
            />
            <SettingRow
              label="New Followers"
              description="When someone follows your profile"
              checked={prefs.pushFollows}
              onChange={() => toggle('pushFollows')}
              disabled={!prefs.pushEnabled}
            />
            <SettingRow
              label="Mentions"
              description="When someone @mentions you in a post or comment"
              checked={prefs.pushMentions}
              onChange={() => toggle('pushMentions')}
              disabled={!prefs.pushEnabled}
            />
            <SettingRow
              label="Direct Messages"
              description="When you receive a new direct message"
              checked={prefs.pushDMs}
              onChange={() => toggle('pushDMs')}
              disabled={!prefs.pushEnabled}
            />
            <SettingRow
              label="Repository Stars"
              description="When someone stars one of your repositories"
              checked={prefs.pushRepoStars}
              onChange={() => toggle('pushRepoStars')}
              disabled={!prefs.pushEnabled}
              last
            />
          </SectionCard>

          {/* ── 2. Email Notifications ──────────────────────────────────────── */}
          <SectionCard
            title="Email Notifications"
            subtitle="Choose what we send to your registered email address."
          >
            <SettingRow
              label="Weekly Digest"
              description="A summary of activity across your network, sent every Monday"
              checked={prefs.emailWeeklyDigest}
              onChange={() => toggle('emailWeeklyDigest')}
            />
            <SettingRow
              label="Activity Summary"
              description="Daily recap of likes, comments, and follows on your posts"
              checked={prefs.emailActivitySummary}
              onChange={() => toggle('emailActivitySummary')}
            />
            <SettingRow
              label="Security Alerts"
              description="Important notifications about your account — password changes, new sign-ins"
              checked={prefs.emailSecurityAlerts}
              onChange={() => toggle('emailSecurityAlerts')}
              last
            />
          </SectionCard>

          {/* ── 3. Story Notifications ──────────────────────────────────────── */}
          <SectionCard
            title="Story Notifications"
            subtitle="Get notified about interactions with your stories."
          >
            <SettingRow
              label="Story Views"
              description="When someone views one of your stories"
              checked={prefs.storyViews}
              onChange={() => toggle('storyViews')}
            />
            <SettingRow
              label="Story Replies"
              description="When someone replies directly to your story"
              checked={prefs.storyReplies}
              onChange={() => toggle('storyReplies')}
              last
            />
          </SectionCard>

          {/* ── 4. Quiet Hours ──────────────────────────────────────────────── */}
          <SectionCard
            title="Quiet Hours"
            subtitle="Mute all push notifications during a time window every day."
          >
            {/* Enable quiet hours toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                padding: '14px 0',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '15px', color: '#a78bfa' }}>
                  Enable Quiet Hours
                </p>
                <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#6b7280' }}>
                  No push notifications will be delivered during the window below
                </p>
              </div>
              <Toggle checked={prefs.quietHoursEnabled} onChange={() => toggle('quietHoursEnabled')} />
            </div>

            {/* Time pickers */}
            <div
              style={{
                display: 'flex',
                gap: '16px',
                paddingTop: '16px',
                flexWrap: 'wrap',
                opacity: prefs.quietHoursEnabled ? 1 : 0.4,
                pointerEvents: prefs.quietHoursEnabled ? 'auto' : 'none',
              }}
            >
              {/* From */}
              <div style={{ flex: 1, minWidth: '140px' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#9ca3af',
                  }}
                >
                  From
                </label>
                <input
                  type="time"
                  value={prefs.quietHoursFrom}
                  onChange={e => setTimeField('quietHoursFrom', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    backgroundColor: '#0F0F1A',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '8px',
                    color: '#e2e8f0',
                    fontSize: '15px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* To */}
              <div style={{ flex: 1, minWidth: '140px' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#9ca3af',
                  }}
                >
                  To
                </label>
                <input
                  type="time"
                  value={prefs.quietHoursTo}
                  onChange={e => setTimeField('quietHoursTo', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    backgroundColor: '#0F0F1A',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '8px',
                    color: '#e2e8f0',
                    fontSize: '15px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {prefs.quietHoursEnabled && (
              <p
                style={{
                  margin: '12px 0 0',
                  fontSize: '13px',
                  color: '#6b7280',
                }}
              >
                Push notifications will be silenced from{' '}
                <strong style={{ color: '#a78bfa' }}>{prefs.quietHoursFrom}</strong>
                {' '}to{' '}
                <strong style={{ color: '#a78bfa' }}>{prefs.quietHoursTo}</strong>
                {' '}every day (24-hour format, device local time).
              </p>
            )}
          </SectionCard>

        </div>

        {/* Footer note */}
        <p
          style={{
            marginTop: '24px',
            textAlign: 'center',
            fontSize: '13px',
            color: '#4b5563',
          }}
        >
          Changes are saved automatically.
        </p>
      </div>
    </div>
  )
}
