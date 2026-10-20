'use client'

import { useState } from 'react'
import { useToast } from '@/components/ui/toast'
import { requestAndDownloadDataExport, DataExportTimeoutError } from '@/utils/dataExportFlow'

export default function ExportDataPage() {
  const { showToast } = useToast()
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      await requestAndDownloadDataExport((phase) => {
        if (phase === 'processing') showToast('Preparing your export… this can take a couple of minutes.', 'info')
      })
      showToast('Your data export downloaded successfully.', 'success')
    } catch (error) {
      console.error('Export data error:', error)
      showToast(
        error instanceof DataExportTimeoutError
          ? 'Still preparing your export. Please check back in a few minutes.'
          : 'Failed to export data',
        'error',
      )
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

