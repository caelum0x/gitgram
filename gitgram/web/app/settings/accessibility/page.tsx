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

interface AccessibilitySettings {
  reduceMotion: boolean
  highContrast: boolean
  fontScale: number
  alwaysShowAltText: boolean
  keyboardShortcuts: boolean
  screenReaderOptimizations: boolean
}

const STORAGE_KEY = 'gitgram:accessibility-settings'

const DEFAULT_SETTINGS: AccessibilitySettings = {
  reduceMotion: false,
  highContrast: false,
  fontScale: 100,
  alwaysShowAltText: false,
  keyboardShortcuts: true,
  screenReaderOptimizations: false,
}

const FONT_SCALE_MIN = 80
const FONT_SCALE_MAX = 150
const FONT_SCALE_STEP = 10

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function loadFromStorage(): AccessibilitySettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<AccessibilitySettings>
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function saveToStorage(settings: AccessibilitySettings): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // localStorage may be unavailable (private mode / quota) — ignore.
  }
}

function applyToDocument(settings: AccessibilitySettings): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.toggle('reduce-motion', settings.reduceMotion)
  root.classList.toggle('high-contrast', settings.highContrast)
  root.classList.toggle('always-show-alt', settings.alwaysShowAltText)
  root.style.setProperty('--font-scale', String(settings.fontScale / 100))
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

interface ToggleRowProps {
  label: string
  description: string
  checked: boolean
  onChange: (next: boolean) => void
}

function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--foreground)]">{label}</p>
        <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 focus:ring-offset-[var(--surface)] ${
          checked ? 'bg-[var(--primary)]' : 'bg-[var(--surface-secondary)]'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AccessibilitySettingsPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const { showToast } = useToast()

  const [settings, setSettings] = useState<AccessibilitySettings>(DEFAULT_SETTINGS)
  const [saving, setSaving] = useState(false)

  // -------------------------------------------------------------------------
  // Auth guard
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated) router.replace('/login')
  }, [isAuthenticated, router])

  // -------------------------------------------------------------------------
  // Hydrate from localStorage on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    const stored = loadFromStorage()
    setSettings(stored)
    applyToDocument(stored)
  }, [])

  // -------------------------------------------------------------------------
  // Persist any change: localStorage immediately, server debounced
  // -------------------------------------------------------------------------
  const persist = useCallback(
    async (next: AccessibilitySettings) => {
      saveToStorage(next)
      applyToDocument(next)
      setSaving(true)
      try {
        await api.patch('/v1/users/accessibility-settings', next)
      } catch (error: unknown) {
        // localStorage already holds the change; surface but don't revert.
        showToast(getErrorMessage(error), 'error')
      } finally {
        setSaving(false)
      }
    },
    [showToast],
  )

  const updateSetting = useCallback(
    <K extends keyof AccessibilitySettings>(key: K, value: AccessibilitySettings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value }
        void persist(next)
        return next
      })
    },
    [persist],
  )

  if (!isAuthenticated) return null

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Accessibility</h1>
          <p className="text-sm text-[var(--foreground-secondary)] mt-1">
            Customise Gitgram to suit your vision, motion, and input preferences.
          </p>
        </div>
        {saving && (
          <span className="text-xs text-[var(--foreground-secondary)] flex items-center gap-1.5 mt-2 flex-shrink-0">
            <span className="animate-spin w-3 h-3 border-2 border-[var(--foreground-secondary)] border-t-transparent rounded-full" />
            Saving…
          </span>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Display & motion                                                    */}
      {/* ------------------------------------------------------------------ */}
      <Section
        title="Display & Motion"
        description="Control animations, contrast, and text size."
      >
        <ToggleRow
          label="Reduce motion"
          description="Minimise animations and transitions across the interface."
          checked={settings.reduceMotion}
          onChange={(v) => updateSetting('reduceMotion', v)}
        />
        <div className="border-t border-[var(--border)]" />
        <ToggleRow
          label="High contrast mode"
          description="Increase colour contrast for improved legibility."
          checked={settings.highContrast}
          onChange={(v) => updateSetting('highContrast', v)}
        />
        <div className="border-t border-[var(--border)]" />
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-[var(--foreground)]">Font size</p>
            <span className="text-xs text-[var(--foreground-secondary)] tabular-nums">
              {settings.fontScale}%
            </span>
          </div>
          <input
            type="range"
            min={FONT_SCALE_MIN}
            max={FONT_SCALE_MAX}
            step={FONT_SCALE_STEP}
            value={settings.fontScale}
            onChange={(e) => updateSetting('fontScale', Number(e.target.value))}
            aria-label="Font size scale"
            className="w-full accent-[var(--primary)] cursor-pointer"
          />
          <div className="flex justify-between text-xs text-[var(--foreground-secondary)] mt-1">
            <span>Smaller</span>
            <span>Default</span>
            <span>Larger</span>
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* Content & navigation                                                */}
      {/* ------------------------------------------------------------------ */}
      <Section
        title="Content & Navigation"
        description="Adjust how content is presented and how you move around the app."
      >
        <ToggleRow
          label="Always show alt text"
          description="Display image descriptions beneath every image."
          checked={settings.alwaysShowAltText}
          onChange={(v) => updateSetting('alwaysShowAltText', v)}
        />
        <div className="border-t border-[var(--border)]" />
        <ToggleRow
          label="Keyboard shortcuts"
          description="Enable single-key shortcuts for navigation and actions."
          checked={settings.keyboardShortcuts}
          onChange={(v) => updateSetting('keyboardShortcuts', v)}
        />
        <div className="border-t border-[var(--border)]" />
        <ToggleRow
          label="Screen reader optimizations"
          description="Add extra ARIA labels and announcements for assistive technology."
          checked={settings.screenReaderOptimizations}
          onChange={(v) => updateSetting('screenReaderOptimizations', v)}
        />
      </Section>

      <p className="text-xs text-[var(--foreground-secondary)] text-center">
        Changes are saved automatically and synced across your devices.
      </p>
    </div>
  )
}
