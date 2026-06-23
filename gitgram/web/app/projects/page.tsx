'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { githubService } from '@/services/githubService'
import { useToast } from '@/components/ui/toast'

export default function ProjectsPage() {
  const router = useRouter()
  const { isAuthenticated, user } = useAuthStore()
  const { showToast } = useToast()
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return }
    loadProjects()
  }, [isAuthenticated])

  const loadProjects = async () => {
    try {
      const data = await githubService.getProjects()
      setProjects(data.projects || data)
    } catch (error) {
      showToast('Failed to load projects', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      await githubService.syncProjects()
      await loadProjects()
      showToast('Projects synced! 🎉', 'success')
    } catch (error) {
      showToast('Failed to sync projects', 'error')
    } finally {
      setSyncing(false)
    }
  }

  const handleConnect = () => {
    githubService.connectGitHub()
  }

  if (!isAuthenticated) return null

  if (!user?.githubUsername) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center">
        <div className="text-6xl mb-6">🔗</div>
        <h1 className="text-4xl font-bold mb-4">Connect GitHub</h1>
        <p className="text-xl text-muted mb-8">Connect your GitHub account to share your projects and engage with the community.</p>
        <button onClick={handleConnect} className="px-8 py-4 bg-primary text-white rounded-lg hover:bg-primary/90 text-lg font-semibold">
          Connect GitHub Account
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">My Projects</h1>
        <button onClick={handleSync} disabled={syncing} className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">
          {syncing ? 'Syncing...' : '🔄 Sync Projects'}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12 text-muted">
          <p className="mb-4">No projects found. Click "Sync Projects" to import from GitHub.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {projects.map(p => (
            <div key={p.id} onClick={() => router.push(`/project/${p.owner}/${p.name}`)} className="p-6 bg-card border border-border rounded-lg hover:bg-muted/50 cursor-pointer">
              <h3 className="text-xl font-bold mb-2">{p.name}</h3>
              <p className="text-sm text-muted mb-4">{p.description || 'No description'}</p>
              <div className="flex items-center gap-4 text-sm text-muted">
                <span>⭐ {p.stars || 0}</span>
                <span>🍴 {p.forks || 0}</span>
                <span>{p.language}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
