'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'

export default function ThemeSettingsPage() {
  const router = useRouter()
  const [theme, setTheme] = useState('dark')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadTheme()
  }, [])

  const loadTheme = async () => {
    try {
      const response = await api.get('/v1/settings/appearance')
      if (response.data.settings?.theme) {
        setTheme(response.data.settings.theme)
      }
    } catch (error) {
      console.error('Load theme error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/v1/settings/appearance', { theme })
      router.back()
    } catch (error) {
      console.error('Save theme error:', error)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Theme</h1>

        <div className="space-y-6">
          <div className="bg-surface rounded-lg p-6">
            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="theme"
                  value="light"
                  checked={theme === 'light'}
                  onChange={(e) => setTheme(e.target.value)}
                  className="text-accent"
                />
                <span className="text-foreground">Light</span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="theme"
                  value="dark"
                  checked={theme === 'dark'}
                  onChange={(e) => setTheme(e.target.value)}
                  className="text-accent"
                />
                <span className="text-foreground">Dark</span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="theme"
                  value="system"
                  checked={theme === 'system'}
                  onChange={(e) => setTheme(e.target.value)}
                  className="text-accent"
                />
                <span className="text-foreground">System</span>
              </label>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-button-primary hover:bg-button-primary-hover text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={() => router.back()}
              className="px-4 py-2 bg-button-secondary hover:bg-button-secondary-hover border border-border rounded-md text-foreground text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

