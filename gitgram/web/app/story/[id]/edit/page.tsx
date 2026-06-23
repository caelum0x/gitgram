'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import api from '@/services/api'

export default function EditStoryPage() {
  const params = useParams()
  const router = useRouter()
  const storyId = params.id as string
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setLoading(false)
  }, [])

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this story?')) {
      return
    }

    setDeleting(true)
    try {
      await api.delete(`/v1/stories/${storyId}`)
      router.push('/story/archive')
    } catch (error) {
      console.error('Delete story error:', error)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Edit Story</h1>
        <div className="bg-surface rounded-lg p-6">
          <p className="text-foreground mb-4">
            Stories cannot be edited after posting. You can delete this story if needed.
          </p>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-6 py-2 bg-red-500 text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete Story'}
          </button>
        </div>
      </div>
    </div>
  )
}

