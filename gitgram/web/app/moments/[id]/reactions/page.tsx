'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import api from '@/services/api'

export default function MomentReactionsPage() {
  const params = useParams()
  const momentId = params.id as string
  const [reactions, setReactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadReactions()
  }, [momentId])

  const loadReactions = async () => {
    try {
      const response = await api.get(`/v1/moments/${momentId}/reactions`)
      setReactions(response.data.reactions || [])
    } catch (error) {
      console.error('Load reactions error:', error)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Reactions</h1>
        <div className="space-y-2">
          {reactions.map((reaction) => (
            <Link
              key={reaction.id}
              href={`/profile/${reaction.userId}`}
              className="flex items-center gap-4 p-4 bg-surface rounded-lg hover:bg-surface/80"
            >
              {reaction.user?.avatar ? (
                <Image
                  src={reaction.user.avatar}
                  alt={reaction.user.username}
                  width={50}
                  height={50}
                  className="rounded-full"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center">
                  <span className="text-white font-semibold">
                    {reaction.user?.username?.[0]?.toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex-1">
                <p className="font-semibold text-foreground">@{reaction.user?.username}</p>
              </div>
              <span className="text-2xl">{reaction.type || '❤️'}</span>
            </Link>
          ))}
        </div>
        {reactions.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No reactions yet
          </div>
        )}
      </div>
    </div>
  )
}

