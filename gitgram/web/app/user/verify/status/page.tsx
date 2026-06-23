'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import api from '@/services/api'

export default function VerificationStatusPage() {
  const [status, setStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStatus()
  }, [])

  const loadStatus = async () => {
    try {
      const response = await api.get('/v1/verification/status')
      setStatus(response.data.status || response.data)
    } catch (error) {
      console.error('Load verification status error:', error)
    } finally {
      setLoading(false)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Verification Status</h1>

        <div className="bg-surface rounded-lg p-6">
          {status?.isVerified ? (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">✅</span>
                <div>
                  <p className="text-lg font-semibold text-foreground">Verified Account</p>
                  {status.isGoldenVerified && (
                    <p className="text-sm text-yellow-500">🌟 Golden Verified</p>
                  )}
                </div>
              </div>
              <p className="text-foreground/70">
                Your account has been verified.
              </p>
            </div>
          ) : status?.isPending ? (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">⏳</span>
                <p className="text-lg font-semibold text-foreground">Verification Pending</p>
              </div>
              <p className="text-foreground/70">
                Your verification request is being reviewed. We'll notify you once it's processed.
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">❌</span>
                <p className="text-lg font-semibold text-foreground">Not Verified</p>
              </div>
              <p className="text-foreground/70 mb-4">
                Your account is not verified. Request verification to get a verified badge.
              </p>
              <Link
                href="/user/verify/request"
                className="inline-block px-6 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90"
              >
                Request Verification
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
