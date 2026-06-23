'use client'

import {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
  type KeyboardEvent,
} from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { useAuthStore } from '@/store/authStore'
import {
  messageService,
  type Message,
  type ConversationUser,
} from '@/services/messageService'
import { useSocket } from '@/hooks/useSocket'
import { useToast } from '@/components/ui/toast'
import { format, isToday, isYesterday, isSameDay } from 'date-fns'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DateGroup {
  label: string
  messages: Message[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function dateLabelFor(date: Date): string {
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'MMMM d, yyyy')
}

function groupByDate(messages: Message[]): DateGroup[] {
  const groups: DateGroup[] = []
  let currentDate: Date | null = null
  let currentGroup: Message[] = []

  for (const msg of messages) {
    const d = new Date(msg.createdAt)
    if (!currentDate || !isSameDay(d, currentDate)) {
      if (currentGroup.length > 0) {
        groups.push({ label: dateLabelFor(currentDate!), messages: currentGroup })
      }
      currentDate = d
      currentGroup = [msg]
    } else {
      currentGroup.push(msg)
    }
  }

  if (currentGroup.length > 0 && currentDate) {
    groups.push({ label: dateLabelFor(currentDate), messages: currentGroup })
  }

  return groups
}

function formatMsgTime(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'h:mm a')
  } catch {
    return ''
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface AvatarProps {
  user: ConversationUser | { username: string; avatar?: string }
  size?: number
  isOnline?: boolean
}

function Avatar({ user, size = 40, isOnline = false }: AvatarProps) {
  const gradient = gradientForUsername(user.username)
  const initial = user.username[0]?.toUpperCase() ?? '?'

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="rounded-full overflow-hidden" style={{ width: size, height: size }}>
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
            <span className="font-semibold text-white" style={{ fontSize: size * 0.38 }}>
              {initial}
            </span>
          </div>
        )}
      </div>
      {isOnline && (
        <span
          className="absolute bottom-0 right-0 rounded-full bg-green-500 border-2"
          style={{
            width: Math.max(size * 0.27, 10),
            height: Math.max(size * 0.27, 10),
            borderColor: 'var(--background)',
          }}
        />
      )}
    </div>
  )
}

interface TypingBubbleProps {
  username: string
}

function TypingBubble({ username }: TypingBubbleProps) {
  return (
    <div className="flex items-end gap-2 justify-start">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
        style={{ background: '#1A1A2E' }}
      >
        {username[0]?.toUpperCase()}
      </div>
      <div
        className="px-4 py-3 rounded-2xl rounded-bl-md flex items-center gap-1"
        style={{ background: '#1A1A2E' }}
      >
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="w-2 h-2 rounded-full animate-bounce"
            style={{ background: 'var(--foreground-secondary)', animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

interface MessageBubbleProps {
  message: Message
  isMine: boolean
  showAvatar: boolean
  otherUser: ConversationUser | null
  isLastInGroup: boolean
}

function MessageBubble({ message, isMine, showAvatar, otherUser, isLastInGroup }: MessageBubbleProps) {
  return (
    <div className={`flex items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
      {/* Avatar placeholder to keep alignment */}
      {!isMine && (
        <div className="w-7 h-7 shrink-0">
          {showAvatar && otherUser ? (
            <Avatar user={otherUser} size={28} />
          ) : null}
        </div>
      )}

      <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} max-w-[70%]`}>
        <div
          className={`px-4 py-2.5 text-sm leading-relaxed ${
            isMine
              ? 'rounded-2xl rounded-br-md text-white'
              : 'rounded-2xl rounded-bl-md'
          } ${message.isOptimistic ? 'opacity-70' : ''}`}
          style={{
            background: isMine ? '#7C3AED' : '#1A1A2E',
            color: isMine ? '#fff' : 'var(--foreground)',
          }}
        >
          {message.content}
        </div>
        {isLastInGroup && (
          <span
            className="text-[10px] mt-1 px-1"
            style={{ color: 'var(--foreground-secondary)' }}
          >
            {formatMsgTime(message.createdAt)}
            {isMine && (
              <span className="ml-1">
                {message.isOptimistic ? '·' : message.isRead ? '··' : '·'}
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ConversationPage() {
  const params = useParams()
  const router = useRouter()
  const { isAuthenticated, user } = useAuthStore()
  const { showToast } = useToast()
  const { joinChat, sendMessage: socketSendMessage, sendTyping, onNewMessage, onUserTyping, onlineUsers, isConnected } = useSocket()

  const conversationId = params?.conversationId as string

  const [messages, setMessages] = useState<Message[]>([])
  const [otherUser, setOtherUser] = useState<ConversationUser | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestMessageIdRef = useRef<string | null>(null)
  const optimisticIdCounter = useRef(0)

  // ── Guards ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
    }
  }, [isAuthenticated, router])

  // ── Load messages ─────────────────────────────────────────────────────────

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior })
  }, [])

  const loadMessages = useCallback(
    async (pageNum: number, silent = false) => {
      if (!conversationId) return
      try {
        if (!silent) setLoading(true)
        const response = await messageService.getMessages(conversationId, pageNum, 50)
        const fetched = response.messages ?? []

        if (pageNum === 1) {
          setMessages(fetched)
          // Track latest for polling diff
          if (fetched.length > 0) {
            latestMessageIdRef.current = fetched[fetched.length - 1].id
          }
          // Derive other user from first message that isn't ours
          if (!otherUser) {
            const foreign = fetched.find((m) => m.senderId !== user?.id)
            if (foreign?.sender) setOtherUser(foreign.sender)
          }
        } else {
          setMessages((prev) => [...fetched, ...prev])
        }

        // total tells us if there are older messages
        const total = response.total ?? fetched.length
        setHasMore(total > pageNum * 50)

        return fetched
      } catch (err: unknown) {
        if (!silent) showToast('Failed to load messages', 'error')
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [conversationId, user?.id, otherUser, showToast],
  )

  // ── Initial load & join chat ──────────────────────────────────────────────

  useEffect(() => {
    if (!isAuthenticated || !conversationId) return

    loadMessages(1).then(() => {
      setTimeout(() => scrollToBottom('instant'), 80)
    })

    if (isConnected) {
      joinChat(conversationId)
      messageService.markAsRead(conversationId).catch(() => {})
    }
  }, [conversationId, isAuthenticated, isConnected]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mark as read when conversation changes ────────────────────────────────

  useEffect(() => {
    if (conversationId && isAuthenticated) {
      messageService.markAsRead(conversationId).catch(() => {})
    }
  }, [conversationId, isAuthenticated])

  // ── Polling every 3s for new messages ────────────────────────────────────

  useEffect(() => {
    if (!conversationId || !isAuthenticated) return

    pollIntervalRef.current = setInterval(async () => {
      const fetched = await loadMessages(1, true)
      if (fetched && fetched.length > 0) {
        const latest = fetched[fetched.length - 1]
        if (latest.id !== latestMessageIdRef.current) {
          latestMessageIdRef.current = latest.id
          // Only auto-scroll if user is near bottom
          const container = messagesContainerRef.current
          if (container) {
            const { scrollTop, scrollHeight, clientHeight } = container
            const nearBottom = scrollHeight - scrollTop - clientHeight < 120
            if (nearBottom) scrollToBottom('smooth')
          }
        }
      }
    }, 3_000)

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [conversationId, isAuthenticated, loadMessages, scrollToBottom])

  // ── Socket: new message ───────────────────────────────────────────────────

  useEffect(() => {
    const unsub = onNewMessage((msg: Message) => {
      // Only append if it belongs to this conversation
      const isForThisConv =
        msg.chatId === conversationId ||
        msg.senderId === conversationId ||
        msg.receiverId === conversationId

      if (!isForThisConv) return

      setMessages((prev) => {
        // Avoid duplicates
        if (prev.some((m) => m.id === msg.id)) return prev
        return [...prev, msg]
      })
      scrollToBottom('smooth')
      messageService.markAsRead(conversationId).catch(() => {})
    })
    return unsub
  }, [onNewMessage, conversationId, scrollToBottom])

  // ── Socket: typing ────────────────────────────────────────────────────────

  useEffect(() => {
    const unsub = onUserTyping((data) => {
      if (data.chatId !== conversationId) return
      setTypingUsers((prev) => {
        if (prev.includes(data.username)) return prev
        return [...prev, data.username]
      })
      // Clear typing indicator after 3s of silence
      if (typingClearRef.current) clearTimeout(typingClearRef.current)
      typingClearRef.current = setTimeout(() => {
        setTypingUsers((prev) => prev.filter((u) => u !== data.username))
      }, 3_000)
    })
    return unsub
  }, [onUserTyping, conversationId])

  // ── Load more (older messages) ────────────────────────────────────────────

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    const container = messagesContainerRef.current
    const prevScrollHeight = container?.scrollHeight ?? 0
    setLoadingMore(true)
    const nextPage = page + 1
    await loadMessages(nextPage)
    setPage(nextPage)
    setLoadingMore(false)
    // Restore scroll position after prepend
    if (container) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight - prevScrollHeight
      })
    }
  }, [loadingMore, hasMore, page, loadMessages])

  // ── Send message ──────────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const content = inputValue.trim()
    if (!content || !conversationId || sending) return

    const optimisticId = `optimistic-${++optimisticIdCounter.current}`
    const optimisticMsg: Message = {
      id: optimisticId,
      content,
      senderId: user?.id ?? '',
      sender: user
        ? { id: user.id, username: user.username, avatar: user.avatar }
        : undefined,
      createdAt: new Date().toISOString(),
      isRead: false,
      isOptimistic: true,
    }

    setMessages((prev) => [...prev, optimisticMsg])
    setInputValue('')
    scrollToBottom('smooth')
    setSending(true)

    try {
      // Try HTTP send first (reliable), socket send is fire-and-forget
      const sent = await messageService.sendMessage(conversationId, content)
      // Replace optimistic message with real one
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? { ...sent, isOptimistic: false } : m)),
      )
      // Also emit via socket for real-time on the other end
      if (isConnected) {
        socketSendMessage(conversationId, content)
      }
    } catch (err: unknown) {
      // Remove optimistic message and restore input
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
      setInputValue(content)
      showToast('Failed to send message', 'error')
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }, [inputValue, conversationId, sending, user, scrollToBottom, isConnected, socketSendMessage, showToast])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInputValue(e.target.value)
      if (conversationId && isConnected) {
        sendTyping(conversationId)
      }
      // Auto-resize textarea
      const ta = e.currentTarget
      ta.style.height = 'auto'
      ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`
    },
    [conversationId, isConnected, sendTyping],
  )

  // ── Derived ───────────────────────────────────────────────────────────────

  const dateGroups = useMemo(() => groupByDate(messages), [messages])

  const isOtherUserOnline = otherUser ? onlineUsers.includes(otherUser.id) : false

  // ── Render ────────────────────────────────────────────────────────────────

  if (!isAuthenticated) return null

  return (
    <div
      className="flex h-[calc(100vh-4rem)]"
      style={{ background: 'var(--background)' }}
    >
      {/* ── Left pane: slim conversation list link ── */}
      <div
        className="hidden md:flex flex-col w-80 shrink-0 border-r"
        style={{ background: '#0F0F1A', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 pt-5 pb-3 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <h1 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>
            Messages
          </h1>
          <button
            onClick={() => router.push('/messages')}
            className="text-xs font-medium transition-colors hover:underline"
            style={{ color: '#7C3AED' }}
          >
            All chats
          </button>
        </div>

        {/* Active conversation card */}
        {otherUser && (
          <div
            className="flex items-center gap-3 px-4 py-4 border-b"
            style={{
              borderColor: 'var(--border)',
              background: '#1A1A2E',
            }}
          >
            <Avatar user={otherUser} size={44} isOnline={isOtherUserOnline} />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--foreground)' }}>
                {otherUser.displayName ?? otherUser.username}
              </p>
              <p className="text-xs" style={{ color: isOtherUserOnline ? '#22c55e' : 'var(--foreground-secondary)' }}>
                {isOtherUserOnline ? 'Online' : 'Offline'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Chat pane ── */}
      <div className="flex-1 flex flex-col min-w-0" style={{ background: '#0F0F1A' }}>

        {/* ── Chat header ── */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--border)', background: '#0F0F1A' }}
        >
          {/* Mobile back button */}
          <button
            onClick={() => router.push('/messages')}
            className="md:hidden mr-1 p-1.5 rounded-lg transition-colors hover:bg-[var(--surface-secondary)]"
            aria-label="Back to messages"
          >
            <svg className="w-5 h-5" style={{ color: 'var(--foreground-secondary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {otherUser ? (
            <>
              <Avatar user={otherUser} size={38} isOnline={isOtherUserOnline} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--foreground)' }}>
                  {otherUser.displayName ?? otherUser.username}
                </p>
                <p className="text-xs" style={{ color: isOtherUserOnline ? '#22c55e' : 'var(--foreground-secondary)' }}>
                  {isOtherUserOnline ? 'Online' : 'Offline'}
                </p>
              </div>
            </>
          ) : (
            <div className="flex-1 min-w-0">
              <div className="h-3.5 rounded w-32 animate-pulse" style={{ background: '#1A1A2E' }} />
            </div>
          )}

          {/* Profile link */}
          {otherUser && (
            <button
              onClick={() => router.push(`/@${otherUser.username}`)}
              className="p-2 rounded-lg transition-colors hover:bg-[var(--surface-secondary)]"
              title="View profile"
            >
              <svg className="w-4 h-4" style={{ color: 'var(--foreground-secondary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </button>
          )}
        </div>

        {/* ── Messages area ── */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto px-4 py-4"
          style={{ background: '#0F0F1A' }}
        >
          {/* Load more button */}
          {hasMore && (
            <div className="flex justify-center mb-4">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-4 py-1.5 rounded-full text-xs font-medium transition-colors disabled:opacity-50"
                style={{
                  background: '#1A1A2E',
                  color: 'var(--foreground-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                {loadingMore ? 'Loading...' : 'Load older messages'}
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col gap-4">
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className={`flex items-end gap-2 ${i % 3 === 2 ? 'justify-end' : 'justify-start'}`}
                >
                  {i % 3 !== 2 && (
                    <div className="w-7 h-7 rounded-full shrink-0 animate-pulse" style={{ background: '#1A1A2E' }} />
                  )}
                  <div
                    className="h-10 rounded-2xl animate-pulse"
                    style={{
                      background: '#1A1A2E',
                      width: `${120 + Math.abs(((i * 37) % 80))}px`,
                    }}
                  />
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: '#1A1A2E' }}
              >
                <svg className="w-7 h-7" style={{ color: '#7C3AED' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <p className="text-sm" style={{ color: 'var(--foreground-secondary)' }}>
                No messages yet. Say hello!
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {dateGroups.map((group) => (
                <div key={group.label}>
                  {/* Date separator */}
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                    <span className="text-[11px] font-medium px-2" style={{ color: 'var(--foreground-secondary)' }}>
                      {group.label}
                    </span>
                    <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                  </div>

                  {/* Messages in group */}
                  <div className="flex flex-col gap-1">
                    {group.messages.map((msg, idx) => {
                      const isMine = msg.senderId === user?.id
                      const nextMsg = group.messages[idx + 1]
                      const isLastInGroup =
                        !nextMsg ||
                        nextMsg.senderId !== msg.senderId ||
                        new Date(nextMsg.createdAt).getTime() - new Date(msg.createdAt).getTime() > 3 * 60 * 1000

                      const prevMsg = group.messages[idx - 1]
                      const showAvatar =
                        !isMine &&
                        (!prevMsg || prevMsg.senderId !== msg.senderId)

                      return (
                        <MessageBubble
                          key={msg.id}
                          message={msg}
                          isMine={isMine}
                          showAvatar={showAvatar}
                          otherUser={otherUser}
                          isLastInGroup={isLastInGroup}
                        />
                      )
                    })}
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {typingUsers.length > 0 && (
                <div className="mt-2">
                  <TypingBubble username={typingUsers[0]} />
                </div>
              )}
            </div>
          )}

          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>

        {/* ── Message input ── */}
        <div
          className="px-4 py-3 border-t shrink-0"
          style={{ borderColor: 'var(--border)', background: '#0F0F1A' }}
        >
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend() }}
            className="flex items-end gap-2"
          >
            {/* Current user avatar */}
            {user && (
              <div className="shrink-0 mb-1">
                <Avatar
                  user={{ username: user.username, avatar: user.avatar }}
                  size={32}
                />
              </div>
            )}

            {/* Textarea */}
            <div
              className="flex-1 flex items-end rounded-2xl overflow-hidden"
              style={{
                background: '#1A1A2E',
                border: '1px solid var(--border)',
              }}
            >
              <textarea
                ref={inputRef}
                rows={1}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Message..."
                maxLength={2000}
                className="flex-1 resize-none bg-transparent px-4 py-3 text-sm focus:outline-none leading-relaxed"
                style={{
                  color: 'var(--foreground)',
                  maxHeight: '120px',
                  minHeight: '44px',
                }}
              />
            </div>

            {/* Send button */}
            <button
              type="submit"
              disabled={!inputValue.trim() || sending}
              className="shrink-0 mb-1 w-9 h-9 rounded-full flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-95"
              style={{
                background: inputValue.trim() ? '#7C3AED' : '#1A1A2E',
                border: inputValue.trim() ? 'none' : '1px solid var(--border)',
              }}
              title="Send message (Enter)"
            >
              <svg
                className="w-4 h-4 translate-x-px"
                style={{ color: inputValue.trim() ? '#fff' : 'var(--foreground-secondary)' }}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </form>

          {/* Char count when near limit */}
          {inputValue.length > 1800 && (
            <p
              className="text-right text-[11px] mt-1 pr-12"
              style={{ color: inputValue.length > 1950 ? 'var(--error)' : 'var(--foreground-secondary)' }}
            >
              {2000 - inputValue.length} remaining
            </p>
          )}

          {/* Enter hint */}
          <p className="text-[10px] text-center mt-1" style={{ color: 'var(--foreground-secondary)', opacity: 0.5 }}>
            Press Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  )
}
