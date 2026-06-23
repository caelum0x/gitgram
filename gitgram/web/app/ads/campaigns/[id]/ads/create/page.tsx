'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { adService } from '@/services/adService'
import { getErrorMessage } from '@/utils/error'
import { useToast } from '@/components/ui/toast'

export default function CreateAdPage() {
  const params = useParams()
  const router = useRouter()
  const campaignId = params.id as string
  const { showToast } = useToast()

  const [loading, setLoading] = useState(false)
  const [media, setMedia] = useState<File | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    callToAction: '',
    destinationUrl: '',
    placement: ['feed'] as string[],
    priority: '0',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title && !media) {
      showToast('Please provide either a title or upload media', 'warning')
      return
    }

    try {
      setLoading(true)
      const formDataToSend = new FormData()
      formDataToSend.append('campaignId', campaignId)
      if (formData.title) formDataToSend.append('title', formData.title)
      if (formData.content) formDataToSend.append('content', formData.content)
      if (formData.callToAction) formDataToSend.append('callToAction', formData.callToAction)
      if (formData.destinationUrl) formDataToSend.append('destinationUrl', formData.destinationUrl)
      formDataToSend.append('placement', JSON.stringify(formData.placement))
      formDataToSend.append('priority', formData.priority)
      if (media) formDataToSend.append('media', media)

      await adService.createAd(formDataToSend)

      showToast('Ad created successfully! It will be reviewed before going live.', 'success')
      router.back()
    } catch (error: unknown) {
      console.error('Create ad error:', error)
      showToast(getErrorMessage(error), 'error')
    } finally {
      setLoading(false)
    }
  }

  const togglePlacement = (placement: string) => {
    setFormData((prev) => ({
      ...prev,
      placement: prev.placement.includes(placement)
        ? prev.placement.filter((p) => p !== placement)
        : [...prev.placement, placement],
    }))
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold text-foreground mb-8">Create Ad</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Title
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Ad title"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Content
            </label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              rows={4}
              className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Ad content..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Media
            </label>
            <input
              type="file"
              accept="image/*,video/*"
              onChange={(e) => setMedia(e.target.files?.[0] || null)}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Call to Action
            </label>
            <input
              type="text"
              value={formData.callToAction}
              onChange={(e) => setFormData({ ...formData, callToAction: e.target.value })}
              className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Learn More, Shop Now, etc."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Destination URL
            </label>
            <input
              type="url"
              value={formData.destinationUrl}
              onChange={(e) => setFormData({ ...formData, destinationUrl: e.target.value })}
              className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="https://example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Placement
            </label>
            <div className="space-y-2">
              {['feed', 'stories', 'reels', 'explore'].map((placement) => (
                <label key={placement} className="flex items-center gap-3 p-3 bg-surface rounded-lg cursor-pointer hover:bg-surface/80">
                  <input
                    type="checkbox"
                    checked={formData.placement.includes(placement)}
                    onChange={() => togglePlacement(placement)}
                    className="text-accent"
                  />
                  <span className="text-foreground capitalize">{placement}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Priority
            </label>
            <input
              type="number"
              min="0"
              max="10"
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-accent text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Ad'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-3 bg-surface border border-border text-foreground rounded-lg font-semibold hover:opacity-90"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

