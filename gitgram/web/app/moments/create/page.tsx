'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { momentService } from '@/services/momentService'
import { useToast } from '@/components/ui/toast'

export default function CreateMomentPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [selfie, setSelfie] = useState<File | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [creating, setCreating] = useState(false)

  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setScreenshot(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setScreenshotPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSelfieChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelfie(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setSelfiePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!screenshot || !selfie) {
      showToast('Please select both a screenshot and a selfie', 'warning')
      return
    }

    setCreating(true)
    try {
      const formData = new FormData()
      formData.append('screenshot', screenshot)
      formData.append('selfie', selfie)
      if (caption) formData.append('caption', caption)

      await momentService.createMoment(formData)
      router.push('/moments')
    } catch (error) {
      console.error('Create moment error:', error)
      showToast('Failed to create moment', 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Create Moment</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Screenshot *
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleScreenshotChange}
              required
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
            {screenshotPreview && (
              <div className="mt-4 relative aspect-video">
                <Image
                  src={screenshotPreview}
                  alt="Screenshot preview"
                  fill
                  className="object-cover rounded-lg"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Selfie (Front Camera) *
            </label>
            <input
              type="file"
              accept="image/*"
              capture="user"
              onChange={handleSelfieChange}
              required
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
            {selfiePreview && (
              <div className="mt-4 relative w-32 h-32">
                <Image
                  src={selfiePreview}
                  alt="Selfie preview"
                  fill
                  className="object-cover rounded-full"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Caption
            </label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Add a caption..."
            />
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={creating || !screenshot || !selfie}
              className="px-6 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Moment'}
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
