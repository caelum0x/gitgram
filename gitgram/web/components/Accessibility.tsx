'use client'

import { useEffect, useState } from 'react'

// Skip link for keyboard navigation
export function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded-lg"
    >
      Skip to main content
    </a>
  )
}

// Screen reader only announcements
export function ScreenReaderAnnouncement({
  message,
  politeness = 'polite',
}: {
  message: string
  politeness?: 'polite' | 'assertive'
}) {
  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  )
}

// Focus trap for modals
export function useFocusTrap(isActive: boolean) {
  useEffect(() => {
    if (!isActive) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const focusableElements = document.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      const firstElement = focusableElements[0] as HTMLElement
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault()
        lastElement?.focus()
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault()
        firstElement?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isActive])
}

// Keyboard shortcut handler
export function useKeyboardShortcut(
  key: string,
  callback: () => void,
  options?: {
    ctrl?: boolean
    shift?: boolean
    alt?: boolean
    meta?: boolean
    preventDefault?: boolean
  }
) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMatch =
        e.key.toLowerCase() === key.toLowerCase() &&
        (!options?.ctrl || e.ctrlKey) &&
        (!options?.shift || e.shiftKey) &&
        (!options?.alt || e.altKey) &&
        (!options?.meta || e.metaKey)

      if (isMatch) {
        if (options?.preventDefault) {
          e.preventDefault()
        }
        callback()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [key, callback, options])
}

// Reduce motion hook
export function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mediaQuery.matches)

    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  return reducedMotion
}

// Visually hidden text (for screen readers)
export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return <span className="sr-only">{children}</span>
}

// Focus visible ring styles
export const focusRingClasses =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background'

// Accessible icon button
interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  icon: React.ReactNode
}

export function IconButton({ label, icon, className = '', ...props }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={`p-2 rounded-lg hover:bg-muted transition-colors ${focusRingClasses} ${className}`}
      {...props}
    >
      {icon}
    </button>
  )
}

// Live region for dynamic content
export function LiveRegion({
  children,
  politeness = 'polite',
}: {
  children: React.ReactNode
  politeness?: 'polite' | 'assertive' | 'off'
}) {
  return (
    <div
      role="region"
      aria-live={politeness}
      aria-relevant="additions text"
      aria-atomic="false"
    >
      {children}
    </div>
  )
}

// Progress indicator with screen reader support
export function AccessibleProgress({
  value,
  max = 100,
  label,
  showValue = true,
}: {
  value: number
  max?: number
  label: string
  showValue?: boolean
}) {
  const percentage = Math.round((value / max) * 100)

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        {showValue && <span>{percentage}%</span>}
      </div>
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={`${label}: ${percentage}%`}
        className="h-2 bg-muted rounded-full overflow-hidden"
      >
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
