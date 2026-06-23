'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'
import { getErrorMessage } from '@/utils/error'
import { useToast } from '@/components/ui/toast'

export default function CreateCollectionPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name) {
      showToast('Please enter a collection name', 'warning')
      return
    }

    setCreating(true)
    try {
      await api.post('/v1/collections', { name, description })
      router.push('/saved/collections')
    } catch (error: unknown) {
      console.error('Create collection error:', error)
      showToast(getErrorMessage(error), 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Create Collection</h1>

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
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={creating}
              className="px-6 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Collection'}
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

