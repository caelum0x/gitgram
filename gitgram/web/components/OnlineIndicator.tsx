'use client'

import { usePresence } from '@/hooks/usePresence'

interface OnlineIndicatorProps {
  userId: string
  size?: 'sm' | 'md'
}

const SIZE_CLASSES: Record<NonNullable<OnlineIndicatorProps['size']>, string> = {
  sm: 'w-2.5 h-2.5',
  md: 'w-3.5 h-3.5',
}

export function OnlineIndicator({ userId, size = 'sm' }: OnlineIndicatorProps) {
  const { onlineUsers } = usePresence()
  const isOnline = onlineUsers.some((u) => u.id === userId)

  if (!isOnline) return null

  return (
    <span
      className={`${SIZE_CLASSES[size]} rounded-full bg-[var(--accent)] ring-2 ring-[var(--background)] block flex-shrink-0`}
      aria-label="Online"
      title="Online"
    />
  )
}

// Avatar wrapper with online badge — preserved for existing usages
interface AvatarWithOnlineStatusProps {
  userId: string
  avatar?: string
  username: string
  size?: number
  showOnlineStatus?: boolean
}

export function AvatarWithOnlineStatus({
  userId,
  avatar,
  username,
  size = 40,
  showOnlineStatus = true,
}: AvatarWithOnlineStatusProps) {
  const { onlineUsers } = usePresence()
  const isOnline = showOnlineStatus && onlineUsers.some((u) => u.id === userId)

  return (
    <div className="relative inline-block">
      {avatar ? (
        <img
          src={avatar}
          alt={username}
          className="rounded-full object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className="rounded-full bg-primary/20 flex items-center justify-center"
          style={{ width: size, height: size }}
        >
          <span
            className="text-primary font-semibold"
            style={{ fontSize: size * 0.4 }}
          >
            {username?.[0]?.toUpperCase() ?? '?'}
          </span>
        </div>
      )}
      {showOnlineStatus && (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-2 border-[var(--background)] ${
            isOnline ? 'bg-[var(--accent)]' : 'bg-[var(--foreground-secondary)]'
          }`}
          style={{
            width: Math.max(size * 0.25, 10),
            height: Math.max(size * 0.25, 10),
          }}
        />
      )}
    </div>
  )
}

export default OnlineIndicator
