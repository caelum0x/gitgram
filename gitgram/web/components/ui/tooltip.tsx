'use client'

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'

interface TooltipProps {
  /** The element that triggers the tooltip on hover / focus. */
  children: ReactElement
  /** Floating content rendered in the popover. */
  content: ReactNode
  /** Delay before showing, in ms (default 400). */
  openDelay?: number
  /** Delay before hiding, in ms (default 150) — lets the pointer cross the gap. */
  closeDelay?: number
  /** Disable the tooltip entirely (renders only the trigger). */
  disabled?: boolean
  className?: string
}

/**
 * Lightweight, dependency-free hover/focus tooltip primitive.
 *
 * Adapted from the Radix-based `ui/tooltip` used by the source
 * nextjs-15-social-media-app, reimplemented with plain React so it matches the
 * gitgram-web convention of hand-rolled `components/ui` primitives (no Radix
 * dependency in the product). Supports keyboard focus, pointer hover with an
 * intent delay, and stays open while the pointer is over the content so it can
 * host interactive controls (e.g. a follow button).
 */
export function Tooltip({
  children,
  content,
  openDelay = 400,
  closeDelay = 150,
  disabled = false,
  className = '',
}: TooltipProps) {
  const [open, setOpen] = useState(false)
  const tooltipId = useId()
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = () => {
    if (showTimer.current) clearTimeout(showTimer.current)
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }

  useEffect(() => clearTimers, [])

  const scheduleOpen = () => {
    if (disabled) return
    clearTimers()
    showTimer.current = setTimeout(() => setOpen(true), openDelay)
  }

  const scheduleClose = () => {
    clearTimers()
    hideTimer.current = setTimeout(() => setOpen(false), closeDelay)
  }

  if (!isValidElement(children)) {
    throw new Error('Tooltip expects a single React element child')
  }

  const triggerProps = children.props as Record<string, unknown> & {
    onMouseEnter?: (e: unknown) => void
    onMouseLeave?: (e: unknown) => void
    onFocus?: (e: unknown) => void
    onBlur?: (e: unknown) => void
  }

  const trigger = cloneElement(children, {
    'aria-describedby': open ? tooltipId : undefined,
    onMouseEnter: (e: unknown) => {
      triggerProps.onMouseEnter?.(e)
      scheduleOpen()
    },
    onMouseLeave: (e: unknown) => {
      triggerProps.onMouseLeave?.(e)
      scheduleClose()
    },
    onFocus: (e: unknown) => {
      triggerProps.onFocus?.(e)
      if (!disabled) {
        clearTimers()
        setOpen(true)
      }
    },
    onBlur: (e: unknown) => {
      triggerProps.onBlur?.(e)
      scheduleClose()
    },
  } as Partial<typeof triggerProps>)

  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => !disabled && clearTimers()}
      onMouseLeave={scheduleClose}
    >
      {trigger}
      {open && !disabled && (
        <span
          role="tooltip"
          id={tooltipId}
          className="absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2"
          onMouseEnter={clearTimers}
          onMouseLeave={scheduleClose}
        >
          {content}
        </span>
      )}
    </span>
  )
}

export default Tooltip
