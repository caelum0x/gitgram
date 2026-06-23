'use client'
import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useRouter } from 'next/navigation'
import { settingsService } from '@/services/settingsService'
import { useToast } from '@/components/ui/toast'

type Theme = 'system' | 'light' | 'dark'

interface PreferencesState {
  theme: Theme
  showSensitiveContent: boolean
  autoplayVideos: boolean
}

export default function PreferencesPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const { showToast } = useToast()

  const [preferences, setPreferences] = useState<PreferencesState>({
    theme: 'system',
    showSensitiveContent: false,
    autoplayVideos: true,
  })
  const [pageLoading, setPageLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) router.replace('/login')
  }, [isAuthenticated, router])

  useEffect(() => {
    const loadPreferences = async () => {
      setPageLoading(true)
      setPageError(null)
      try {
        const data = await settingsService.getAppearanceSettings()
        setPreferences({
          theme: data.theme ?? 'system',
          showSensitiveContent: data.showSensitiveContent ?? false,
          autoplayVideos: data.autoplayVideos ?? true,
        })
      } catch (error: unknown) {
        console.error('Failed to load preferences:', error)
        setPageError('Failed to load preferences. Please try again.')
      } finally {
        setPageLoading(false)
      }
    }

    if (isAuthenticated) {
      loadPreferences()
    }
  }, [isAuthenticated])

  if (!isAuthenticated) return null

  const handleThemeChange = (theme: Theme) => {
    setPreferences(prev => ({ ...prev, theme }))
  }

  const handleToggle = (key: 'showSensitiveContent' | 'autoplayVideos') => {
    setPreferences(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await settingsService.updateAppearanceSettings(preferences)
      showToast('Preferences saved!', 'success')
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to save preferences'
      showToast(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const themeOptions: { value: Theme; label: string; description: string; icon: React.ReactNode }[] = [
    {
      value: 'system',
      label: 'System',
      description: 'Follow your device settings',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      value: 'light',
      label: 'Light',
      description: 'Light background with dark text',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      value: 'dark',
      label: 'Dark',
      description: 'Dark background with light text',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      ),
    },
  ]

  if (pageLoading) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="h-9 w-48 bg-muted rounded animate-pulse mb-8" />
        <div className="space-y-6">
          {[1, 2].map((i) => (
            <div key={i} className="p-6 bg-card border border-border rounded-lg space-y-4">
              <div className="h-6 w-40 bg-muted rounded animate-pulse" />
              <div className="space-y-3">
                <div className="h-4 w-full bg-muted rounded animate-pulse" />
                <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
              </div>
              <div className="h-12 w-full bg-muted rounded-lg animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (pageError) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold mb-8">Preferences</h1>
        <div className="p-6 bg-error/10 border border-error/30 rounded-lg text-center">
          <svg
            className="w-12 h-12 text-error mx-auto mb-4"
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
          <p className="text-error font-semibold mb-2">Failed to Load Settings</p>
          <p className="text-sm text-muted mb-4">{pageError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">Preferences</h1>

      <div className="space-y-6">
        {/* Appearance */}
        <div className="p-6 bg-card border border-border rounded-lg space-y-4">
          <h2 className="text-xl font-semibold">Appearance</h2>
          <p className="text-sm text-muted">Choose how the app looks to you.</p>

          <div className="grid grid-cols-3 gap-3">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => handleThemeChange(option.value)}
                className={`p-4 rounded-lg border-2 transition-colors text-center ${
                  preferences.theme === option.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className={`mx-auto mb-2 ${
                  preferences.theme === option.value ? 'text-primary' : 'text-muted'
                }`}>
                  {option.icon}
                </div>
                <p className="font-medium text-sm">{option.label}</p>
                <p className="text-xs text-muted mt-1">{option.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Content Preferences */}
        <div className="p-6 bg-card border border-border rounded-lg space-y-4">
          <h2 className="text-xl font-semibold">Content</h2>
          <p className="text-sm text-muted">Control how content is displayed.</p>

          <div className="space-y-1">
            <div className="flex items-center justify-between py-3 border-b border-border">
              <div>
                <p className="font-medium">Show Sensitive Content</p>
                <p className="text-sm text-muted">Display content marked as sensitive without a warning</p>
              </div>
              <button
                onClick={() => handleToggle('showSensitiveContent')}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  preferences.showSensitiveContent ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    preferences.showSensitiveContent ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium">Autoplay Videos</p>
                <p className="text-sm text-muted">Automatically play videos as you scroll through your feed</p>
              </div>
              <button
                onClick={() => handleToggle('autoplayVideos')}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  preferences.autoplayVideos ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    preferences.autoplayVideos ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 font-semibold"
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </div>
    </div>
  )
}
