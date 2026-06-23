'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { reelService } from '@/services/reelService'

const REEL_EFFECTS = [
  { id: 'none', name: 'None', description: 'No visual treatment applied.' },
  { id: 'vintage', name: 'Vintage', description: 'Muted tones with a slight sepia look.' },
  { id: 'blackwhite', name: 'B&W', description: 'Monochrome styling for high contrast clips.' },
  { id: 'warm', name: 'Warm', description: 'Adds a soft amber color cast.' },
  { id: 'cool', name: 'Cool', description: 'Adds a subtle blue tint.' },
  { id: 'dramatic', name: 'Dramatic', description: 'Boosts contrast for a sharper feel.' },
  { id: 'fade', name: 'Fade', description: 'Softens contrast and saturation.' },
  { id: 'vivid', name: 'Vivid', description: 'Pushes saturation and contrast upward.' },
  { id: 'noir', name: 'Noir', description: 'Dark monochrome with extra contrast.' },
  { id: 'sepia', name: 'Sepia', description: 'Brown-toned classic photo treatment.' },
]

export default function ReelEffectsPage() {
  const params = useParams()
  const reelId = params.id as string
  const [effectId, setEffectId] = useState<string>('none')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void loadReel()
  }, [reelId])

  const loadReel = async () => {
    try {
      const response = await reelService.getReel(reelId)
      const reel = response.reel || response
      setEffectId(reel.effectId || 'none')
    } catch (error) {
      console.error('Load reel effect error:', error)
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
      <div className="max-w-3xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-2">Reel Effects</h1>
        <p className="text-sm text-foreground/70 mb-6">
          This reel currently persists its selected effect. Web can display the saved effect metadata, while mobile creation currently owns effect selection.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {REEL_EFFECTS.map((effect) => {
            const isActive = effect.id === effectId

            return (
              <div
                key={effect.id}
                className={`rounded-xl border p-4 ${
                  isActive
                    ? 'border-accent bg-accent/10'
                    : 'border-border bg-surface'
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <h2 className="font-semibold text-foreground">{effect.name}</h2>
                  {isActive && (
                    <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-white">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-sm text-foreground/70 mt-2">{effect.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
