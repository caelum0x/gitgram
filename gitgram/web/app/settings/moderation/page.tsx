'use client'

/**
 * ModerationSettingsPage — /settings/moderation
 *
 * Self-contained content moderation controls:
 *  - Muted words / phrases (content + hashtag targets)
 *  - Muted accounts (soft hide-without-block)
 *
 * State is client-side (localStorage) via utils/moderation and applied in the
 * feed by Feed.tsx. Thread muting is driven elsewhere (post menus) but shares
 * the same store.
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useModeration } from '@/hooks/useModeration'
import {
  addMutedWord,
  removeMutedWord,
  muteAccount,
  unmuteAccount,
  type MutedWordTarget,
} from '@/utils/moderation'

const MAX_WORD_LENGTH = 100

export default function ModerationSettingsPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const moderation = useModeration()

  const [wordInput, setWordInput] = useState('')
  const [wordTarget, setWordTarget] = useState<MutedWordTarget>('content')
  const [wordError, setWordError] = useState<string | null>(null)

  const [accountInput, setAccountInput] = useState('')
  const [accountError, setAccountError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) router.replace('/login')
  }, [isAuthenticated, router])

  const handleAddWord = useCallback(() => {
    const trimmed = wordInput.trim()
    if (!trimmed) {
      setWordError('Enter a word or phrase to mute')
      return
    }
    if (trimmed.length > MAX_WORD_LENGTH) {
      setWordError(`Must be ${MAX_WORD_LENGTH} characters or fewer`)
      return
    }
    addMutedWord(trimmed, wordTarget)
    setWordInput('')
    setWordError(null)
  }, [wordInput, wordTarget])

  const handleAddAccount = useCallback(() => {
    const trimmed = accountInput.trim().replace(/^@/, '')
    if (!trimmed) {
      setAccountError('Enter a username to mute')
      return
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) {
      setAccountError('Enter a valid username')
      return
    }
    muteAccount(trimmed)
    setAccountInput('')
    setAccountError(null)
  }, [accountInput])

  if (!isAuthenticated) return null

  const inputClass =
    'w-full px-4 py-3 bg-[var(--background)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-colors text-sm'

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Moderation</h1>
          <p className="text-sm text-[var(--foreground-secondary)] mt-1">
            Hide posts that contain certain words or come from certain accounts. These filters apply
            on this device.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors"
        >
          Back
        </button>
      </div>

      {/* Muted words */}
      <section className="p-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl space-y-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--foreground)]">Muted words &amp; tags</h2>
          <p className="text-xs text-[var(--foreground-secondary)] mt-1">
            Posts containing a muted word — or a muted hashtag — are hidden from your feed.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={wordInput}
              onChange={(e) => {
                setWordInput(e.target.value)
                setWordError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddWord()
                }
              }}
              placeholder={wordTarget === 'tag' ? 'hashtag (without #)' : 'word or phrase'}
              maxLength={MAX_WORD_LENGTH}
              className={`${inputClass} flex-1`}
              aria-label="Word or phrase to mute"
            />
            <select
              value={wordTarget}
              onChange={(e) => setWordTarget(e.target.value as MutedWordTarget)}
              className="px-3 py-3 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              aria-label="Where to match"
            >
              <option value="content">Text &amp; tags</option>
              <option value="tag">Hashtags only</option>
            </select>
            <button
              type="button"
              onClick={handleAddWord}
              className="px-4 py-3 bg-[var(--primary)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--primary)]/90 transition-colors whitespace-nowrap"
            >
              Mute word
            </button>
          </div>
          {wordError && (
            <p className="text-xs text-[var(--error)]" role="alert">
              {wordError}
            </p>
          )}
        </div>

        {moderation.mutedWords.length === 0 ? (
          <p className="text-sm text-[var(--foreground-secondary)] py-2">No muted words yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {moderation.mutedWords.map((word) => (
              <li
                key={`${word.target}:${word.value}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-[var(--surface-secondary)] border border-[var(--border)] text-[var(--foreground)]"
              >
                <span>
                  {word.target === 'tag' ? '#' : ''}
                  {word.value}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-[var(--foreground-secondary)]">
                  {word.target === 'tag' ? 'tag' : 'text'}
                </span>
                <button
                  type="button"
                  onClick={() => removeMutedWord(word.value, word.target)}
                  aria-label={`Unmute ${word.value}`}
                  className="ml-0.5 text-[var(--foreground-secondary)] hover:text-[var(--error)] transition-colors"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Muted accounts */}
      <section className="p-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl space-y-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--foreground)]">Muted accounts</h2>
          <p className="text-xs text-[var(--foreground-secondary)] mt-1">
            Muting hides an account&apos;s posts from your feed without blocking them. They are not
            notified.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-4 flex items-center text-[var(--foreground-secondary)] text-sm pointer-events-none">
                @
              </span>
              <input
                type="text"
                value={accountInput}
                onChange={(e) => {
                  setAccountInput(e.target.value)
                  setAccountError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddAccount()
                  }
                }}
                placeholder="username"
                className={`${inputClass} pl-8`}
                aria-label="Username to mute"
              />
            </div>
            <button
              type="button"
              onClick={handleAddAccount}
              className="px-4 py-3 bg-[var(--primary)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--primary)]/90 transition-colors whitespace-nowrap"
            >
              Mute account
            </button>
          </div>
          {accountError && (
            <p className="text-xs text-[var(--error)]" role="alert">
              {accountError}
            </p>
          )}
        </div>

        {moderation.mutedAccounts.length === 0 ? (
          <p className="text-sm text-[var(--foreground-secondary)] py-2">No muted accounts yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {moderation.mutedAccounts.map((account) => (
              <li key={account} className="flex items-center justify-between py-3">
                <span className="text-sm font-medium text-[var(--foreground)]">@{account}</span>
                <button
                  type="button"
                  onClick={() => unmuteAccount(account)}
                  className="text-sm text-[var(--foreground-secondary)] hover:text-[var(--foreground)] underline transition-colors"
                >
                  Unmute
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Muted threads summary */}
      {moderation.mutedThreads.length > 0 && (
        <section className="p-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl space-y-2">
          <h2 className="text-base font-semibold text-[var(--foreground)]">Muted threads</h2>
          <p className="text-sm text-[var(--foreground-secondary)]">
            You have muted {moderation.mutedThreads.length} thread
            {moderation.mutedThreads.length === 1 ? '' : 's'}. Mute or unmute a thread from a
            post&apos;s menu.
          </p>
        </section>
      )}
    </div>
  )
}
