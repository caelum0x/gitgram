'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import api from '@/services/api'
import { useToast } from '@/components/ui/toast'

export default function CreateHighlightPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const [name, setName] = useState('')
  const [coverImage, setCoverImage] = useState<File | null>(null)
  const [storyIds, setStoryIds] = useState<string[]>([])
  const [archives, setArchives] = useState<any[]>([])
  const [loadingArchives, setLoadingArchives] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadArchives()
  }, [])

  const loadArchives = async () => {
    try {
      const response = await api.get('/v1/stories/archives')
      setArchives(response.data.archives || [])
    } catch (error) {
      console.error('Load archived stories error:', error)
      showToast('Failed to load archived stories', 'error')
    } finally {
      setLoadingArchives(false)
    }
  }

  const toggleArchive = (archiveId: string) => {
    setStoryIds((prev) =>
      prev.includes(archiveId)
        ? prev.filter((id) => id !== archiveId)
        : [...prev, archiveId]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      showToast('Please enter a highlight name', 'warning')
      return
    }
    if (storyIds.length === 0) {
      showToast('Select at least one archived story', 'warning')
      return
    }

    setCreating(true)
    try {
      const formData = new FormData()
      formData.append('name', name.trim())
      if (coverImage) formData.append('coverImage', coverImage)
      storyIds.forEach((id) => formData.append('storyIds', id))

      await api.post('/v1/stories/highlights', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      router.push('/story/highlights')
    } catch (error) {
      console.error('Create highlight error:', error)
      showToast('Failed to create highlight', 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Create Highlight</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Cover Image
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setCoverImage(e.target.files?.[0] || null)}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm font-medium text-foreground">
                Archived Stories *
              </label>
              <span className="text-xs text-foreground/60">{storyIds.length} selected</span>
            </div>

            {loadingArchives ? (
              <div className="rounded-lg border border-border bg-surface p-4 text-sm text-foreground/70">
                Loading archived stories...
              </div>
            ) : archives.length === 0 ? (
              <div className="rounded-lg border border-border bg-surface p-4 text-sm text-foreground/70">
                You do not have any archived stories yet.
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {archives.map((archive) => {
                  const selected = storyIds.includes(archive.id)
                  return (
                    <button
                      key={archive.id}
                      type="button"
                      onClick={() => toggleArchive(archive.id)}
                      className={`relative aspect-[9/16] overflow-hidden rounded-lg border ${
                        selected ? 'border-accent ring-2 ring-accent/40' : 'border-border'
                      }`}
                    >
                      {archive.mediaUrl && archive.mediaType === 'image' ? (
                        <Image
                          src={archive.mediaUrl}
                          alt={archive.caption || 'Archived story'}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-black/80 text-white text-sm font-semibold">
                          Video Archive
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-black/60 p-2 text-left">
                        <p className="line-clamp-2 text-xs text-white">
                          {archive.caption || 'Archived story'}
                        </p>
                      </div>
                      <div className="absolute right-2 top-2">
                        <div
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                            selected ? 'bg-accent text-white' : 'bg-white/90 text-black'
                          }`}
                        >
                          {selected ? '✓' : '+'}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={creating}
              className="px-6 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Highlight'}
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
