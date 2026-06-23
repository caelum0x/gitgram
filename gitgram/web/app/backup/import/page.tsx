'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'
import { useToast } from '@/components/ui/toast'

export default function ImportDataPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0])
    }
  }

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      showToast('Please select a file', 'warning')
      return
    }

    setImporting(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      await api.post('/v1/compliance/import-data', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      router.push('/settings/data')
    } catch (error) {
      console.error('Import data error:', error)
      showToast('Failed to import data', 'error')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Import Data</h1>
        <div className="bg-surface rounded-lg p-6 mb-6">
          <p className="text-foreground mb-4">
            Import your data from a previously exported JSON file.
          </p>
          <form onSubmit={handleImport} className="space-y-4">
            <input
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              type="submit"
              disabled={importing || !file}
              className="px-6 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {importing ? 'Importing...' : 'Import Data'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

