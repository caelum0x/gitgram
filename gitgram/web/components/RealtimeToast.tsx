'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useRealtime } from '@/hooks/useRealtime'
import type { Notification, Message } from '@/services/realtimeService'

// ─── Types ──────────────────────────────────────────────────────────────────

type ToastKind = 'notification' | 'message'

interface ToastItem {
  /** Unique key for React + dismissal bookkeeping. */
  id: string
  kind: ToastKind
  /** Headline (e.g. the actor's username). */
  title: string
  /** Body text describing what happened. */
  body: string
  /** Initial(s) shown in the avatar circle. */
  avatarText: string
  /** Optional avatar image URL. */
  avatarUrl: string | null
  /** Route to push to when the toast is clicked. */
  href: string
}

// ─── Config ─────────────────────────────────────────────────────────────────

const AUTO_DISMISS_MS = 5_000
const MAX_VISIBLE = 3

// ─── Helpers ────────────────────────────────────────────────────────────────

function initialsFrom(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) return '•'
  return trimmed.slice(0, 2).toUpperCase()
}

function truncate(value: string, max: number): string {
  const trimmed = value.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

function notificationToToast(n: Notification): ToastItem {
  const username = n.actorUsername ?? 'Someone'
  const href = n.postId ? `/post/${n.postId}` : `/notifications`
  return {
    id: `notif-${n.id}`,
    kind: 'notification',
    title: username,
    body: truncate(n.message ?? 'New notification', 80),
    avatarText: initialsFrom(username),
    avatarUrl: null,
    href,
  }
}

function messageToToast(m: Message): ToastItem {
  return {
    id: `msg-${m.id}`,
    kind: 'message',
    title: 'New message',
    body: truncate(m.content ?? '', 80),
    avatarText: initialsFrom(m.senderId),
    avatarUrl: null,
    href: `/messages?chat=${encodeURIComponent(m.chatId)}`,
  }
}

// ─── Single toast ─────────────────────────────────────────────────────────────

interface ToastRowProps {
  item: ToastItem
  onDismiss: (id: string) => void
  onClick: (item: ToastItem) => void
}

function ToastRow({ item, onDismiss, onClick }: ToastRowProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-3 w-[320px] px-4 py-3 rounded-xl border shadow-2xl animate-[slideIn_0.25s_ease-out]"
      style={{ backgroundColor: '#1A1A2E', borderColor: '#2D2D50' }}
    >
      <button
        type="button"
        onClick={() => onClick(item)}
        className="flex items-start gap-3 flex-1 min-w-0 text-left focus:outline-none"
      >
        <span
          className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold text-white overflow-hidden"
          style={{ backgroundColor: '#2D2D50' }}
          aria-hidden="true"
        >
          {item.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            item.avatarText
          )}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{item.title}</p>
          <p className="text-xs text-gray-300 leading-snug line-clamp-2">{item.body}</p>
        </div>
      </button>

      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(item.id)}
        className="flex-shrink-0 text-gray-500 hover:text-gray-300 transition-colors p-0.5"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

// ─── Container ────────────────────────────────────────────────────────────────

/**
 * Listens for realtime notifications/messages and renders a stack of up to
 * {@link MAX_VISIBLE} auto-dismissing toasts. Mount once in the app shell.
 */
export function RealtimeToast() {
  const router = useRouter()
  const { lastNotification, lastMessage } = useRealtime()
  const [toasts, setToasts] = useState<ToastItem[]>([])

  // Track the ids we have already surfaced so the same SSE event (which stays
  // in `lastNotification` until the next one arrives) is not re-toasted.
  const seenRef = useRef<Set<string>>(new Set())
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const enqueue = useCallback(
    (item: ToastItem) => {
      if (seenRef.current.has(item.id)) return
      seenRef.current.add(item.id)

      setToasts((prev) => [item, ...prev].slice(0, MAX_VISIBLE))

      const timer = setTimeout(() => dismiss(item.id), AUTO_DISMISS_MS)
      timersRef.current.set(item.id, timer)
    },
    [dismiss],
  )

  const handleClick = useCallback(
    (item: ToastItem) => {
      dismiss(item.id)
      router.push(item.href)
    },
    [dismiss, router],
  )

  useEffect(() => {
    if (lastNotification) enqueue(notificationToToast(lastNotification))
  }, [lastNotification, enqueue])

  useEffect(() => {
    if (lastMessage) enqueue(messageToToast(lastMessage))
  }, [lastMessage, enqueue])

  // Clean up any outstanding timers on unmount.
  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
    }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(16px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      {toasts.map((item) => (
        <div key={item.id} className="pointer-events-auto">
          <ToastRow item={item} onDismiss={dismiss} onClick={handleClick} />
        </div>
      ))}
    </div>
  )
}

export default RealtimeToast
