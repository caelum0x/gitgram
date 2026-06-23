'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useAuthStore } from '@/store/authStore'
import { messageService, type Conversation, type ConversationUser } from '@/services/messageService'
import { useSocket } from '@/hooks/useSocket'
import { useToast } from '@/components/ui/toast'
import { formatDistanceToNow } from 'date-fns'

// ── Types ────────────────────────────────────────────────────────────────────

interface UserSearchResult {
  id: string
  username: string
  displayName?: string
  avatar?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const GRADIENT_PALETTES = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-rose-500',
  'from-pink-500 to-fuchsia-600',
  'from-amber-500 to-yellow-400',
  'from-sky-500 to-indigo-600',
  'from-lime-500 to-green-600',
]

function gradientForUsername(username: string): string {
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 31 + username.charCodeAt(i)) | 0
  }
  return GRADIENT_PALETTES[Math.abs(hash) % GRADIENT_PALETTES.length]
}

function formatTimestamp(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  } catch {
    return ''
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface AvatarProps {
  user: ConversationUser | UserSearchResult
  size?: number
  isOnline?: boolean
}

function Avatar({ user, size = 44, isOnline = false }: AvatarProps) {
  const gradient = gradientForUsername(user.username)
  const initial = user.username[0]?.toUpperCase() ?? '?'

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="rounded-full overflow-hidden"
        style={{ width: size, height: size }}
      >
        {user.avatar ? (
          <Image
            src={user.avatar}
            alt={user.username}
            width={size}
            height={size}
            className="object-cover"
          />
        ) : (
          <div
            className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${gradient}`}
          >
            <span
              className="font-semibold text-white"
              style={{ fontSize: size * 0.38 }}
            >
              {initial}
            </span>
          </div>
        )}
      </div>
      {isOnline && (
        <span
          className="absolute bottom-0 right-0 rounded-full bg-green-500 border-2"
          style={{
            width: Math.max(size * 0.26, 10),
            height: Math.max(size * 0.26, 10),
            borderColor: 'var(--background)',
          }}
        />
      )}
    </div>
  )
}

interface NewConversationModalProps {
  onClose: () => void
  onSelect: (user: UserSearchResult) => void
}

function NewConversationModal({ onClose, onSelect }: NewConversationModalProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const { default: api } = await import('@/services/api')
        const { data } = await api.get<{ users: UserSearchResult[] }>('/v1/users/search', {
          params: { q: query.trim(), limit: 8 },
        })
        setResults(data.users ?? [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl border shadow-2xl"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2 className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>
            New Message
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors hover:bg-[var(--surface-secondary)]"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="p-4">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: 'var(--foreground-secondary)' }}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by username..."
              className="w-full rounded-xl py-2.5 pl-9 pr-9 text-sm focus:outline-none focus:ring-2"
              style={{
                background: 'var(--background)',
                border: '1px solid var(--border)',
                color: 'var(--foreground)',
                '--tw-ring-color': '#7C3AED55',
              } as React.CSSProperties}
            />
            {loading && (
              <svg
                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin"
                style={{ color: '#7C3AED' }}
                fill="none" viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="max-h-64 overflow-y-auto pb-2">
          {results.length === 0 && query.trim().length >= 2 && !loading && (
            <p className="px-5 py-4 text-sm text-center" style={{ color: 'var(--foreground-secondary)' }}>
              No users found for &ldquo;{query}&rdquo;
            </p>
          )}
          {results.length === 0 && query.trim().length < 2 && (
            <p className="px-5 py-4 text-sm text-center" style={{ color: 'var(--foreground-secondary)' }}>
              Type at least 2 characters to search
            </p>
          )}
          {results.map((user) => (
            <button
              key={user.id}
              onClick={() => onSelect(user)}
              className="w-full flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--surface-secondary)] text-left"
            >
              <Avatar user={user} size={40} />
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--foreground)' }}>
                  @{user.username}
                </p>
                {user.displayName && (
                  <p className="text-xs truncate" style={{ color: 'var(--foreground-secondary)' }}>
                    {user.displayName}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Conversation row ──────────────────────────────────────────────────────────

interface ConversationRowProps {
  conversation: Conversation
  isSelected: boolean
  isOnline: boolean
  onClick: () => void
}

function ConversationRow({ conversation, isSelected, isOnline, onClick }: ConversationRowProps) {
  const { otherUser, lastMessage, unreadCount, updatedAt } = conversation

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 transition-colors text-left"
      style={{
        background: isSelected ? 'var(--surface-secondary)' : 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--surface-secondary)'
      }}
      onMouseLeave={(e) => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'
      }}
    >
      <Avatar user={otherUser} size={44} isOnline={isOnline} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-sm font-semibold truncate"
            style={{ color: 'var(--foreground)' }}
          >
            {otherUser.displayName ?? otherUser.username}
          </span>
          <span className="text-xs shrink-0" style={{ color: 'var(--foreground-secondary)' }}>
            {updatedAt ? formatTimestamp(updatedAt) : ''}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p
            className="text-xs truncate"
            style={{
              color: unreadCount > 0 ? 'var(--foreground)' : 'var(--foreground-secondary)',
              fontWeight: unreadCount > 0 ? 600 : 400,
            }}
          >
            {lastMessage?.content ?? 'No messages yet'}
          </p>
          {unreadCount > 0 && (
            <span
              className="shrink-0 inline-flex items-center justify-center rounded-full text-[10px] font-bold text-white min-w-[18px] h-[18px] px-1"
              style={{ background: '#7C3AED' }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const router = useRouter()
  const { isAuthenticated, user } = useAuthStore()
  const { showToast } = useToast()
  const { onlineUsers, onNewMessage } = useSocket()

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [showNewConversation, setShowNewConversation] = useState(false)
  const [totalUnread, setTotalUnread] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Data fetching ───────────────────────────────────────────────────────────

  const fetchConversations = useCallback(async () => {
    try {
      const data = await messageService.getConversations()
      setConversations(data.conversations ?? [])
    } catch {
      // Silently fail on poll — only show error on initial load
    }
  }, [])

  const fetchUnreadCount = useCallback(async () => {
    try {
      const data = await messageService.getUnreadCount()
      setTotalUnread(data.count)
    } catch {
      // Non-critical
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
      return
    }

    const init = async () => {
      setLoading(true)
      await Promise.all([fetchConversations(), fetchUnreadCount()])
      setLoading(false)
    }

    init()

    // Poll every 10s for new conversations / unread counts
    pollIntervalRef.current = setInterval(() => {
      fetchConversations()
      fetchUnreadCount()
    }, 10_000)

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [isAuthenticated, router, fetchConversations, fetchUnreadCount])

  // ── Socket: new message → refresh conversations ─────────────────────────────

  useEffect(() => {
    const unsub = onNewMessage(() => {
      fetchConversations()
      fetchUnreadCount()
    })
    return unsub
  }, [onNewMessage, fetchConversations, fetchUnreadCount])

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSelectConversation = useCallback(
    (conv: Conversation) => {
      setSelectedId(conv.id)
      // Optimistically clear unread badge
      setConversations((prev) =>
        prev.map((c) => (c.id === conv.id ? { ...c, unreadCount: 0 } : c)),
      )
      router.push(`/messages/${conv.otherUser.id}`)
    },
    [router],
  )

  const handleNewConversationSelect = useCallback(
    (selectedUser: UserSearchResult) => {
      setShowNewConversation(false)
      router.push(`/messages/${selectedUser.id}`)
    },
    [router],
  )

  // ── Derived ─────────────────────────────────────────────────────────────────

  const filteredConversations = messageService.searchConversations(conversations, searchQuery)

  // ── Render ───────────────────────────────────────────────────────────────────

  if (!isAuthenticated) return null

  return (
    <div
      className="flex h-[calc(100vh-4rem)]"
      style={{ background: 'var(--background)' }}
    >
      {/* ── Left pane: conversation list ── */}
      <div
        className="flex flex-col w-80 shrink-0 border-r"
        style={{
          background: '#0F0F1A',
          borderColor: 'var(--border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 pt-5 pb-3 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>
              Messages
            </h1>
            {totalUnread > 0 && (
              <span
                className="inline-flex items-center justify-center rounded-full text-[10px] font-bold text-white min-w-[20px] h-5 px-1.5"
                style={{ background: '#7C3AED' }}
              >
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowNewConversation(true)}
            title="New message"
            className="rounded-lg p-2 transition-colors hover:bg-[var(--surface-secondary)]"
            style={{ color: '#7C3AED' }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: 'var(--foreground-secondary)' }}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full rounded-xl py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2"
              style={{
                background: '#1A1A2E',
                border: '1px solid var(--border)',
                color: 'var(--foreground)',
              }}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col gap-1 p-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-2 py-2 rounded-xl animate-pulse">
                  <div className="w-11 h-11 rounded-full shrink-0" style={{ background: '#1A1A2E' }} />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 rounded-full w-2/3" style={{ background: '#1A1A2E' }} />
                    <div className="h-2.5 rounded-full w-4/5" style={{ background: '#1A1A2E' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: '#1A1A2E' }}
              >
                <svg className="w-7 h-7" style={{ color: '#7C3AED' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                {searchQuery ? 'No matches found' : 'No conversations yet'}
              </p>
              {!searchQuery && (
                <p className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
                  Click + to start a new message
                </p>
              )}
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <ConversationRow
                key={conv.id}
                conversation={conv}
                isSelected={selectedId === conv.id}
                isOnline={onlineUsers.includes(conv.otherUser.id)}
                onClick={() => handleSelectConversation(conv)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right pane: placeholder ── */}
      <div
        className="flex-1 flex flex-col items-center justify-center gap-5"
        style={{ background: '#0F0F1A' }}
      >
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center"
          style={{ background: '#1A1A2E' }}
        >
          <svg className="w-10 h-10" style={{ color: '#7C3AED' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold mb-1" style={{ color: 'var(--foreground)' }}>
            Your Messages
          </p>
          <p className="text-sm" style={{ color: 'var(--foreground-secondary)' }}>
            Select a conversation or start a new one
          </p>
        </div>
        <button
          onClick={() => setShowNewConversation(true)}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: '#7C3AED' }}
        >
          New Message
        </button>
      </div>

      {/* ── New conversation modal ── */}
      {showNewConversation && (
        <NewConversationModal
          onClose={() => setShowNewConversation(false)}
          onSelect={handleNewConversationSelect}
        />
      )}
    </div>
  )
}
