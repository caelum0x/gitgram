'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import api from '@/services/api'
import { useToast } from '@/components/ui/toast'

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserSearchResult {
  id: string
  username: string
  displayName?: string
  avatar?: string
  bio?: string
}

interface SelectedMember {
  id: string
  username: string
  avatar?: string
}

interface CreateGroupResponse {
  group: { id: string }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_MEMBERS = 20
const MAX_NAME_LENGTH = 50
const MAX_DESC_LENGTH = 200
const SEARCH_DEBOUNCE_MS = 300

const GRADIENT_PALETTES = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-rose-500',
  'from-pink-500 to-fuchsia-600',
  'from-amber-500 to-yellow-400',
]

function gradientFor(username: string): string {
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 31 + username.charCodeAt(i)) | 0
  }
  return GRADIENT_PALETTES[Math.abs(hash) % GRADIENT_PALETTES.length]
}

// ── Avatar helper ─────────────────────────────────────────────────────────────

interface MiniAvatarProps {
  username: string
  avatar?: string
  size?: number
}

function MiniAvatar({ username, avatar, size = 32 }: MiniAvatarProps) {
  const gradient = gradientFor(username)
  const sizeClass = size === 32 ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'

  if (avatar) {
    return (
      <Image
        src={avatar}
        alt={username}
        width={size}
        height={size}
        className={`${sizeClass} rounded-full object-cover flex-shrink-0`}
      />
    )
  }

  return (
    <div
      className={`${sizeClass} rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0 font-semibold text-white`}
    >
      {username[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

// ── Member chip ───────────────────────────────────────────────────────────────

interface MemberChipProps {
  member: SelectedMember
  onRemove: (id: string) => void
}

function MemberChip({ member, onRemove }: MemberChipProps) {
  return (
    <div className="flex items-center gap-1.5 bg-[var(--surface-secondary)] border border-[var(--border)] rounded-full pl-1 pr-2 py-1">
      <MiniAvatar username={member.username} avatar={member.avatar} size={24} />
      <span className="text-xs text-[var(--foreground)] font-medium">{member.username}</span>
      <button
        type="button"
        onClick={() => onRemove(member.id)}
        aria-label={`Remove ${member.username}`}
        className="ml-0.5 text-[var(--foreground-secondary)] hover:text-[var(--error)] transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M9 3L3 9M3 3l6 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}

// ── User search result row ─────────────────────────────────────────────────────

interface UserResultRowProps {
  user: UserSearchResult
  isAdded: boolean
  isDisabled: boolean
  onAdd: (user: UserSearchResult) => void
}

function UserResultRow({ user, isAdded, isDisabled, onAdd }: UserResultRowProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-secondary)] transition-colors">
      <MiniAvatar username={user.username} avatar={user.avatar} size={40} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--foreground)] truncate">
          {user.displayName ?? user.username}
        </p>
        {user.displayName && (
          <p className="text-xs text-[var(--foreground-secondary)] truncate">@{user.username}</p>
        )}
        {user.bio && (
          <p className="text-xs text-[var(--foreground-secondary)] truncate mt-0.5">{user.bio}</p>
        )}
      </div>
      <button
        type="button"
        disabled={isAdded || isDisabled}
        onClick={() => onAdd(user)}
        className={`
          flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all
          ${
            isAdded
              ? 'bg-[var(--accent)]/20 text-[var(--accent)] cursor-default'
              : isDisabled
                ? 'bg-[var(--surface-secondary)] text-[var(--foreground-secondary)] cursor-not-allowed opacity-50'
                : 'bg-[var(--primary)] text-white hover:opacity-90'
          }
        `}
      >
        {isAdded ? 'Added' : 'Add'}
      </button>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NewGroupPage() {
  const router = useRouter()
  const { showToast } = useToast()

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<SelectedMember[]>([])

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  // Submit state
  const [isCreating, setIsCreating] = useState(false)

  // Debounce ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Validation
  const nameError = name.trim().length === 0 ? 'Group name is required.' : null
  const membersError =
    selectedMembers.length < 2 ? `Select at least 2 members (${selectedMembers.length}/2).` : null
  const canCreate = !nameError && !membersError && !isCreating

  // ── Search ──────────────────────────────────────────────────────────────────

  const runSearch = useCallback(async (query: string) => {
    const trimmed = query.trim()
    if (!trimmed) {
      setSearchResults([])
      return
    }
    setIsSearching(true)
    setSearchError(null)
    try {
      const { data } = await api.get<{ users: UserSearchResult[] }>('/v1/users/search', {
        params: { q: trimmed },
      })
      setSearchResults(data.users ?? [])
    } catch {
      setSearchError('Search failed. Please try again.')
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      void runSearch(searchQuery)
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [searchQuery, runSearch])

  // ── Member management ───────────────────────────────────────────────────────

  const addMember = useCallback(
    (user: UserSearchResult) => {
      if (selectedMembers.length >= MAX_MEMBERS) return
      if (selectedMembers.some((m) => m.id === user.id)) return
      setSelectedMembers((prev) => [
        ...prev,
        { id: user.id, username: user.username, avatar: user.avatar },
      ])
    },
    [selectedMembers],
  )

  const removeMember = useCallback((id: string) => {
    setSelectedMembers((prev) => prev.filter((m) => m.id !== id))
  }, [])

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canCreate) return

    setIsCreating(true)
    try {
      const { data } = await api.post<CreateGroupResponse>('/v1/messages/groups', {
        name: name.trim(),
        description: description.trim() || undefined,
        memberIds: selectedMembers.map((m) => m.id),
      })
      const newGroupId = data.group?.id
      if (newGroupId) {
        router.push(`/messages/${newGroupId}`)
      } else {
        router.push('/messages')
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to create group. Please try again.'
      showToast(message, 'error')
    } finally {
      setIsCreating(false)
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const selectedIds = new Set(selectedMembers.map((m) => m.id))
  const atMaxMembers = selectedMembers.length >= MAX_MEMBERS

  return (
    <div className="min-h-screen bg-[#0F0F1A]">
      <div className="max-w-lg mx-auto">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 pt-6 pb-4 border-b border-[var(--border)]">
          <h1 className="text-lg font-bold text-[var(--foreground)]">New Group</h1>
          <button
            type="button"
            onClick={() => router.back()}
            className="text-sm text-[var(--primary)] hover:opacity-80 transition-opacity font-medium"
          >
            Cancel
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-4 py-6 space-y-6">

          {/* ── Group name ── */}
          <div>
            <label
              htmlFor="group-name"
              className="block text-sm font-semibold text-[var(--foreground)] mb-1.5"
            >
              Group Name <span className="text-[var(--error)]">*</span>
            </label>
            <div className="relative">
              <input
                id="group-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={MAX_NAME_LENGTH}
                placeholder="Enter group name…"
                className="w-full px-4 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--foreground-secondary)]">
                {name.length}/{MAX_NAME_LENGTH}
              </span>
            </div>
          </div>

          {/* ── Group description ── */}
          <div>
            <label
              htmlFor="group-desc"
              className="block text-sm font-semibold text-[var(--foreground)] mb-1.5"
            >
              Description{' '}
              <span className="text-[var(--foreground-secondary)] font-normal">(optional)</span>
            </label>
            <div className="relative">
              <textarea
                id="group-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={MAX_DESC_LENGTH}
                rows={3}
                placeholder="What's this group about?"
                className="w-full px-4 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm resize-none"
              />
              <span className="absolute right-3 bottom-2.5 text-xs text-[var(--foreground-secondary)]">
                {description.length}/{MAX_DESC_LENGTH}
              </span>
            </div>
          </div>

          {/* ── Add members ── */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="member-search"
                className="block text-sm font-semibold text-[var(--foreground)]"
              >
                Add Members
              </label>
              <span
                className={`text-xs font-medium ${
                  atMaxMembers ? 'text-[var(--warning)]' : 'text-[var(--foreground-secondary)]'
                }`}
              >
                {selectedMembers.length}/{MAX_MEMBERS} member{selectedMembers.length !== 1 ? 's' : ''} selected
              </span>
            </div>

            {/* Search input */}
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--foreground-secondary)]"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
              >
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
                <path d="m11 11 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                id="member-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by username…"
                disabled={atMaxMembers}
                className="w-full pl-9 pr-4 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm disabled:opacity-50"
              />
              {isSearching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>

            {/* Search results */}
            {searchQuery.trim() && (
              <div className="mt-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
                {searchError ? (
                  <p className="px-4 py-3 text-sm text-[var(--error)]">{searchError}</p>
                ) : searchResults.length === 0 && !isSearching ? (
                  <p className="px-4 py-3 text-sm text-[var(--foreground-secondary)]">
                    No users found for &quot;{searchQuery.trim()}&quot;.
                  </p>
                ) : (
                  <ul>
                    {searchResults.map((user) => (
                      <li key={user.id} className="border-b border-[var(--border)] last:border-b-0">
                        <UserResultRow
                          user={user}
                          isAdded={selectedIds.has(user.id)}
                          isDisabled={atMaxMembers && !selectedIds.has(user.id)}
                          onAdd={addMember}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Selected member chips */}
            {selectedMembers.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedMembers.map((member) => (
                  <MemberChip key={member.id} member={member} onRemove={removeMember} />
                ))}
              </div>
            )}

            {/* Members validation hint */}
            {membersError && selectedMembers.length > 0 && (
              <p className="mt-2 text-xs text-[var(--warning)]">{membersError}</p>
            )}
          </div>

          {/* ── Validation summary ── */}
          {(nameError || membersError) && (
            <ul className="text-xs text-[var(--foreground-secondary)] space-y-1 pl-1">
              {nameError && <li className="text-[var(--error)]">• {nameError}</li>}
              {membersError && selectedMembers.length === 0 && (
                <li className="text-[var(--foreground-secondary)]">
                  • At least 2 members must be selected.
                </li>
              )}
            </ul>
          )}

          {/* ── Action buttons ── */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={!canCreate}
              className="flex-1 py-2.5 bg-[var(--accent)] text-white rounded-lg font-semibold text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {isCreating ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating…
                </span>
              ) : (
                'Create Group'
              )}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-5 py-2.5 bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] rounded-lg font-semibold text-sm hover:bg-[var(--surface-secondary)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
