'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'
import { useToast } from '@/components/ui/toast'

export default function DeleteAccountPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const { logout } = useAuthStore()
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (confirmText !== 'DELETE') {
      showToast('Please type DELETE to confirm', 'warning')
      return
    }

    setDeleting(true)
    try {
      await api.delete('/v1/compliance/account')
      await logout()
      router.push('/login')
    } catch (error) {
      console.error('Delete account error:', error)
      showToast('Failed to delete account', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-4">Delete Account</h1>
        <div className="bg-red-500/10 border border-red-500 rounded-lg p-6 mb-6">
          <p className="text-red-500 mb-4">
            Warning: This action cannot be undone. All your data will be permanently deleted.
          </p>
          <p className="text-foreground/70">
            This includes all your posts, reels, messages, and other data associated with your account.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Type <strong>DELETE</strong> to confirm
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="DELETE"
            />
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleDelete}
              disabled={deleting || confirmText !== 'DELETE'}
              className="px-6 py-2 bg-red-500 text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete Account'}
            </button>
            <button
              onClick={() => router.back()}
              className="px-6 py-2 bg-surface border border-border rounded-lg text-foreground hover:bg-surface/80"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

