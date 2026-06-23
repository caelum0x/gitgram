'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { momentService } from '@/services/momentService'
import { useToast } from '@/components/ui/toast'

export default function DeleteMomentPage() {
  const params = useParams()
  const router = useRouter()
  const momentId = params.id as string
  const { showToast } = useToast()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this moment? This action cannot be undone.')) {
      return
    }

    setDeleting(true)
    try {
      await momentService.deleteMoment(momentId)
      router.push('/moments')
    } catch (error) {
      console.error('Delete moment error:', error)
      showToast('Failed to delete moment', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Delete Moment</h1>
        <div className="bg-surface rounded-lg p-6 mb-6">
          <p className="text-foreground mb-4">
            Are you sure you want to delete this moment? This action cannot be undone.
          </p>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="w-full px-6 py-2 bg-red-500 text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete Moment'}
          </button>
        </div>
        <button
          onClick={() => router.back()}
          className="w-full px-6 py-2 bg-surface border border-border rounded-lg text-foreground hover:bg-surface/80"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

