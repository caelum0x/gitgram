'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'

export default function DiscoverProjectsPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const [projects, setProjects] = useState<any[]>([])

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return }
    api.get('/projects/popular').then(r => setProjects(r.data.projects || [])).catch(() => {})
  }, [isAuthenticated])

  if (!isAuthenticated) return null

  const popularProjects = [
    { owner: 'microsoft', repo: 'vscode', name: 'Visual Studio Code', desc: 'Code editor', stars: '150K', lang: 'TypeScript' },
    { owner: 'torvalds', repo: 'linux', name: 'Linux Kernel', desc: 'Linux kernel source', stars: '150K', lang: 'C' },
    { owner: 'facebook', repo: 'react', name: 'React', desc: 'JavaScript library', stars: '200K', lang: 'JavaScript' },
    { owner: 'vercel', repo: 'next.js', name: 'Next.js', desc: 'React framework', stars: '110K', lang: 'JavaScript' },
    { owner: 'nodejs', repo: 'node', name: 'Node.js', desc: 'JavaScript runtime', stars: '95K', lang: 'JavaScript' },
    { owner: 'python', repo: 'cpython', name: 'Python', desc: 'Python language', stars: '55K', lang: 'Python' },
  ]

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">Discover Projects</h1>
      
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-4">Popular Projects</h2>
        <div className="grid grid-cols-2 gap-4">
          {popularProjects.map(p => (
            <div key={`${p.owner}/${p.repo}`} onClick={() => router.push(`/project/${p.owner}/${p.repo}`)} className="p-6 bg-card border border-border rounded-lg hover:bg-muted/50 cursor-pointer">
              <h3 className="text-xl font-bold mb-2">{p.name}</h3>
              <p className="text-sm text-muted mb-4">{p.desc}</p>
              <div className="flex items-center gap-4 text-sm text-muted">
                <span>⭐ {p.stars}</span>
                <span>{p.lang}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {projects.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-4">Trending Now</h2>
          <div className="grid grid-cols-2 gap-4">
            {projects.map(p => (
              <div key={p.id} onClick={() => router.push(`/project/${p.owner}/${p.name}`)} className="p-6 bg-card border border-border rounded-lg hover:bg-muted/50 cursor-pointer">
                <h3 className="text-xl font-bold mb-2">{p.name}</h3>
                <p className="text-sm text-muted mb-4">{p.description}</p>
                <div className="flex items-center gap-4 text-sm text-muted">
                  <span>⭐ {p.stars || 0}</span>
                  <span>{p.language}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
