'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/services/api'

export default function DataSettingsPage() {
  const router = useRouter()
  const [settings, setSettings] = useState<any>({
    autoBackup: false,
    dataRetention: '30_days',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const response = await api.get('/v1/settings/data')
      if (response.data.settings) {
        setSettings(response.data.settings)
      }
    } catch (error) {
      console.error('Load data settings error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/v1/settings/data', settings)
      router.back()
    } catch (error) {
      console.error('Save data settings error:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const response = await api.get('/v1/compliance/export-data')
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gitgram-data-export-${new Date().toISOString()}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Export data error:', error)
    } finally {
      setExporting(false)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Data Settings</h1>

        <div className="space-y-6">
          <div className="bg-surface rounded-lg p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Data Export</h2>
            <p className="text-foreground/70 mb-4">
              Download a copy of all your data
            </p>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="px-6 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {exporting ? 'Exporting...' : 'Export Data'}
            </button>
          </div>

          <div className="bg-surface rounded-lg p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Data Retention</h2>
            <label className="flex items-center gap-3 mb-4">
              <input
                type="checkbox"
                checked={settings.autoBackup}
                onChange={(e) => setSettings({ ...settings, autoBackup: e.target.checked })}
                className="text-accent"
              />
              <span className="text-foreground">Enable automatic backups</span>
            </label>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Data Retention Period
              </label>
              <select
                value={settings.dataRetention}
                onChange={(e) => setSettings({ ...settings, dataRetention: e.target.value })}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="30_days">30 days</option>
                <option value="90_days">90 days</option>
                <option value="1_year">1 year</option>
                <option value="forever">Forever</option>
              </select>
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

