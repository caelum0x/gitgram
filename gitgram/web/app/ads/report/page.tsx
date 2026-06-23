'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { adService } from '@/services/adService'

function ReportAdContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const adId = searchParams.get('adId')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const reasons = [
    'Inappropriate content',
    'Misleading information',
    'Spam',
    'Offensive',
    'Other',
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reason || !adId) return

    setSubmitting(true)
    try {
      await adService.reportAd(adId, reason)
      router.back()
    } catch (error) {
      console.error('Report ad error:', error)
    } finally {
      setSubmitting(false)
    }
  }

  if (!adId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground">Ad ID required</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Report Ad</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Reason
            </label>
            <div className="space-y-2">
              {reasons.map((r) => (
                <label key={r} className="flex items-center gap-3 p-3 bg-surface rounded-lg cursor-pointer hover:bg-surface/80">
                  <input
                    type="radio"
                    name="reason"
                    value={r}
                    checked={reason === r}
                    onChange={(e) => setReason(e.target.value)}
                    className="text-accent"
                  />
                  <span className="text-foreground">{r}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={submitting || !reason}
              className="px-6 py-2 bg-red-500 text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-2 bg-surface border border-border rounded-lg text-foreground hover:bg-surface/80"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ReportAdPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <ReportAdContent />
    </Suspense>
  )
}
