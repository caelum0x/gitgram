'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import api from '@/services/api'

export default function SecuritySettingsPage() {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSecuritySettings()
  }, [])

  const loadSecuritySettings = async () => {
    try {
      const [settingsResponse, sessionsResponse] = await Promise.all([
        api.get('/v1/settings/account'),
        api.get('/v1/settings/account/sessions'),
      ])
      setTwoFactorEnabled(settingsResponse.data.settings?.twoFactorEnabled || false)
      setSessions(sessionsResponse.data.sessions || [])
    } catch (error) {
      console.error('Load security settings error:', error)
    } finally {
      setLoading(false)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Security Settings</h1>

        <div className="space-y-6">
          <div className="bg-surface rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-1">Two-Factor Authentication</h2>
                <p className="text-sm text-foreground/70">
                  {twoFactorEnabled ? 'Enabled' : 'Disabled'}
                </p>
              </div>
              <Link
                href="/account/security/2fa-setup"
                className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:opacity-90"
              >
                {twoFactorEnabled ? 'Manage' : 'Enable'}
              </Link>
            </div>
          </div>

          <div className="bg-surface rounded-lg p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Active Sessions</h2>
            <div className="space-y-2">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 bg-background rounded-lg"
                >
                  <div>
                    <p className="text-foreground font-medium">{session.device || 'Unknown Device'}</p>
                    <p className="text-sm text-foreground/70">
                      {session.ipAddress} • {new Date(session.lastActive).toLocaleString()}
                    </p>
                  </div>
                  {session.isCurrent && (
                    <span className="text-xs text-accent">Current</span>
                  )}
                </div>
              ))}
            </div>
            <Link
              href="/account/security/sessions"
              className="block mt-4 text-accent hover:underline text-sm"
            >
              Manage Sessions
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

