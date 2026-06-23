'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useRouter } from 'next/navigation'
import { settingsService } from '@/services/settingsService'

// ─── Types ────────────────────────────────────────────────────────────────────

type QualityFilter = 'none' | 'moderate' | 'strict'
type RecencyBias = 'newest' | 'trending'

interface FeedSettings {
  // What you see
  showTrending: boolean
  showSponsored: boolean
  showCodeSnippets: boolean
  showRepoUpdates: boolean
  showReels: boolean
  // Content preferences — languages
  langTypeScript: boolean
  langJavaScript: boolean
  langPython: boolean
  langGo: boolean
  langRust: boolean
  langJava: boolean
  langCPlusPlus: boolean
  langCSharp: boolean
  langRuby: boolean
  langSwift: boolean
  // Content preferences — quality & topics
  qualityFilter: QualityFilter
  topicWebDev: boolean
  topicMLAI: boolean
  topicDevOps: boolean
  topicOpenSource: boolean
  topicSecurity: boolean
  topicMobile: boolean
  topicGameDev: boolean
  topicDataScience: boolean
  // Feed diversity
  newDeveloperDiscovery: number
  recencyBias: number
}

type BooleanFeedKey = {
  [K in keyof FeedSettings]: FeedSettings[K] extends boolean ? K : never
}[keyof FeedSettings]

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: FeedSettings = {
  showTrending: true,
  showSponsored: true,
  showCodeSnippets: true,
  showRepoUpdates: true,
  showReels: true,
  langTypeScript: true,
  langJavaScript: true,
  langPython: true,
  langGo: false,
  langRust: false,
  langJava: false,
  langCPlusPlus: false,
  langCSharp: false,
  langRuby: false,
  langSwift: false,
  qualityFilter: 'moderate',
  topicWebDev: true,
  topicMLAI: false,
  topicDevOps: false,
  topicOpenSource: true,
  topicSecurity: false,
  topicMobile: false,
  topicGameDev: false,
  topicDataScience: false,
  newDeveloperDiscovery: 30,
  recencyBias: 50,
}

// ─── API shape mappers ────────────────────────────────────────────────────────

function fromApi(data: Record<string, unknown>): FeedSettings {
  return {
    showTrending: (data.showTrending as boolean) ?? DEFAULT_SETTINGS.showTrending,
    showSponsored: (data.showSponsored as boolean) ?? DEFAULT_SETTINGS.showSponsored,
    showCodeSnippets: (data.showCodeSnippets as boolean) ?? DEFAULT_SETTINGS.showCodeSnippets,
    showRepoUpdates: (data.showRepoUpdates as boolean) ?? DEFAULT_SETTINGS.showRepoUpdates,
    showReels: (data.showReels as boolean) ?? DEFAULT_SETTINGS.showReels,
    langTypeScript: (data.langTypeScript as boolean) ?? DEFAULT_SETTINGS.langTypeScript,
    langJavaScript: (data.langJavaScript as boolean) ?? DEFAULT_SETTINGS.langJavaScript,
    langPython: (data.langPython as boolean) ?? DEFAULT_SETTINGS.langPython,
    langGo: (data.langGo as boolean) ?? DEFAULT_SETTINGS.langGo,
    langRust: (data.langRust as boolean) ?? DEFAULT_SETTINGS.langRust,
    langJava: (data.langJava as boolean) ?? DEFAULT_SETTINGS.langJava,
    langCPlusPlus: (data.langCPlusPlus as boolean) ?? DEFAULT_SETTINGS.langCPlusPlus,
    langCSharp: (data.langCSharp as boolean) ?? DEFAULT_SETTINGS.langCSharp,
    langRuby: (data.langRuby as boolean) ?? DEFAULT_SETTINGS.langRuby,
    langSwift: (data.langSwift as boolean) ?? DEFAULT_SETTINGS.langSwift,
    qualityFilter: (data.qualityFilter as QualityFilter) ?? DEFAULT_SETTINGS.qualityFilter,
    topicWebDev: (data.topicWebDev as boolean) ?? DEFAULT_SETTINGS.topicWebDev,
    topicMLAI: (data.topicMLAI as boolean) ?? DEFAULT_SETTINGS.topicMLAI,
    topicDevOps: (data.topicDevOps as boolean) ?? DEFAULT_SETTINGS.topicDevOps,
    topicOpenSource: (data.topicOpenSource as boolean) ?? DEFAULT_SETTINGS.topicOpenSource,
    topicSecurity: (data.topicSecurity as boolean) ?? DEFAULT_SETTINGS.topicSecurity,
    topicMobile: (data.topicMobile as boolean) ?? DEFAULT_SETTINGS.topicMobile,
    topicGameDev: (data.topicGameDev as boolean) ?? DEFAULT_SETTINGS.topicGameDev,
    topicDataScience: (data.topicDataScience as boolean) ?? DEFAULT_SETTINGS.topicDataScience,
    newDeveloperDiscovery: (data.newDeveloperDiscovery as number) ?? DEFAULT_SETTINGS.newDeveloperDiscovery,
    recencyBias: (data.recencyBias as number) ?? DEFAULT_SETTINGS.recencyBias,
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

interface ToggleRowProps {
  label: string
  description: string
  checked: boolean
  onChange: () => void
  last?: boolean
}

function ToggleRow({ label, description, checked, onChange, last = false }: ToggleRowProps) {
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
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

interface CheckboxItemProps {
  label: string
  checked: boolean
  onChange: () => void
}

function CheckboxItem({ label, checked, onChange }: CheckboxItemProps) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 12px',
        borderRadius: '8px',
        cursor: 'pointer',
        backgroundColor: checked ? 'rgba(124,58,237,0.12)' : 'transparent',
        border: `1px solid ${checked ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.08)'}`,
        transition: 'all 0.15s',
        userSelect: 'none',
      }}
    >
      <span
        style={{
          width: '18px',
          height: '18px',
          borderRadius: '4px',
          border: `2px solid ${checked ? '#7C3AED' : '#4b5563'}`,
          backgroundColor: checked ? '#7C3AED' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'all 0.15s',
        }}
      >
        {checked && (
          <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
            <path d="M1 4L4 7.5L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
      />
      <span style={{ fontSize: '14px', fontWeight: 500, color: checked ? '#c4b5fd' : '#9ca3af' }}>{label}</span>
    </label>
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
      <h2 style={{ margin: '0 0 4px', fontSize: '17px', fontWeight: 600, color: '#e2e8f0' }}>
        {title}
      </h2>
      {subtitle && (
        <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#6b7280' }}>{subtitle}</p>
      )}
      <div style={{ marginTop: subtitle ? 0 : '12px' }}>{children}</div>
    </div>
  )
}

interface SliderRowProps {
  label: string
  description: string
  value: number
  min: number
  max: number
  step: number
  leftLabel: string
  rightLabel: string
  onChange: (value: number) => void
}

function SliderRow({ label, description, value, min, max, step, leftLabel, rightLabel, onChange }: SliderRowProps) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div style={{ padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
        <p style={{ margin: 0, fontWeight: 500, fontSize: '15px', color: '#e2e8f0' }}>{label}</p>
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#a78bfa' }}>{value}</span>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#6b7280' }}>{description}</p>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          width: '100%',
          appearance: 'none',
          WebkitAppearance: 'none',
          height: '6px',
          borderRadius: '9999px',
          background: `linear-gradient(to right, #7C3AED ${pct}%, #3a3a5c ${pct}%)`,
          outline: 'none',
          cursor: 'pointer',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
        <span style={{ fontSize: '12px', color: '#4b5563' }}>{leftLabel}</span>
        <span style={{ fontSize: '12px', color: '#4b5563' }}>{rightLabel}</span>
      </div>
    </div>
  )
}

interface QualitySegmentProps {
  value: QualityFilter
  onChange: (v: QualityFilter) => void
}

function QualitySegment({ value, onChange }: QualitySegmentProps) {
  const options: { value: QualityFilter; label: string; description: string }[] = [
    { value: 'none', label: 'None', description: 'Show everything' },
    { value: 'moderate', label: 'Moderate', description: 'Filter low-quality posts' },
    { value: 'strict', label: 'Strict', description: 'Curated quality content only' },
  ]
  return (
    <div style={{ padding: '14px 0' }}>
      <p style={{ margin: '0 0 4px', fontWeight: 500, fontSize: '15px', color: '#e2e8f0' }}>
        Content quality filter
      </p>
      <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#6b7280' }}>
        Control how strictly the algorithm filters low-engagement or low-quality posts from your feed
      </p>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1,
              minWidth: '120px',
              padding: '10px 12px',
              borderRadius: '8px',
              border: `1px solid ${value === opt.value ? 'rgba(124,58,237,0.6)' : 'rgba(255,255,255,0.08)'}`,
              backgroundColor: value === opt.value ? 'rgba(124,58,237,0.15)' : 'transparent',
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'all 0.15s',
            }}
          >
            <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: value === opt.value ? '#c4b5fd' : '#9ca3af' }}>
              {opt.label}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#4b5563' }}>{opt.description}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FeedSettingsPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()

  const [settings, setSettings] = useState<FeedSettings>(DEFAULT_SETTINGS)
  const [pageLoading, setPageLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedVisible, setSavedVisible] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

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
        const data = await settingsService.getFeedSettings()
        setSettings(fromApi(data as Record<string, unknown>))
      } catch (err: unknown) {
        console.error('Failed to load feed settings:', err)
        setPageError('Failed to load feed settings. Please try again.')
      } finally {
        setPageLoading(false)
      }
    }
    load()
  }, [isAuthenticated])

  const toggleBool = useCallback((key: BooleanFeedKey) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const setSlider = useCallback((key: 'newDeveloperDiscovery' | 'recencyBias', value: number) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }, [])

  const setQuality = useCallback((value: QualityFilter) => {
    setSettings(prev => ({ ...prev, qualityFilter: value }))
  }, [])

  const handleReset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS)
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await settingsService.updateFeedSettings(settings as unknown as Record<string, unknown>)
      setSavedVisible(true)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setSavedVisible(false), 2500)
    } catch (err: unknown) {
      console.error('Failed to save feed settings:', err)
      setSaveError(err instanceof Error ? err.message : 'Failed to save feed settings')
    } finally {
      setSaving(false)
    }
  }, [settings])

  if (!isAuthenticated) return null

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (pageLoading) {
    return (
      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '32px 16px' }}>
        <div
          style={{
            height: '34px',
            width: '240px',
            backgroundColor: '#1A1A2E',
            borderRadius: '6px',
            marginBottom: '32px',
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
                height: '180px',
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
          Feed Algorithm
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

  // ── Main render ───────────────────────────────────────────────────────────
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
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: '26px', fontWeight: 700, color: '#e2e8f0' }}>
              Feed Algorithm
            </h1>
            <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
              Customize what you see and how your feed is ranked
            </p>
          </div>

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
              whiteSpace: 'nowrap',
            }}
          >
            Saved
          </span>
        </div>

        {/* Save error banner */}
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

          {/* ── Section 1: What you see ─────────────────────────────────────── */}
          <SectionCard
            title="What you see"
            subtitle="Choose the types of content that appear in your feed."
          >
            <ToggleRow
              label="Trending content from outside your network"
              description="Show posts from developers and repos you don't follow when they are gaining traction"
              checked={settings.showTrending}
              onChange={() => toggleBool('showTrending')}
            />
            <ToggleRow
              label="Sponsored posts"
              description="Allow sponsored and promoted content to appear between organic posts"
              checked={settings.showSponsored}
              onChange={() => toggleBool('showSponsored')}
            />
            <ToggleRow
              label="Code snippets in feed"
              description="Display inline code snippet cards with syntax highlighting"
              checked={settings.showCodeSnippets}
              onChange={() => toggleBool('showCodeSnippets')}
            />
            <ToggleRow
              label="Repository updates"
              description="Show activity like new releases, merged PRs, and stars from repos you follow"
              checked={settings.showRepoUpdates}
              onChange={() => toggleBool('showRepoUpdates')}
            />
            <ToggleRow
              label="Reels"
              description="Show short-form video reels in your feed"
              checked={settings.showReels}
              onChange={() => toggleBool('showReels')}
              last
            />
          </SectionCard>

          {/* ── Section 2: Content preferences ─────────────────────────────── */}
          <SectionCard
            title="Content preferences"
            subtitle="Tell the algorithm what kinds of content matter most to you."
          >
            {/* Preferred languages */}
            <div style={{ marginBottom: '20px' }}>
              <p style={{ margin: '0 0 4px', fontWeight: 500, fontSize: '15px', color: '#e2e8f0' }}>
                Preferred languages
              </p>
              <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#6b7280' }}>
                Content mentioning or using these languages will be ranked higher in your feed
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                  gap: '8px',
                }}
              >
                <CheckboxItem label="TypeScript" checked={settings.langTypeScript} onChange={() => toggleBool('langTypeScript')} />
                <CheckboxItem label="JavaScript" checked={settings.langJavaScript} onChange={() => toggleBool('langJavaScript')} />
                <CheckboxItem label="Python" checked={settings.langPython} onChange={() => toggleBool('langPython')} />
                <CheckboxItem label="Go" checked={settings.langGo} onChange={() => toggleBool('langGo')} />
                <CheckboxItem label="Rust" checked={settings.langRust} onChange={() => toggleBool('langRust')} />
                <CheckboxItem label="Java" checked={settings.langJava} onChange={() => toggleBool('langJava')} />
                <CheckboxItem label="C++" checked={settings.langCPlusPlus} onChange={() => toggleBool('langCPlusPlus')} />
                <CheckboxItem label="C#" checked={settings.langCSharp} onChange={() => toggleBool('langCSharp')} />
                <CheckboxItem label="Ruby" checked={settings.langRuby} onChange={() => toggleBool('langRuby')} />
                <CheckboxItem label="Swift" checked={settings.langSwift} onChange={() => toggleBool('langSwift')} />
              </div>
            </div>

            {/* Quality filter */}
            <div
              style={{
                borderTop: '1px solid rgba(255,255,255,0.07)',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <QualitySegment value={settings.qualityFilter} onChange={setQuality} />
            </div>

            {/* Topics of interest */}
            <div style={{ paddingTop: '16px' }}>
              <p style={{ margin: '0 0 4px', fontWeight: 500, fontSize: '15px', color: '#e2e8f0' }}>
                Topics of interest
              </p>
              <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#6b7280' }}>
                Posts tagged with these topics will appear more often in your feed
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                  gap: '8px',
                }}
              >
                <CheckboxItem label="Web Dev" checked={settings.topicWebDev} onChange={() => toggleBool('topicWebDev')} />
                <CheckboxItem label="ML / AI" checked={settings.topicMLAI} onChange={() => toggleBool('topicMLAI')} />
                <CheckboxItem label="DevOps" checked={settings.topicDevOps} onChange={() => toggleBool('topicDevOps')} />
                <CheckboxItem label="Open Source" checked={settings.topicOpenSource} onChange={() => toggleBool('topicOpenSource')} />
                <CheckboxItem label="Security" checked={settings.topicSecurity} onChange={() => toggleBool('topicSecurity')} />
                <CheckboxItem label="Mobile" checked={settings.topicMobile} onChange={() => toggleBool('topicMobile')} />
                <CheckboxItem label="Game Dev" checked={settings.topicGameDev} onChange={() => toggleBool('topicGameDev')} />
                <CheckboxItem label="Data Science" checked={settings.topicDataScience} onChange={() => toggleBool('topicDataScience')} />
              </div>
            </div>
          </SectionCard>

          {/* ── Section 3: Feed diversity ───────────────────────────────────── */}
          <SectionCard
            title="Feed diversity"
            subtitle="Control the balance between familiarity and discovery in your feed."
          >
            <SliderRow
              label="New developer discovery"
              description="How often the algorithm surfaces developers and repos you don't follow"
              value={settings.newDeveloperDiscovery}
              min={0}
              max={100}
              step={5}
              leftLabel="Only who you follow"
              rightLabel="Lots of new voices"
              onChange={v => setSlider('newDeveloperDiscovery', v)}
            />
            <div style={{ paddingTop: '4px' }}>
              <p style={{ margin: '14px 0 4px', fontWeight: 500, fontSize: '15px', color: '#e2e8f0' }}>
                Content recency bias
              </p>
              <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#6b7280' }}>
                Choose between freshness and engagement when posts compete for the same spot
              </p>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={settings.recencyBias}
                onChange={e => setSlider('recencyBias', Number(e.target.value))}
                style={{
                  width: '100%',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  height: '6px',
                  borderRadius: '9999px',
                  background: `linear-gradient(to right, #7C3AED ${settings.recencyBias}%, #3a3a5c ${settings.recencyBias}%)`,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                <span style={{ fontSize: '12px', color: '#4b5563' }}>Prefer trending</span>
                <span style={{ fontSize: '12px', color: '#7C3AED', fontWeight: 600 }}>
                  {settings.recencyBias < 35 ? 'Trending' : settings.recencyBias > 65 ? 'Newest' : 'Balanced'}
                </span>
                <span style={{ fontSize: '12px', color: '#4b5563' }}>Prefer newest</span>
              </div>
            </div>
          </SectionCard>

        </div>

        {/* ── Action buttons ─────────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            marginTop: '24px',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={handleReset}
            style={{
              flex: '0 0 auto',
              padding: '12px 24px',
              backgroundColor: 'transparent',
              color: '#9ca3af',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '15px',
              cursor: 'pointer',
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.3)'
              ;(e.currentTarget as HTMLButtonElement).style.color = '#e2e8f0'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.12)'
              ;(e.currentTarget as HTMLButtonElement).style.color = '#9ca3af'
            }}
          >
            Reset to defaults
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1,
              minWidth: '180px',
              padding: '12px 24px',
              backgroundColor: saving ? '#5b21b6' : '#7C3AED',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '15px',
              cursor: saving ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s',
              opacity: saving ? 0.8 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Save preferences'}
          </button>
        </div>

        <p
          style={{
            marginTop: '16px',
            textAlign: 'center',
            fontSize: '13px',
            color: '#4b5563',
          }}
        >
          Changes apply to your feed within a few minutes of saving.
        </p>
      </div>
    </div>
  )
}
