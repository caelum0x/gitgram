'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'
import { useToast } from '@/components/ui/toast'

export default function RequestVerificationPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const [type, setType] = useState<'standard' | 'golden'>('standard')
  const [reason, setReason] = useState('')
  const [evidence, setEvidence] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reason) {
      showToast('Please provide a reason', 'warning')
      return
    }

    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('type', type)
      formData.append('reason', reason)
      if (evidence) formData.append('evidence', evidence)

      await api.post('/v1/verification/request', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      router.push('/user/verify/status')
    } catch (error) {
      console.error('Request verification error:', error)
      showToast('Failed to submit verification request', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Request Verification</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Verification Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'standard' | 'golden')}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="standard">Standard Verification</option>
              <option value="golden">Golden Verification</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Reason *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={6}
              required
              className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Explain why you should receive verification..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Evidence (optional)
            </label>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setEvidence(e.target.files?.[0] || null)}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-6 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>
      </div>
    </div>
  )
}

