'use client'

import { useState } from 'react'
import api from '@/services/api'
import { useToast } from '@/components/ui/toast'

export default function ExportDataPage() {
  const { showToast } = useToast()
  const [exporting, setExporting] = useState(false)

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
      showToast('Failed to export data', 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Export Data</h1>
        <div className="bg-surface rounded-lg p-6 mb-6">
          <p className="text-foreground mb-4">
            Download a copy of all your data including posts, reels, messages, and account information.
          </p>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-6 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {exporting ? 'Exporting...' : 'Export Data'}
          </button>
        </div>
      </div>
    </div>
  )
}

