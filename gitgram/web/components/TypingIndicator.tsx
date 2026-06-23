'use client'

interface TypingIndicatorProps {
  users: string[]
  className?: string
}

export default function TypingIndicator({ users, className = '' }: TypingIndicatorProps) {
  if (users.length === 0) return null

  const formatTypingText = () => {
    if (users.length === 1) {
      return `${users[0]} is typing`
    } else if (users.length === 2) {
      return `${users[0]} and ${users[1]} are typing`
    } else {
      return `${users[0]} and ${users.length - 1} others are typing`
    }
  }

  return (
    <div className={`flex items-center gap-2 text-muted text-sm ${className}`}>
      <div className="flex gap-1">
        <span className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span>{formatTypingText()}</span>
    </div>
  )
}

// Minimal version for tight spaces
export function TypingDots({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      <span
        className="w-1 h-1 bg-muted rounded-full animate-bounce"
        style={{ animationDelay: '0ms' }}
      />
      <span
        className="w-1 h-1 bg-muted rounded-full animate-bounce"
        style={{ animationDelay: '150ms' }}
      />
      <span
        className="w-1 h-1 bg-muted rounded-full animate-bounce"
        style={{ animationDelay: '300ms' }}
      />
    </div>
  )
}

// Chat-style typing indicator with avatar placeholders
export function ChatTypingIndicator({
  users,
  showAvatars = true,
  className = '',
}: {
  users: string[]
  showAvatars?: boolean
  className?: string
}) {
  if (users.length === 0) return null

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {showAvatars && (
        <div className="flex -space-x-2">
          {users.slice(0, 3).map((user, index) => (
            <div
              key={user}
              className="w-6 h-6 rounded-full bg-muted flex items-center justify-center border-2 border-background"
              style={{ zIndex: 3 - index }}
            >
              <span className="text-[10px] text-muted-foreground font-medium">
                {user[0]?.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="px-3 py-2 bg-muted rounded-2xl">
        <div className="flex gap-1">
          <span
            className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
            style={{ animationDelay: '0ms' }}
          />
          <span
            className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
            style={{ animationDelay: '150ms' }}
          />
          <span
            className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
            style={{ animationDelay: '300ms' }}
          />
        </div>
      </div>
    </div>
  )
}
