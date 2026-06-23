'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import api from '@/services/api'

export default function ShareMomentPage() {
  const params = useParams()
  const router = useRouter()
  const momentId = params.id as string
  const [moment, setMoment] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadMoment()
  }, [momentId])

  const loadMoment = async () => {
    try {
      const response = await api.get(`/v1/moments/${momentId}`)
      setMoment(response.data.moment || response.data)
    } catch (error) {
      console.error('Load moment error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCopyLink = () => {
    const url = `${window.location.origin}/moments/${momentId}`
    navigator.clipboard.writeText(url)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Share Moment</h1>
        <div className="space-y-4">
          <button
            onClick={handleCopyLink}
            className="w-full px-6 py-3 bg-surface border border-border rounded-lg text-foreground hover:bg-surface/80"
          >
            Copy Link
          </button>
          <button
            onClick={() => router.back()}
            className="w-full px-6 py-2 bg-surface border border-border rounded-lg text-foreground hover:bg-surface/80"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

