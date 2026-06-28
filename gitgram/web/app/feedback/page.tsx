'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { feedbackService } from '@/services/feedbackService'
import { getErrorMessage } from '@/utils/error'

type FeedbackType = 'bug' | 'feature' | 'other'

interface SubmitState {
  status: 'idle' | 'submitting' | 'success' | 'error'
  message?: string
}

export default function FeedbackPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [type, setType] = useState<FeedbackType>('other')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' })

  const feedbackTypes = [
    { value: 'bug', label: 'Bug Report', icon: '🐛', description: 'Report a problem or error' },
    { value: 'feature', label: 'Feature Request', icon: '💡', description: 'Suggest a new feature' },
    { value: 'other', label: 'General Feedback', icon: '💬', description: 'Share your thoughts' },
  ] as const

  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setSubmitState({ status: 'error', message: 'Screenshot must be less than 5MB' })
        return
      }
      if (!file.type.startsWith('image/')) {
        setSubmitState({ status: 'error', message: 'Please upload an image file' })
        return
      }
      setScreenshot(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setScreenshotPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
      setSubmitState({ status: 'idle' })
    }
  }

  const removeScreenshot = () => {
    setScreenshot(null)
    setScreenshotPreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim()) {
      setSubmitState({ status: 'error', message: 'Please enter a title for your feedback' })
      return
    }

    if (!content.trim()) {
      setSubmitState({ status: 'error', message: 'Please enter your feedback message' })
      return
    }

    setSubmitState({ status: 'submitting' })

    try {
      // Upload the screenshot first (if any) so the feedback record can
      // reference the hosted image URL rather than just a filename note.
      let screenshotUrl: string | undefined
      if (screenshot) {
        screenshotUrl = await feedbackService.uploadScreenshot(screenshot)
      }

      await feedbackService.createFeedback({
        type,
        title: title.trim(),
        content: content.trim(),
        screenshotUrl,
      })

      setSubmitState({
        status: 'success',
        message: 'Thank you for your feedback! We appreciate your input and will review it shortly.'
      })

      // Reset form after successful submission
      setTitle('')
      setContent('')
      setType('other')
      removeScreenshot()
    } catch (error: unknown) {
      console.error('Submit feedback error:', error)
      setSubmitState({
        status: 'error',
        message: getErrorMessage(error)
      })
    }
  }

  const handleSubmitAnother = () => {
    setSubmitState({ status: 'idle' })
  }

  // Success state
  if (submitState.status === 'success') {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto py-8 px-4">
          <div className="p-8 bg-card border border-border rounded-xl text-center">
            <div className="w-16 h-16 bg-success/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-success"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Feedback Submitted!</h2>
            <p className="text-muted mb-6">{submitState.message}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleSubmitAnother}
                className="px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90"
              >
                Submit Another
              </button>
              <button
                onClick={() => router.push('/')}
                className="px-6 py-3 border border-border rounded-lg font-semibold hover:bg-muted"
              >
                Back to Home
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Send Feedback</h1>
          <p className="text-muted mt-2">
            Help us improve Gitgram by sharing your thoughts, reporting bugs, or suggesting new features.
          </p>
        </div>

        {/* Error Alert */}
        {submitState.status === 'error' && (
          <div className="mb-6 p-4 bg-error/10 border border-error/30 rounded-lg flex items-start gap-3">
            <svg
              className="w-5 h-5 text-error flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="flex-1">
              <p className="text-error font-medium">Error</p>
              <p className="text-sm text-error/80">{submitState.message}</p>
            </div>
            <button
              onClick={() => setSubmitState({ status: 'idle' })}
              className="text-error hover:text-error/80"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Feedback Type Selector */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-foreground">
              What type of feedback is this?
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {feedbackTypes.map((feedbackType) => (
                <button
                  key={feedbackType.value}
                  type="button"
                  onClick={() => setType(feedbackType.value)}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    type === feedbackType.value
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-card hover:border-muted-foreground'
                  }`}
                >
                  <span className="text-2xl mb-2 block">{feedbackType.icon}</span>
                  <p className="font-semibold text-foreground">{feedbackType.label}</p>
                  <p className="text-xs text-muted mt-1">{feedbackType.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Title Input */}
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              Title <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                type === 'bug'
                  ? 'e.g., App crashes when uploading large images'
                  : type === 'feature'
                    ? 'e.g., Add dark mode toggle in settings'
                    : 'e.g., Great app but could use improvements'
              }
              className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              maxLength={100}
            />
            <p className="text-xs text-muted mt-1">{title.length}/100 characters</p>
          </div>

          {/* Message Textarea */}
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              Your Feedback <span className="text-error">*</span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              placeholder={
                type === 'bug'
                  ? 'Please describe the issue in detail:\n- What were you trying to do?\n- What happened instead?\n- Steps to reproduce the issue'
                  : type === 'feature'
                    ? 'Please describe the feature you would like:\n- What problem would it solve?\n- How would it work?'
                    : 'Share your thoughts, suggestions, or experience with us...'
              }
              className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
              maxLength={2000}
            />
            <p className="text-xs text-muted mt-1">{content.length}/2000 characters</p>
          </div>

          {/* Screenshot Upload */}
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              Screenshot (optional)
            </label>
            <p className="text-xs text-muted mb-3">
              Attach a screenshot to help us better understand your feedback.
            </p>

            {screenshotPreview ? (
              <div className="relative inline-block">
                <img
                  src={screenshotPreview}
                  alt="Screenshot preview"
                  className="max-w-full max-h-48 rounded-lg border border-border"
                />
                <button
                  type="button"
                  onClick={removeScreenshot}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-error text-white rounded-full flex items-center justify-center hover:bg-error/80"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <p className="text-xs text-muted mt-2">{screenshot?.name}</p>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-muted-foreground hover:bg-muted/50 transition-colors"
              >
                <svg
                  className="w-10 h-10 text-muted mx-auto mb-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <p className="text-sm text-muted">Click to upload a screenshot</p>
                <p className="text-xs text-muted mt-1">PNG, JPG up to 5MB</p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleScreenshotChange}
              className="hidden"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitState.status === 'submitting'}
            className="w-full py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitState.status === 'submitting' ? (
              <>
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Submitting...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
                Submit Feedback
              </>
            )}
          </button>
        </form>

        {/* Help Text */}
        <div className="mt-8 p-4 bg-card border border-border rounded-lg">
          <h3 className="font-semibold text-foreground mb-2">Need immediate help?</h3>
          <p className="text-sm text-muted">
            For urgent issues or account-related problems, please contact our support team at{' '}
            <a href="mailto:support@gitgram.com" className="text-primary hover:underline">
              support@gitgram.com
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
