'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'

export default function AdPreferencesPage() {
  const router = useRouter()
  const [preferences, setPreferences] = useState<any>({
    personalizedAds: true,
    categories: [],
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadPreferences()
  }, [])

  const loadPreferences = async () => {
    try {
      const response = await api.get('/v1/advertisements/preferences')
      if (response.data.preferences) {
        setPreferences(response.data.preferences)
      }
    } catch (error) {
      console.error('Load ad preferences error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/v1/advertisements/preferences', preferences)
      router.back()
    } catch (error) {
      console.error('Save ad preferences error:', error)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Ad Preferences</h1>

        <div className="space-y-6">
          <div className="bg-surface rounded-lg p-6">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={preferences.personalizedAds}
                onChange={(e) => setPreferences({ ...preferences, personalizedAds: e.target.checked })}
                className="text-accent"
              />
              <span className="text-foreground">Personalized ads</span>
            </label>
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={() => router.back()}
              className="px-6 py-2 bg-surface border border-border rounded-lg text-foreground hover:bg-surface/80"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
