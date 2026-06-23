'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import api from '@/services/api'

export default function MessageRequestsPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRequests()
  }, [])

  const loadRequests = async () => {
    try {
      const response = await api.get('/v1/messages/requests')
      setRequests(response.data.requests || [])
    } catch (error) {
      console.error('Load requests error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAccept = async (userId: string) => {
    try {
      await api.post(`/v1/messages/requests/${userId}/accept`)
      setRequests(prev => prev.filter(r => r.userId !== userId))
    } catch (error) {
      console.error('Accept request error:', error)
    }
  }

  const handleDecline = async (userId: string) => {
    try {
      await api.post(`/v1/messages/requests/${userId}/decline`)
      setRequests(prev => prev.filter(r => r.userId !== userId))
    } catch (error) {
      console.error('Decline request error:', error)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Message Requests</h1>
        <div className="space-y-2">
          {requests.map((request) => (
            <div
              key={request.id}
              className="flex items-center justify-between p-4 bg-surface rounded-lg"
            >
              <Link
                href={`/profile/${request.userId}`}
                className="flex items-center gap-4 flex-1"
              >
                {request.user?.avatar ? (
                  <Image
                    src={request.user.avatar}
                    alt={request.user.username}
                    width={50}
                    height={50}
                    className="rounded-full"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center">
                    <span className="text-white font-semibold">
                      {request.user?.username?.[0]?.toUpperCase()}
                    </span>
                  </div>
                )}
                <div>
                  <p className="font-semibold text-foreground">@{request.user?.username}</p>
                  {request.message && (
                    <p className="text-sm text-foreground/70">{request.message}</p>
                  )}
                </div>
              </Link>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAccept(request.userId)}
                  className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:opacity-90"
                >
                  Accept
                </button>
                <button
                  onClick={() => handleDecline(request.userId)}
                  className="px-4 py-2 bg-surface border border-border text-foreground rounded-lg text-sm font-semibold hover:bg-surface/80"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
        {requests.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No message requests
          </div>
        )}
      </div>
    </div>
  )
}

