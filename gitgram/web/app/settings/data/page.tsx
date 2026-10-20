'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/services/api'
import { requestAndDownloadDataExport, DataExportTimeoutError } from '@/utils/dataExportFlow'

export default function DataSettingsPage() {
  const router = useRouter()
  const [settings, setSettings] = useState<any>({
    autoBackup: false,
    dataRetention: '30_days',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState<string | null>(null)

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
    setExportMessage(null)
    try {
      await requestAndDownloadDataExport((phase) => {
        if (phase === 'processing') setExportMessage('Preparing your export… this can take a couple of minutes.')
        if (phase === 'downloading') setExportMessage('Export ready — starting download…')
      })
      setExportMessage('Your data export downloaded successfully.')
    } catch (error) {
      console.error('Export data error:', error)
      setExportMessage(
        error instanceof DataExportTimeoutError
          ? 'Still preparing your export. Please check back in a few minutes.'
          : error instanceof Error
            ? error.message
            : 'Failed to export data. Please try again.',
      )
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
            {exportMessage && (
              <p className="mt-3 text-sm text-foreground/70">{exportMessage}</p>
            )}
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

