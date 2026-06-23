'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import api from '@/services/api'

export default function GroupSettingsPage() {
  const params = useParams()
  const router = useRouter()
  const groupId = params.groupId as string
  const [group, setGroup] = useState<any>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadGroup()
  }, [groupId])

  const loadGroup = async () => {
    try {
      const response = await api.get(`/v1/messages/groups/${groupId}`)
      const groupData = response.data.group || response.data
      setGroup(groupData)
      setName(groupData.name || '')
    } catch (error) {
      console.error('Load group error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.put(`/v1/messages/groups/${groupId}`, { name })
      router.back()
    } catch (error) {
      console.error('Update group error:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleLeave = async () => {
    if (!confirm('Are you sure you want to leave this group?')) {
      return
    }

    try {
      await api.post(`/v1/messages/groups/${groupId}/leave`)
      router.push('/messages')
    } catch (error) {
      console.error('Leave group error:', error)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Group Settings</h1>

        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Group Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
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
              onClick={handleLeave}
              className="px-6 py-2 bg-red-500/10 border border-red-500 text-red-500 rounded-lg hover:bg-red-500/20"
            >
              Leave Group
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

