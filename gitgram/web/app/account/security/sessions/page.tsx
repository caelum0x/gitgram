'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'

export default function SessionsPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSessions()
  }, [])

  const loadSessions = async () => {
    try {
      const response = await api.get('/v1/settings/account/sessions')
      setSessions(response.data.sessions || [])
    } catch (error) {
      console.error('Load sessions error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRevoke = async (sessionId: string) => {
    if (!confirm('Are you sure you want to revoke this session?')) {
      return
    }

    try {
      await api.delete(`/v1/settings/account/sessions/${sessionId}`)
      setSessions(prev => prev.filter(s => s.id !== sessionId))
    } catch (error) {
      console.error('Revoke session error:', error)
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
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Active Sessions</h1>
        <div className="space-y-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between p-4 bg-surface rounded-lg"
            >
              <div>
                <p className="font-semibold text-foreground">{session.device || 'Unknown Device'}</p>
                <p className="text-sm text-foreground/70">
                  {session.ipAddress} • {session.userAgent}
                </p>
                <p className="text-xs text-foreground/50 mt-1">
                  Last active: {new Date(session.lastActive).toLocaleString()}
                </p>
                {session.isCurrent && (
                  <span className="inline-block mt-2 px-2 py-1 bg-accent/20 text-accent rounded text-xs">
                    Current Session
                  </span>
                )}
              </div>
              {!session.isCurrent && (
                <button
                  onClick={() => handleRevoke(session.id)}
                  className="px-4 py-2 bg-red-500/10 border border-red-500 text-red-500 rounded-lg text-sm font-semibold hover:bg-red-500/20"
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
        {sessions.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No active sessions
          </div>
        )}
      </div>
    </div>
  )
}

