'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { notificationService } from '@/services/notificationService'

export default function NotificationSettingsPage() {
  const router = useRouter()
  const [preferences, setPreferences] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadPreferences()
  }, [])

  const loadPreferences = async () => {
    try {
      const response = await notificationService.getPreferences()
      setPreferences(response.preferences || {})
    } catch (error) {
      console.error('Load preferences error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await notificationService.updatePreferences(preferences)
      router.back()
    } catch (error) {
      console.error('Save preferences error:', error)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Notification Settings</h1>

        <div className="space-y-6">
          <div className="bg-surface rounded-lg p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Push Notifications</h2>
            <div className="space-y-4">
              {Object.entries(preferences).map(([key, value]) => (
                <label key={key} className="flex items-center justify-between">
                  <span className="text-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                  <input
                    type="checkbox"
                    checked={value as boolean}
                    onChange={(e) => setPreferences({ ...preferences, [key]: e.target.checked })}
                    className="text-accent"
                  />
                </label>
              ))}
            </div>
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

