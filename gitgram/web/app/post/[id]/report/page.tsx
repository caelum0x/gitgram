'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import api from '@/services/api'

export default function ReportPostPage() {
  const params = useParams()
  const router = useRouter()
  const postId = params.id as string
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const reasons = [
    'Spam',
    'Harassment or bullying',
    'Hate speech',
    'Violence or dangerous content',
    'Copyright infringement',
    'Other',
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reason) return

    setSubmitting(true)
    try {
      await api.post(`/v1/posts/${postId}/report`, { reason })
      router.push(`/post/${postId}`)
    } catch (error) {
      console.error('Report post error:', error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Report Post</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Reason for reporting
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
