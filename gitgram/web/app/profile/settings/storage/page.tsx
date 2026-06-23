'use client'

import { useState, useEffect } from 'react'
import api from '@/services/api'

export default function StoragePage() {
  const [storage, setStorage] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStorage()
  }, [])

  const loadStorage = async () => {
    try {
      const response = await api.get('/v1/users/me/storage')
      setStorage(response.data.storage || response.data)
    } catch (error) {
      console.error('Load storage error:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Storage</h1>

        <div className="space-y-6">
          <div className="bg-surface rounded-lg p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Storage Usage</h2>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-foreground">Total Used</span>
                  <span className="text-foreground font-semibold">
                    {formatBytes(storage?.totalUsed || 0)}
                  </span>
                </div>
                <div className="w-full bg-background rounded-full h-2">
                  <div
                    className="bg-accent h-2 rounded-full"
                    style={{ width: `${(storage?.totalUsed || 0) / (storage?.totalAvailable || 1) * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <p className="text-foreground/70 text-sm">
                  Available: {formatBytes((storage?.totalAvailable || 0) - (storage?.totalUsed || 0))}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-surface rounded-lg p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Breakdown</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-foreground/70">Posts</span>
                <span className="text-foreground">{formatBytes(storage?.posts || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground/70">Reels</span>
                <span className="text-foreground">{formatBytes(storage?.reels || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground/70">Stories</span>
                <span className="text-foreground">{formatBytes(storage?.stories || 0)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

