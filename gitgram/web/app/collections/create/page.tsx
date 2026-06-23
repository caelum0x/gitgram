'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { collectionsService } from '@/services/collectionsService'
import { useToast } from '@/components/ui/toast'

// ── Constants ─────────────────────────────────────────────────────────────────

const NAME_MAX = 100
const DESC_MAX = 500

// ── Helpers ───────────────────────────────────────────────────────────────────

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'An unexpected error occurred'
}

function CharCount({ value, max }: { value: string; max: number }) {
  const remaining = max - value.length
  const isNearLimit = remaining <= Math.floor(max * 0.1)
  return (
    <span
      className="text-xs tabular-nums"
      style={{ color: isNearLimit ? 'var(--warning)' : 'var(--foreground-secondary)' }}
    >
      {remaining}
    </span>
  )
}

// ── Privacy Toggle ─────────────────────────────────────────────────────────────

interface PrivacyToggleProps {
  isPrivate: boolean
  onChange: (value: boolean) => void
}

function PrivacyToggle({ isPrivate, onChange }: PrivacyToggleProps) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <p className="text-sm font-medium mb-3" style={{ color: 'var(--foreground)' }}>
        Visibility
      </p>
      <div className="flex gap-3">
        {/* Public option */}
        <button
          type="button"
          onClick={() => onChange(false)}
          className="flex-1 flex items-center gap-3 rounded-lg px-4 py-3 transition-colors text-left"
          style={{
            background: !isPrivate ? 'rgba(35,134,54,0.1)' : 'var(--surface-secondary)',
            border: `1px solid ${!isPrivate ? 'var(--accent)' : 'var(--border)'}`,
          }}
        >
          <span style={{ color: !isPrivate ? 'var(--accent)' : 'var(--foreground-secondary)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
            </svg>
          </span>
          <div>
            <p
              className="text-sm font-medium"
              style={{ color: !isPrivate ? 'var(--accent)' : 'var(--foreground)' }}
            >
              Public
            </p>
            <p className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
              Anyone can discover this collection
            </p>
          </div>
        </button>

        {/* Private option */}
        <button
          type="button"
          onClick={() => onChange(true)}
          className="flex-1 flex items-center gap-3 rounded-lg px-4 py-3 transition-colors text-left"
          style={{
            background: isPrivate ? 'rgba(210,153,34,0.1)' : 'var(--surface-secondary)',
            border: `1px solid ${isPrivate ? 'var(--warning)' : 'var(--border)'}`,
          }}
        >
          <span style={{ color: isPrivate ? 'var(--warning)' : 'var(--foreground-secondary)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </span>
          <div>
            <p
              className="text-sm font-medium"
              style={{ color: isPrivate ? 'var(--warning)' : 'var(--foreground)' }}
            >
              Private
            </p>
            <p className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
              Only you can see this collection
            </p>
          </div>
        </button>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CreateCollectionPage() {
  const router = useRouter()
  const { showToast } = useToast()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  const validateName = (value: string): string | null => {
    if (!value.trim()) return 'Collection name is required'
    if (value.trim().length < 2) return 'Name must be at least 2 characters'
    if (value.length > NAME_MAX) return `Name must be ${NAME_MAX} characters or fewer`
    return null
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.slice(0, NAME_MAX)
    setName(value)
    if (nameError) setNameError(validateName(value))
  }

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value.slice(0, DESC_MAX))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const error = validateName(name)
    if (error) {
      setNameError(error)
      return
    }

    setCreating(true)
    try {
      const collection = await collectionsService.create({
        name: name.trim(),
        description: description.trim() || undefined,
        isPrivate,
      })
      showToast('Collection created', 'success')
      router.push(`/collections/${collection.id}`)
    } catch (err: unknown) {
      showToast(getErrorMessage(err) || 'Failed to create collection', 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="max-w-2xl mx-auto py-8 px-4">

        {/* Back link */}
        <Link
          href="/collections"
          className="inline-flex items-center gap-1.5 text-sm mb-6 hover:opacity-80 transition-opacity"
          style={{ color: 'var(--foreground-secondary)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          All collections
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--foreground)' }}>
            New Collection
          </h1>
          <p className="text-sm" style={{ color: 'var(--foreground-secondary)' }}>
            Organise posts you want to revisit or share with others.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>

          {/* Name */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                Name <span style={{ color: 'var(--error)' }}>*</span>
              </label>
              <CharCount value={name} max={NAME_MAX} />
            </div>
            <input
              type="text"
              value={name}
              onChange={handleNameChange}
              onBlur={() => setNameError(validateName(name))}
              placeholder="e.g. Rust learning resources"
              maxLength={NAME_MAX}
              autoFocus
              className="w-full px-4 py-2.5 rounded-lg text-sm transition-colors focus:outline-none"
              style={{
                background: 'var(--surface)',
                border: `1px solid ${nameError ? 'var(--error)' : 'var(--border)'}`,
                color: 'var(--foreground)',
              }}
            />
            {nameError && (
              <p className="text-xs mt-1.5" style={{ color: 'var(--error)' }}>
                {nameError}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                Description
                <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--foreground-secondary)' }}>
                  (optional)
                </span>
              </label>
              <CharCount value={description} max={DESC_MAX} />
            </div>
            <textarea
              value={description}
              onChange={handleDescriptionChange}
              placeholder="What kind of posts will you save here?"
              rows={4}
              maxLength={DESC_MAX}
              className="w-full px-4 py-2.5 rounded-lg text-sm resize-none transition-colors focus:outline-none"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--foreground)',
              }}
            />
          </div>

          {/* Privacy */}
          <PrivacyToggle isPrivate={isPrivate} onChange={setIsPrivate} />

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={creating}
              className="px-6 py-2.5 rounded-lg text-sm font-semibold transition-opacity"
              style={{
                background: 'var(--accent)',
                color: '#fff',
                opacity: creating ? 0.6 : 1,
                cursor: creating ? 'not-allowed' : 'pointer',
              }}
            >
              {creating ? 'Creating…' : 'Create Collection'}
            </button>
            <Link
              href="/collections"
              className="px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: 'var(--surface)',
                color: 'var(--foreground)',
                border: '1px solid var(--border)',
              }}
            >
              Cancel
            </Link>
          </div>

        </form>
      </div>
    </div>
  )
}
