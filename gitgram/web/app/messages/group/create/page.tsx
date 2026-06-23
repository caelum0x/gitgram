'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'
import UserSelector from '@/components/UserSelector'
import { useToast } from '@/components/ui/toast'

export default function CreateGroupPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const [name, setName] = useState('')
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [creating, setCreating] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || selectedUsers.length === 0) {
      showToast('Please enter a group name and select at least one member', 'warning')
      return
    }

    setCreating(true)
    try {
      await api.post('/v1/messages/groups', {
        name,
        userIds: selectedUsers,
      })
      router.push('/messages')
    } catch (error) {
      console.error('Create group error:', error)
      showToast('Failed to create group', 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Create Group</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Group Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <UserSelector
            selectedUsers={selectedUsers}
            onUsersChange={setSelectedUsers}
          />

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={creating}
              className="px-6 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Group'}
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

