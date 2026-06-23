'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { messageService } from '@/services/messageService'
import { userService } from '@/services/userService'

export default function ChatPage() {
  const params = useParams()
  const userId = params.userId as string
  const [messages, setMessages] = useState<any[]>([])
  const [user, setUser] = useState<any>(null)
  const [messageText, setMessageText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadUser()
    loadMessages()
  }, [userId])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const loadUser = async () => {
    try {
      const response = await userService.getProfile(userId)
      setUser(response.user || response)
    } catch (error) {
      console.error('Load user error:', error)
    }
  }

  const loadMessages = async () => {
    try {
      const response = await messageService.getMessages(userId)
      setMessages(response.messages || [])
    } catch (error) {
      console.error('Load messages error:', error)
    } finally {
      setLoading(false)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!messageText.trim() || sending) return

    setSending(true)
    try {
      const sentMessage = await messageService.sendMessage(userId, messageText)
      setMessages(prev => [...prev, sentMessage])
      setMessageText('')
    } catch (error) {
      console.error('Send message error:', error)
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border bg-surface">
        <Link href={`/profile/${user?.id}`}>
          {user?.avatar ? (
            <Image
              src={user.avatar}
              alt={user.username}
              width={40}
              height={40}
              className="rounded-full"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
              <span className="text-white font-semibold">
                {user?.username?.[0]?.toUpperCase()}
              </span>
            </div>
          )}
        </Link>
        <Link href={`/profile/${user?.id}`} className="font-semibold text-foreground hover:text-accent">
          {user?.username}
        </Link>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.senderId === userId ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                message.senderId === userId
                  ? 'bg-surface text-foreground'
                  : 'bg-accent text-white'
              }`}
            >
              {message.mediaUrl && (
                <div className="mb-2">
                  <Image
                    src={message.mediaUrl}
                    alt="Message media"
                    width={200}
                    height={200}
                    className="rounded-lg"
                  />
                </div>
              )}
              <p>{message.content}</p>
              <p className={`text-xs mt-1 ${message.senderId === userId ? 'text-foreground/50' : 'text-white/70'}`}>
                {new Date(message.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSendMessage} className="p-4 border-t border-border bg-surface">
        <div className="flex gap-2">
          <input
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            type="submit"
            disabled={sending || !messageText.trim()}
            className="px-6 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  )
}

