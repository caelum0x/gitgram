'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import api from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/ui/toast'

// ── Types ─────────────────────────────────────────────────────────────────────

type MemberRole = 'admin' | 'member'

interface GroupMember {
  id: string
  username: string
  displayName?: string
  avatar?: string
  role: MemberRole
}

interface MembersResponse {
  members: GroupMember[]
  ownerId: string
}

interface UserSearchResult {
  id: string
  username: string
  displayName?: string
  avatar?: string
  bio?: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GRADIENT_PALETTES = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-rose-500',
  'from-pink-500 to-fuchsia-600',
  'from-amber-500 to-yellow-400',
]

const SEARCH_DEBOUNCE_MS = 300

function gradientFor(username: string): string {
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 31 + username.charCodeAt(i)) | 0
  }
  return GRADIENT_PALETTES[Math.abs(hash) % GRADIENT_PALETTES.length]
}

// ── Avatar ────────────────────────────────────────────────────────────────────

interface AvatarProps {
  username: string
  avatar?: string
  size?: number
}

function Avatar({ username, avatar, size = 40 }: AvatarProps) {
  const gradient = gradientFor(username)
  const sizeClass = size === 40 ? 'w-10 h-10 text-sm' : 'w-8 h-8 text-xs'

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

// ── Role badge ────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: MemberRole }) {
  const isAdmin = role === 'admin'
  return (
    <span
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
        isAdmin
          ? 'bg-[var(--primary)]/15 text-[var(--primary)]'
          : 'bg-[var(--surface-secondary)] text-[var(--foreground-secondary)]'
      }`}
    >
      {isAdmin ? 'Admin' : 'Member'}
    </span>
  )
}

// ── 3-dot menu ────────────────────────────────────────────────────────────────

interface MemberMenuProps {
  member: GroupMember
  onRemove: (member: GroupMember) => void
  onMakeAdmin: (member: GroupMember) => void
}

function MemberMenu({ member, onRemove, onMakeAdmin }: MemberMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Member options"
        className="p-1.5 text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--surface-secondary)] rounded-md transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.2" />
          <circle cx="8" cy="8" r="1.2" />
          <circle cx="8" cy="13" r="1.2" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-20 w-40 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl overflow-hidden">
          {member.role !== 'admin' && (
            <button
              type="button"
              onClick={() => { onMakeAdmin(member); setOpen(false) }}
              className="w-full px-4 py-2.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--surface-secondary)] transition-colors"
            >
              Make Admin
            </button>
          )}
          <button
            type="button"
            onClick={() => { onRemove(member); setOpen(false) }}
            className="w-full px-4 py-2.5 text-left text-sm text-[var(--error)] hover:bg-[var(--error)]/10 transition-colors"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  )
}

// ── Add member modal ──────────────────────────────────────────────────────────

interface AddMemberModalProps {
  existingIds: Set<string>
  onAdd: (user: UserSearchResult) => void
  onClose: () => void
}

function AddMemberModal({ existingIds, onAdd, onClose }: AddMemberModalProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) { setResults([]); return }
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get<{ users: UserSearchResult[] }>('/v1/users/search', {
        params: { q: trimmed },
      })
      setResults(data.users ?? [])
    } catch {
      setError('Search failed.')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { void runSearch(query) }, SEARCH_DEBOUNCE_MS)
    return () => { if (debounceRef.current !== null) clearTimeout(debounceRef.current) }
  }, [query, runSearch])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden">
        {/* Modal header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-bold text-[var(--foreground)]">Add Member</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M13 5L5 13M5 5l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="p-4">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--foreground-secondary)]"
              width="15"
              height="15"
              viewBox="0 0 15 15"
              fill="none"
            >
              <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="m10 10 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by username…"
              className="w-full pl-9 pr-4 py-2 bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
            {loading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-3.5 h-3.5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="max-h-60 overflow-y-auto border-t border-[var(--border)]">
          {error && (
            <p className="px-4 py-3 text-sm text-[var(--error)]">{error}</p>
          )}
          {!error && query.trim() && results.length === 0 && !loading && (
            <p className="px-4 py-3 text-sm text-[var(--foreground-secondary)]">No users found.</p>
          )}
          {results.map((user) => {
            const alreadyIn = existingIds.has(user.id)
            return (
              <div
                key={user.id}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--surface-secondary)] transition-colors border-b border-[var(--border)] last:border-b-0"
              >
                <Avatar username={user.username} avatar={user.avatar} size={32} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--foreground)] truncate">
                    {user.displayName ?? user.username}
                  </p>
                  {user.displayName && (
                    <p className="text-xs text-[var(--foreground-secondary)] truncate">
                      @{user.username}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={alreadyIn}
                  onClick={() => { onAdd(user); onClose() }}
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                    alreadyIn
                      ? 'bg-[var(--surface-secondary)] text-[var(--foreground-secondary)] cursor-default'
                      : 'bg-[var(--primary)] text-white hover:opacity-90'
                  }`}
                >
                  {alreadyIn ? 'In group' : 'Add'}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GroupMembersPage() {
  const params = useParams()
  const router = useRouter()
  const { showToast } = useToast()
  const { user: currentUser } = useAuthStore()

  const conversationId = params.conversationId as string

  const [members, setMembers] = useState<GroupMember[]>([])
  const [ownerId, setOwnerId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [leavingGroup, setLeavingGroup] = useState(false)

  const isOwner = currentUser?.id === ownerId

  // ── Load members ────────────────────────────────────────────────────────────

  useEffect(() => {
    void loadMembers()
  }, [conversationId])

  const loadMembers = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const { data } = await api.get<MembersResponse>(
        `/v1/messages/groups/${conversationId}/members`,
      )
      setMembers(data.members ?? [])
      setOwnerId(data.ownerId ?? '')
    } catch {
      setLoadError('Failed to load members.')
    } finally {
      setLoading(false)
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleRemoveMember = async (member: GroupMember) => {
    if (!confirm(`Remove @${member.username} from this group?`)) return
    try {
      await api.delete(
        `/v1/messages/groups/${conversationId}/members/${member.id}`,
      )
      setMembers((prev) => prev.filter((m) => m.id !== member.id))
      showToast(`@${member.username} removed.`, 'success')
    } catch {
      showToast('Failed to remove member.', 'error')
    }
  }

  const handleMakeAdmin = async (member: GroupMember) => {
    try {
      await api.put(
        `/v1/messages/groups/${conversationId}/members/${member.id}/role`,
        { role: 'admin' },
      )
      setMembers((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, role: 'admin' } : m)),
      )
      showToast(`@${member.username} is now an admin.`, 'success')
    } catch {
      showToast('Failed to update role.', 'error')
    }
  }

  const handleAddMember = async (user: UserSearchResult) => {
    try {
      await api.post(`/v1/messages/groups/${conversationId}/members`, {
        userId: user.id,
      })
      setMembers((prev) => [
        ...prev,
        {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatar: user.avatar,
          role: 'member',
        },
      ])
      showToast(`@${user.username} added to group.`, 'success')
    } catch {
      showToast('Failed to add member.', 'error')
    }
  }

  const handleLeaveGroup = async () => {
    if (
      !confirm(
        'Are you sure you want to leave this group? You will lose access to the conversation.',
      )
    )
      return

    setLeavingGroup(true)
    try {
      await api.post(`/v1/messages/groups/${conversationId}/leave`)
      router.push('/messages')
    } catch {
      showToast('Failed to leave group.', 'error')
      setLeavingGroup(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const existingMemberIds = new Set(members.map((m) => m.id))

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F0F1A] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-[#0F0F1A] flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-[var(--error)] text-sm">{loadError}</p>
        <button
          type="button"
          onClick={() => void loadMembers()}
          className="px-4 py-2 bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] rounded-lg text-sm hover:bg-[var(--surface-secondary)] transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="min-h-screen bg-[#0F0F1A]">
        <div className="max-w-lg mx-auto">

          {/* ── Header ── */}
          <div className="flex items-center gap-3 px-4 pt-6 pb-4 border-b border-[var(--border)]">
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Go back"
              className="text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M12.5 15L7.5 10l5-5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <div className="flex-1">
              <h1 className="text-base font-bold text-[var(--foreground)]">Members</h1>
              <p className="text-xs text-[var(--foreground-secondary)]">
                {members.length} member{members.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* ── Member list ── */}
          <ul className="divide-y divide-[var(--border)]">
            {members.map((member) => (
              <li
                key={member.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-secondary)]/50 transition-colors"
              >
                <Avatar username={member.username} avatar={member.avatar} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--foreground)] truncate">
                      {member.displayName ?? member.username}
                    </p>
                    <RoleBadge role={member.role} />
                  </div>
                  {member.displayName && (
                    <p className="text-xs text-[var(--foreground-secondary)] truncate">
                      @{member.username}
                    </p>
                  )}
                </div>

                {/* Actions: only owner can manage others; can't manage yourself */}
                {isOwner && member.id !== currentUser?.id && (
                  <MemberMenu
                    member={member}
                    onRemove={handleRemoveMember}
                    onMakeAdmin={handleMakeAdmin}
                  />
                )}
              </li>
            ))}
          </ul>

          {/* ── Footer actions ── */}
          <div className="px-4 py-6 space-y-3 border-t border-[var(--border)] mt-2">
            {isOwner && (
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] rounded-lg text-sm font-semibold hover:bg-[var(--surface-secondary)] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Add Member
              </button>
            )}

            <button
              type="button"
              disabled={leavingGroup}
              onClick={handleLeaveGroup}
              className="w-full py-2.5 bg-[var(--error)]/10 border border-[var(--error)]/40 text-[var(--error)] rounded-lg text-sm font-semibold hover:bg-[var(--error)]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {leavingGroup ? 'Leaving…' : 'Leave Group'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Add member modal ── */}
      {showAddModal && (
        <AddMemberModal
          existingIds={existingMemberIds}
          onAdd={handleAddMember}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </>
  )
}
