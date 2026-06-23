'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { reelService } from '@/services/reelService'

export default function EditReelPage() {
  const params = useParams()
  const router = useRouter()
  const reelId = params.id as string
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [music, setMusic] = useState<{ title: string; artist: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadReel()
  }, [reelId])

  const loadReel = async () => {
    try {
      const response = await reelService.getReel(reelId)
      const reel = response.reel || response
      setCaption(reel.caption || reel.description || '')
      setHashtags(reel.hashtags?.join(', ') || '')
      setMusic(reel.music ? { title: reel.music.title, artist: reel.music.artist } : null)
    } catch (error) {
      console.error('Load reel error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await reelService.updateReel(reelId, {
        caption,
        hashtags: hashtags.split(',').map(t => t.trim()).filter(Boolean),
      })
      router.push(`/reel/${reelId}`)
    } catch (error) {
      console.error('Update reel error:', error)
    } finally {
      setSaving(false)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Edit Reel</h1>

        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Caption
            </label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={6}
              className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Hashtags (comma separated)
            </label>
            <input
              type="text"
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="#react #javascript"
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Music</p>
                <p className="text-sm text-foreground/70 mt-1">
                  {music ? `${music.title} • ${music.artist}` : 'No track attached'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push(`/reel/${reelId}/music`)}
                className="px-4 py-2 bg-surface border border-border rounded-lg text-foreground hover:bg-surface/80"
              >
                Manage Music
              </button>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-2 bg-surface border border-border rounded-lg text-foreground hover:bg-surface/80"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
