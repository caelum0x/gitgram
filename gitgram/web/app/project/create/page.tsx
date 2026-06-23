'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { githubService } from '@/services/githubService'
import { useToast } from '@/components/ui/toast'

export default function CreateProjectPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const [repoName, setRepoName] = useState('')
  const [owner, setOwner] = useState('')
  const [syncing, setSyncing] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!repoName || !owner) {
      showToast('Please enter repository name and owner', 'warning')
      return
    }

    setSyncing(true)
    try {
      await githubService.syncProject(repoName, owner)
      router.push('/feed')
    } catch (error) {
      console.error('Sync project error:', error)
      showToast('Failed to sync project', 'error')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Add GitHub Project</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Repository Owner *
            </label>
            <input
              type="text"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              required
              placeholder="username or organization"
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Repository Name *
            </label>
            <input
              type="text"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              required
              placeholder="repository-name"
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={syncing}
              className="px-6 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {syncing ? 'Syncing...' : 'Sync Project'}
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

