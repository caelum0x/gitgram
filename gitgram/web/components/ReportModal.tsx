'use client'

import { useState } from 'react'
import api from '@/services/api'

type TargetType = 'post' | 'user' | 'comment'

type ReportReason =
  | 'spam'
  | 'harassment'
  | 'misinformation'
  | 'inappropriate_content'
  | 'copyright_violation'
  | 'other'

interface ReportModalProps {
  isOpen: boolean
  onClose: () => void
  targetType: TargetType
  targetId: string
  targetName?: string
}

interface ReportPayload {
  targetType: TargetType
  targetId: string
  reason: ReportReason
  details?: string
}

const REPORT_REASONS: { value: ReportReason; label: string; description: string }[] = [
  { value: 'spam', label: 'Spam', description: 'Unwanted commercial content or repeated messages' },
  { value: 'harassment', label: 'Harassment', description: 'Bullying, threats, or targeted abuse' },
  { value: 'misinformation', label: 'Misinformation', description: 'False or misleading information' },
  {
    value: 'inappropriate_content',
    label: 'Inappropriate Content',
    description: 'Nudity, violence, or graphic content',
  },
  {
    value: 'copyright_violation',
    label: 'Copyright Violation',
    description: 'Unauthorized use of copyrighted material',
  },
  { value: 'other', label: 'Other', description: 'Something else not listed above' },
]

const MAX_DETAILS_LENGTH = 500

export function ReportModal({ isOpen, onClose, targetType, targetId, targetName }: ReportModalProps) {
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClose = () => {
    setSelectedReason(null)
    setDetails('')
    setSubmitting(false)
    setSubmitted(false)
    setError(null)
    onClose()
  }

  const handleSubmit = async () => {
    if (!selectedReason) return

    setSubmitting(true)
    setError(null)

    const payload: ReportPayload = {
      targetType,
      targetId,
      reason: selectedReason,
      ...(details.trim() ? { details: details.trim() } : {}),
    }

    try {
      await api.post('/v1/reports', payload)
      setSubmitted(true)
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string; error?: { message?: string } } } }
      const message =
        axiosError.response?.data?.error?.message ||
        axiosError.response?.data?.message ||
        'Failed to submit report. Please try again.'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  const targetLabel = targetName ? `"${targetName}"` : `this ${targetType}`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div className="relative w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 id="report-modal-title" className="text-lg font-semibold text-[var(--foreground)]">
            Report {targetLabel}
          </h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--surface-secondary)] transition-colors"
            aria-label="Close report modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {submitted ? (
            <div className="py-6 text-center">
              <div className="w-14 h-14 rounded-full bg-[var(--accent)]/15 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-[var(--foreground)] font-semibold text-base mb-1">Report submitted</p>
              <p className="text-[var(--foreground-secondary)] text-sm">
                Thank you for reporting. We&apos;ll review this.
              </p>
              <button
                onClick={handleClose}
                className="mt-5 px-5 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:opacity-90 transition-opacity"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-[var(--foreground-secondary)] mb-4">
                Select the reason that best describes the issue.
              </p>

              {/* Reason list */}
              <fieldset>
                <legend className="sr-only">Report reason</legend>
                <div className="space-y-2">
                  {REPORT_REASONS.map((reason) => (
                    <label
                      key={reason.value}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedReason === reason.value
                          ? 'border-[var(--primary)] bg-[var(--primary)]/8'
                          : 'border-[var(--border)] hover:border-[var(--foreground-secondary)] hover:bg-[var(--surface-secondary)]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="report-reason"
                        value={reason.value}
                        checked={selectedReason === reason.value}
                        onChange={() => setSelectedReason(reason.value)}
                        className="mt-0.5 accent-[var(--primary)]"
                      />
                      <div>
                        <p className="text-sm font-medium text-[var(--foreground)]">{reason.label}</p>
                        <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">{reason.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Details textarea */}
              <div className="mt-4">
                <label
                  htmlFor="report-details"
                  className="block text-sm font-medium text-[var(--foreground)] mb-1.5"
                >
                  Additional details{' '}
                  <span className="font-normal text-[var(--foreground-secondary)]">(optional)</span>
                </label>
                <textarea
                  id="report-details"
                  value={details}
                  onChange={(e) => setDetails(e.target.value.slice(0, MAX_DETAILS_LENGTH))}
                  rows={3}
                  placeholder="Describe the issue in more detail..."
                  className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm text-[var(--foreground)] placeholder-[var(--foreground-secondary)] resize-none focus:outline-none focus:border-[var(--primary)] transition-colors"
                />
                <p className="text-xs text-[var(--foreground-secondary)] mt-1 text-right">
                  {details.length}/{MAX_DETAILS_LENGTH}
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="mt-3 px-3 py-2 bg-[var(--error)]/10 border border-[var(--error)]/30 rounded-lg">
                  <p className="text-sm text-[var(--error)]">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="mt-5 flex gap-3 justify-end">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm text-[var(--foreground-secondary)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-secondary)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!selectedReason || submitting}
                  className="px-4 py-2 text-sm bg-[var(--error)] text-white rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                >
                  {submitting ? 'Submitting...' : 'Submit Report'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
