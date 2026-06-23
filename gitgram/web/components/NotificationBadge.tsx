'use client'

import { useNotificationBadge } from '@/hooks/useSocket'

interface NotificationBadgeProps {
  className?: string
  showZero?: boolean
  maxCount?: number
}

export default function NotificationBadge({
  className = '',
  showZero = false,
  maxCount = 99,
}: NotificationBadgeProps) {
  const { count } = useNotificationBadge()

  if (count === 0 && !showZero) return null

  const displayCount = count > maxCount ? `${maxCount}+` : count.toString()

  return (
    <span
      className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-error rounded-full ${className}`}
    >
      {displayCount}
    </span>
  )
}

// Dot badge (no count, just indicator)
export function NotificationDot({
  visible = true,
  className = '',
}: {
  visible?: boolean
  className?: string
}) {
  if (!visible) return null

  return (
    <span
      className={`w-2 h-2 bg-error rounded-full animate-pulse ${className}`}
    />
  )
}

// Badge with icon wrapper
export function IconWithBadge({
  children,
  count,
  showDot = false,
  maxCount = 99,
  className = '',
}: {
  children: React.ReactNode
  count?: number
  showDot?: boolean
  maxCount?: number
  className?: string
}) {
  const shouldShowBadge = count !== undefined && count > 0
  const shouldShowDot = showDot && !shouldShowBadge

  return (
    <div className={`relative inline-flex ${className}`}>
      {children}
      {shouldShowBadge && (
        <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[9px] font-bold text-white bg-error rounded-full">
          {count > maxCount ? `${maxCount}+` : count}
        </span>
      )}
      {shouldShowDot && (
        <span className="absolute top-0 right-0 w-2 h-2 bg-error rounded-full" />
      )}
    </div>
  )
}

// Hook-connected version for navigation
export function NavigationNotificationBadge({ className = '' }: { className?: string }) {
  const { count } = useNotificationBadge()

  if (count === 0) return null

  return (
    <span
      className={`absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-bold text-white bg-error rounded-full transform scale-100 transition-transform ${className}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
