'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/services/api'

export default function MessageSettingsPage() {
  const router = useRouter()
  const [settings, setSettings] = useState<any>({
    messageRequests: 'everyone',
    readReceipts: true,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const response = await api.get('/v1/messages/settings')
      if (response.data.settings) {
        setSettings(response.data.settings)
      }
    } catch (error) {
      console.error('Load message settings error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/v1/messages/settings', settings)
      router.back()
    } catch (error) {
      console.error('Save message settings error:', error)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Message Settings</h1>

        <div className="space-y-6">
          <div className="bg-surface rounded-lg p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Message Requests</h2>
            <select
              value={settings.messageRequests}
              onChange={(e) => setSettings({ ...settings, messageRequests: e.target.value })}
              className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="everyone">Everyone</option>
              <option value="followers">Followers only</option>
              <option value="none">No one</option>
            </select>
          </div>

          <div className="bg-surface rounded-lg p-6">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.readReceipts}
                onChange={(e) => setSettings({ ...settings, readReceipts: e.target.checked })}
                className="text-accent"
              />
              <span className="text-foreground">Read receipts</span>
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

