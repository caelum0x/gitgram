'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { storyService } from '@/services/storyService'

const REACTION_LABELS: Record<string, string> = {
  heart: 'Heart',
  fire: 'Fire',
  laugh: 'Laugh',
  wow: 'Wow',
  sad: 'Sad',
  angry: 'Angry',
}

const REACTION_EMOJI: Record<string, string> = {
  heart: '❤️',
  fire: '🔥',
  laugh: '😂',
  wow: '😮',
  sad: '😢',
  angry: '😡',
}

export default function StoryReactionsPage() {
  const params = useParams()
  const storyId = params.id as string
  const [reactions, setReactions] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadReactions()
  }, [storyId])

  const loadReactions = async () => {
    try {
      const response = await storyService.getStoryReactionSummary(storyId)
      setReactions(response.reactions || {})
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

  const entries = Object.entries(reactions).sort((a, b) => b[1] - a[1])

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Reactions</h1>
        <div className="space-y-2">
          {entries.map(([type, count]) => (
            <div
              key={type}
              className="flex items-center justify-between rounded-lg bg-surface p-4"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{REACTION_EMOJI[type] || '❤️'}</span>
                <div>
                  <p className="font-semibold text-foreground">
                    {REACTION_LABELS[type] || type}
                  </p>
                  <p className="text-sm text-foreground/60">{type}</p>
                </div>
              </div>
              <span className="text-lg font-semibold text-foreground">{count}</span>
            </div>
          ))}
        </div>
        {entries.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No reactions yet
          </div>
        )}
      </div>
    </div>
  )
}
