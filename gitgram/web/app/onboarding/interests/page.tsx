'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'

interface InterestChip {
  label: string
  emoji: string
}

const INTEREST_CHIPS: InterestChip[] = [
  { label: 'TypeScript', emoji: '🔷' },
  { label: 'JavaScript', emoji: '🟨' },
  { label: 'Python', emoji: '🐍' },
  { label: 'Go', emoji: '🐹' },
  { label: 'Rust', emoji: '🦀' },
  { label: 'React', emoji: '⚛️' },
  { label: 'Vue', emoji: '💚' },
  { label: 'Node.js', emoji: '🟢' },
  { label: 'Machine Learning', emoji: '🤖' },
  { label: 'Web Development', emoji: '🌐' },
  { label: 'Mobile Dev', emoji: '📱' },
  { label: 'DevOps', emoji: '⚙️' },
  { label: 'Open Source', emoji: '🌍' },
  { label: 'System Design', emoji: '🏛️' },
  { label: 'Databases', emoji: '🗄️' },
  { label: 'Security', emoji: '🔐' },
  { label: 'Blockchain', emoji: '⛓️' },
  { label: 'Game Dev', emoji: '🎮' },
]

const MIN_SELECTIONS = 3
const TOTAL_STEPS = 3
const CURRENT_STEP = 2

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Failed to save interests. Please try again.'
}

export default function InterestsPage() {
  const router = useRouter()
  const [selectedInterests, setSelectedInterests] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const progressPercent = Math.round((CURRENT_STEP / TOTAL_STEPS) * 100)
  const canContinue = selectedInterests.size >= MIN_SELECTIONS && !saving
  const remaining = Math.max(0, MIN_SELECTIONS - selectedInterests.size)

  const toggleInterest = (label: string) => {
    setSelectedInterests(prev => {
      const next = new Set(prev)
      if (next.has(label)) {
        next.delete(label)
      } else {
        next.add(label)
      }
      return next
    })
  }

  const handleContinue = async () => {
    if (!canContinue) return
    setSaving(true)
    setError(null)
    try {
      // Persist to localStorage as a fallback and call the preferences endpoint
      const interests = Array.from(selectedInterests)
      if (typeof window !== 'undefined') {
        localStorage.setItem('onboarding_interests', JSON.stringify(interests))
      }
      await api.patch('/users/preferences', { interests })
      router.push('/onboarding/follow')
    } catch (err: unknown) {
      // If API call fails (e.g., unauthenticated), still proceed — interests are in localStorage
      const message = getErrorMessage(err)
      const isFatal = !(err instanceof Error && (err.message.includes('401') || err.message.includes('Network')))
      if (isFatal) {
        setError(message)
        return
      }
      // Non-fatal: continue regardless
      router.push('/onboarding/follow')
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => {
    router.push('/onboarding/welcome')
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start py-10 px-4"
      style={{ backgroundColor: 'var(--background)' }}
    >
      <div className="w-full max-w-2xl">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-sm font-medium"
              style={{ color: 'var(--foreground-secondary)' }}
            >
              Step {CURRENT_STEP} of {TOTAL_STEPS}
            </span>
            <span
              className="text-sm tabular-nums"
              style={{ color: 'var(--foreground-secondary)' }}
            >
              {selectedInterests.size} selected
              {remaining > 0 && ` · ${remaining} more to go`}
            </span>
          </div>
          <div
            className="w-full h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--surface)' }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${progressPercent}%`,
                backgroundColor: 'var(--primary)',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>

        {/* Heading */}
        <div className="mb-8">
          <h1
            className="text-3xl font-bold mb-2"
            style={{ color: 'var(--foreground)' }}
          >
            What are you interested in?
          </h1>
          <p style={{ color: 'var(--foreground-secondary)' }} className="text-base">
            Pick at least {MIN_SELECTIONS} topics to personalise your Gitgram feed.
          </p>
        </div>

        {/* Counter badge */}
        <div className="mb-5">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
            style={{
              backgroundColor: selectedInterests.size >= MIN_SELECTIONS
                ? 'rgba(88, 166, 255, 0.12)'
                : 'var(--surface)',
              color: selectedInterests.size >= MIN_SELECTIONS
                ? 'var(--primary)'
                : 'var(--foreground-secondary)',
              border: '1px solid',
              borderColor: selectedInterests.size >= MIN_SELECTIONS
                ? 'var(--primary)'
                : 'var(--border)',
              transition: 'all 0.2s ease',
            }}
          >
            {selectedInterests.size >= MIN_SELECTIONS ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="7" fill="var(--primary)" fillOpacity="0.2" />
                <path
                  d="M4 7l2 2 4-4"
                  stroke="var(--primary)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : null}
            {selectedInterests.size}/{MIN_SELECTIONS} minimum selected
          </span>
        </div>

        {/* Interest chips grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          {INTEREST_CHIPS.map(({ label, emoji }) => {
            const isSelected = selectedInterests.has(label)
            return (
              <button
                key={label}
                type="button"
                onClick={() => toggleInterest(label)}
                aria-pressed={isSelected}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border font-medium text-left focus:outline-none focus-visible:ring-2"
                style={{
                  backgroundColor: isSelected ? 'rgba(88, 166, 255, 0.12)' : 'var(--surface)',
                  borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                  color: isSelected ? 'var(--primary)' : 'var(--foreground)',
                  transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                  boxShadow: isSelected ? '0 0 0 1px var(--primary)' : 'none',
                  transition: 'background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease, color 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                <span className="text-xl leading-none select-none shrink-0" aria-hidden="true">
                  {emoji}
                </span>
                <span className="text-sm leading-tight flex-1">{label}</span>
                {isSelected && (
                  <span className="shrink-0" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="8" fill="var(--primary)" fillOpacity="0.2" />
                      <path
                        d="M4.5 8l2.5 2.5 4-4"
                        stroke="var(--primary)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Error */}
        {error !== null && (
          <div
            className="flex items-start gap-3 rounded-xl px-4 py-3 mb-5 text-sm"
            style={{
              backgroundColor: 'rgba(218, 54, 51, 0.1)',
              border: '1px solid rgba(218, 54, 51, 0.3)',
              color: 'var(--error)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0" aria-hidden="true">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 4.5v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="8" cy="11" r="0.75" fill="currentColor" />
            </svg>
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="flex-none px-5 py-3.5 rounded-xl font-semibold text-base focus:outline-none focus-visible:ring-2"
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--foreground-secondary)',
            }}
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleContinue}
            disabled={!canContinue}
            className="flex-1 py-3.5 rounded-xl font-semibold text-base focus:outline-none focus-visible:ring-2"
            style={{
              backgroundColor: canContinue ? 'var(--primary)' : 'var(--surface)',
              color: canContinue ? '#fff' : 'var(--foreground-secondary)',
              border: canContinue ? 'none' : '1px solid var(--border)',
              cursor: canContinue ? 'pointer' : 'not-allowed',
              opacity: canContinue ? 1 : 0.6,
              transition: 'background-color 0.15s ease, opacity 0.15s ease',
            }}
          >
            {saving ? 'Saving…' : 'Continue'}
          </button>
        </div>

        {/* Skip */}
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={() => router.push('/onboarding/follow')}
            className="text-sm hover:underline focus:outline-none"
            style={{ color: 'var(--foreground-secondary)' }}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  )
}
