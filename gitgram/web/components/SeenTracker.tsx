'use client'

import { useEffect, useRef } from 'react'

interface SeenTrackerProps {
  /** Called once when the element has been sufficiently visible. */
  onSeen: () => void
  children: React.ReactNode
  className?: string
  /** Fraction of the element that must be visible to count as seen (0-1). */
  threshold?: number
}

/**
 * Wraps feed content and fires `onSeen` once when it scrolls into view, using
 * an IntersectionObserver. Used to emit the "seen" feed-feedback signal so the
 * ranker can learn which posts the viewer actually looked at.
 */
export function SeenTracker({ onSeen, children, className, threshold = 0.5 }: SeenTrackerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const firedRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el || firedRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !firedRef.current) {
            firedRef.current = true
            onSeen()
            observer.disconnect()
          }
        }
      },
      { threshold },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [onSeen, threshold])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}

export default SeenTracker
