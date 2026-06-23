'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

type Theme = 'dark' | 'light' | 'system'
type FontSize = 'small' | 'medium' | 'large'
type FeedDensity = 'comfortable' | 'compact'

interface AppearanceSettings {
  theme: Theme
  language: string
  fontSize: FontSize
  feedDensity: FeedDensity
}

const STORAGE_KEY = 'gitgram:appearance'

const DEFAULTS: AppearanceSettings = {
  theme: 'dark',
  language: 'en',
  fontSize: 'medium',
  feedDensity: 'comfortable',
}

const LANGUAGES: Array<{ code: string; label: string; flag: string }> = [
  { code: 'en', label: 'English', flag: '' },
  { code: 'es', label: 'Espanol', flag: '' },
  { code: 'fr', label: 'Francais', flag: '' },
  { code: 'de', label: 'Deutsch', flag: '' },
  { code: 'pt', label: 'Portugues', flag: '' },
  { code: 'ja', label: 'Japanese', flag: '' },
  { code: 'zh', label: 'Chinese (Simplified)', flag: '' },
  { code: 'ko', label: 'Korean', flag: '' },
  { code: 'ar', label: 'Arabic', flag: '' },
  { code: 'tr', label: 'Turkish', flag: '' },
]

function loadFromStorage(): AppearanceSettings {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<AppearanceSettings>
    return {
      theme: (parsed.theme as Theme) ?? DEFAULTS.theme,
      language: parsed.language ?? DEFAULTS.language,
      fontSize: (parsed.fontSize as FontSize) ?? DEFAULTS.fontSize,
      feedDensity: (parsed.feedDensity as FeedDensity) ?? DEFAULTS.feedDensity,
    }
  } catch {
    return DEFAULTS
  }
}

function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme
  root.setAttribute('data-theme', resolved)
}

function applyFontSize(size: FontSize): void {
  if (typeof document === 'undefined') return
  const map: Record<FontSize, string> = { small: '14px', medium: '16px', large: '18px' }
  document.documentElement.style.setProperty('--base-font-size', map[size])
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

interface OptionCardProps {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}

function OptionCard({ selected, onClick, children }: OptionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        minWidth: '120px',
        padding: '14px 12px',
        borderRadius: '10px',
        border: `2px solid ${selected ? '#7C3AED' : 'rgba(255,255,255,0.1)'}`,
        backgroundColor: selected ? 'rgba(124,58,237,0.14)' : 'transparent',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background-color 0.15s',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
      }}
    >
      {children}
    </button>
  )
}

// ─── Theme Preview Thumbnail ──────────────────────────────────────────────────

function ThemePreview({ theme }: { theme: Theme }) {
  const isDark = theme === 'dark'
  const bg = isDark ? '#0F0F1A' : '#f4f5f7'
  const bar = isDark ? '#1A1A2E' : '#ffffff'
  const line1 = isDark ? '#2d2d44' : '#e0e0e0'
  const accent = '#7C3AED'

  if (theme === 'system') {
    return (
      <div
        style={{
          width: '80px',
          height: '56px',
          borderRadius: '6px',
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
        }}
      >
        <div style={{ flex: 1, backgroundColor: '#0F0F1A' }} />
        <div style={{ flex: 1, backgroundColor: '#f4f5f7' }} />
      </div>
    )
  }

  return (
    <div
      style={{
        width: '80px',
        height: '56px',
        borderRadius: '6px',
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.1)',
        backgroundColor: bg,
        display: 'flex',
        flexDirection: 'column',
        padding: '6px',
        gap: '4px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          height: '8px',
          backgroundColor: bar,
          borderRadius: '3px',
        }}
      />
      <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
        <div
          style={{
            width: '20px',
            backgroundColor: bar,
            borderRadius: '3px',
          }}
        />
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
            justifyContent: 'center',
          }}
        >
          <div style={{ height: '3px', backgroundColor: line1, borderRadius: '2px' }} />
          <div
            style={{
              height: '3px',
              width: '60%',
              backgroundColor: accent,
              borderRadius: '2px',
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AppearanceSettingsPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()

  const [settings, setSettings] = useState<AppearanceSettings>(DEFAULTS)
  const [mounted, setMounted] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) router.replace('/login')
  }, [isAuthenticated, router])

  // Hydrate from localStorage after mount to avoid SSR mismatch
  useEffect(() => {
    const stored = loadFromStorage()
    setSettings(stored)
    setMounted(true)
    applyTheme(stored.theme)
    applyFontSize(stored.fontSize)
  }, [])

  const update = useCallback(<K extends keyof AppearanceSettings>(key: K, value: AppearanceSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setSaved(false)

    // Apply immediately for live preview
    if (key === 'theme') applyTheme(value as Theme)
    if (key === 'fontSize') applyFontSize(value as FontSize)
  }, [])

  const handleSave = useCallback(() => {
    const toSave = settings
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
    applyTheme(toSave.theme)
    applyFontSize(toSave.fontSize)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }, [settings])

  if (!isAuthenticated) return null

  // Avoid flash before localStorage is read
  if (!mounted) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#0F0F1A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: '3px solid rgba(124,58,237,0.3)',
            borderTopColor: '#7C3AED',
            animation: 'spin 0.8s linear infinite',
          }}
        />
      </div>
    )
  }

  return (
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
            Appearance
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* ── 1. Theme ──────────────────────────────────────────────────── */}
          <SectionCard title="Theme" subtitle="Choose how Gitgram looks to you. Changes apply immediately.">
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {([
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
                { value: 'system', label: 'System' },
              ] as Array<{ value: Theme; label: string }>).map(opt => (
                <OptionCard
                  key={opt.value}
                  selected={settings.theme === opt.value}
                  onClick={() => update('theme', opt.value)}
                >
                  <ThemePreview theme={opt.value} />
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: settings.theme === opt.value ? 600 : 400,
                      color: settings.theme === opt.value ? '#a78bfa' : '#9ca3af',
                    }}
                  >
                    {opt.label}
                  </span>
                  {settings.theme === opt.value && (
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: '#7C3AED',
                      }}
                    />
                  )}
                </OptionCard>
              ))}
            </div>
          </SectionCard>

          {/* ── 2. Language ───────────────────────────────────────────────── */}
          <SectionCard title="Language" subtitle="Select your preferred display language.">
            <select
              value={settings.language}
              onChange={e => update('language', e.target.value)}
              style={{
                width: '100%',
                padding: '11px 14px',
                backgroundColor: '#0F0F1A',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '8px',
                color: '#e2e8f0',
                fontSize: '15px',
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
                backgroundImage:
                  'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' viewBox=\'0 0 12 8\'%3E%3Cpath fill=\'%236b7280\' d=\'M1 1l5 5 5-5\'/%3E%3C/svg%3E")',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 14px center',
                paddingRight: '36px',
                boxSizing: 'border-box',
              }}
            >
              {LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
            <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#4b5563' }}>
              UI language change takes effect after saving and refreshing the page.
            </p>
          </SectionCard>

          {/* ── 3. Font Size ──────────────────────────────────────────────── */}
          <SectionCard title="Font Size" subtitle="Adjust the base text size across the app.">
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {([
                { value: 'small', label: 'Small', sample: '13px' },
                { value: 'medium', label: 'Medium', sample: '16px' },
                { value: 'large', label: 'Large', sample: '19px' },
              ] as Array<{ value: FontSize; label: string; sample: string }>).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update('fontSize', opt.value)}
                  style={{
                    flex: 1,
                    minWidth: '100px',
                    padding: '14px 12px',
                    borderRadius: '10px',
                    border: `2px solid ${settings.fontSize === opt.value ? '#7C3AED' : 'rgba(255,255,255,0.1)'}`,
                    backgroundColor: settings.fontSize === opt.value ? 'rgba(124,58,237,0.14)' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'border-color 0.15s',
                  }}
                >
                  <span
                    style={{
                      fontSize: opt.sample,
                      fontWeight: 700,
                      color: settings.fontSize === opt.value ? '#a78bfa' : '#e2e8f0',
                      lineHeight: 1,
                    }}
                  >
                    Aa
                  </span>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: settings.fontSize === opt.value ? 600 : 400,
                      color: settings.fontSize === opt.value ? '#a78bfa' : '#6b7280',
                    }}
                  >
                    {opt.label}
                  </span>
                </button>
              ))}
            </div>
          </SectionCard>

          {/* ── 4. Feed Density ───────────────────────────────────────────── */}
          <SectionCard
            title="Feed Density"
            subtitle="Control how much content is visible at once in your feed."
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {([
                {
                  value: 'comfortable',
                  label: 'Comfortable',
                  desc: 'Larger cards with more whitespace — easier to read',
                },
                {
                  value: 'compact',
                  label: 'Compact',
                  desc: 'Smaller cards packed closer — see more content at once',
                },
              ] as Array<{ value: FeedDensity; label: string; desc: string }>).map(opt => (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '14px 16px',
                    borderRadius: '10px',
                    border: `2px solid ${settings.feedDensity === opt.value ? '#7C3AED' : 'rgba(255,255,255,0.08)'}`,
                    backgroundColor: settings.feedDensity === opt.value ? 'rgba(124,58,237,0.1)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s',
                  }}
                >
                  <input
                    type="radio"
                    name="feedDensity"
                    checked={settings.feedDensity === opt.value}
                    onChange={() => update('feedDensity', opt.value)}
                    style={{ accentColor: '#7C3AED', flexShrink: 0 }}
                  />
                  {/* Mini density preview */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: opt.value === 'comfortable' ? '6px' : '3px',
                      width: '40px',
                      flexShrink: 0,
                    }}
                  >
                    {[1, 2, 3].map(i => (
                      <div
                        key={i}
                        style={{
                          height: opt.value === 'comfortable' ? '8px' : '5px',
                          backgroundColor: settings.feedDensity === opt.value
                            ? 'rgba(124,58,237,0.5)'
                            : 'rgba(255,255,255,0.12)',
                          borderRadius: '2px',
                        }}
                      />
                    ))}
                  </div>
                  <div>
                    <p
                      style={{
                        margin: 0,
                        fontWeight: 600,
                        fontSize: '14px',
                        color: settings.feedDensity === opt.value ? '#a78bfa' : '#e2e8f0',
                      }}
                    >
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

          {/* ── Save Button ───────────────────────────────────────────────── */}
          <button
            onClick={handleSave}
            style={{
              width: '100%',
              padding: '14px',
              backgroundColor: '#7C3AED',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              fontSize: '15px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
          >
            Save Preferences
          </button>

          <p
            style={{
              textAlign: 'center',
              fontSize: '12px',
              color: '#4b5563',
              margin: '0',
            }}
          >
            Theme and font size apply live. All preferences are stored in your browser.
          </p>

        </div>
      </div>
    </div>
  )
}
