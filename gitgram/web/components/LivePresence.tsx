'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import api from '@/services/api'
import { usePresence, type OnlineUser } from '@/hooks/usePresence'

const COUNT_POLL_INTERVAL_MS = 30_000

function useOnlineCount() {
  const [count, setCount] = useState<number>(0)

  const fetchCount = useCallback(async () => {
    try {
      const response = await api.get<{ count: number }>('/users/online-count')
      setCount(response.data.count)
    } catch {
      // Silently ignore — count display is non-critical
    }
  }, [])

  useEffect(() => {
    fetchCount()
    const interval = setInterval(fetchCount, COUNT_POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchCount])

  return count
}

function UserAvatarThumb({ user }: { user: OnlineUser }) {
  return (
    <div
      className="relative inline-block"
      title={`@${user.username}`}
    >
      {user.avatar ? (
        <img
          src={user.avatar}
          alt={user.username}
          className="w-7 h-7 rounded-full object-cover ring-2 ring-[var(--background)]"
        />
      ) : (
        <div className="w-7 h-7 rounded-full bg-primary/20 ring-2 ring-[var(--background)] flex items-center justify-center">
          <span className="text-primary text-xs font-semibold">
            {user.username[0]?.toUpperCase() ?? '?'}
          </span>
        </div>
      )}
      <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-[var(--accent)] ring-1 ring-[var(--background)]" />
    </div>
  )
}

interface LivePresenceProps {
  className?: string
}

export function LivePresence({ className = '' }: LivePresenceProps) {
  const count = useOnlineCount()
  const { onlineUsers } = usePresence()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const previewUsers: OnlineUser[] = onlineUsers.slice(0, 5)

  // Close popover when clicking outside
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  if (count === 0) return null

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--surface)] hover:bg-[var(--surface-secondary)] border border-[var(--border)] transition-colors text-sm text-[var(--foreground-secondary)]"
        aria-label={`${count} developers online`}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse flex-shrink-0" />
        <span className="font-medium tabular-nums">
          {count}
        </span>
        <span className="hidden sm:inline">online now</span>
      </button>

      {isOpen && previewUsers.length > 0 && (
        <div
          role="tooltip"
          className="absolute right-0 top-full mt-2 z-50 min-w-[200px] bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-3"
        >
          <p className="text-xs text-[var(--foreground-secondary)] mb-2 font-medium">
            {count} developer{count !== 1 ? 's' : ''} online
          </p>
          <div className="flex items-center gap-1 flex-wrap">
            {previewUsers.map((user) => (
              <UserAvatarThumb key={user.id} user={user} />
            ))}
            {count > previewUsers.length && (
              <span className="text-xs text-[var(--foreground-secondary)] ml-1">
                +{count - previewUsers.length} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default LivePresence
