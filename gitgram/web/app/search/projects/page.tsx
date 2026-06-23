'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { githubService } from '@/services/githubService'

export default function SearchProjectsPage() {
  const searchParams = useSearchParams()
  const query = searchParams.get('q') || ''
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (query) {
      searchProjects()
    }
  }, [query])

  const searchProjects = async () => {
    setLoading(true)
    try {
      const response = await githubService.searchProjects(query)
      setProjects(response.projects || [])
    } catch (error) {
      console.error('Search projects error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Search Projects</h1>
        {loading ? (
          <div className="text-center py-12 text-foreground/70">Loading...</div>
        ) : (
          <div className="space-y-4">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/project/${project.id}`}
                className="block p-6 bg-surface rounded-lg hover:bg-surface/80"
              >
                <h3 className="text-xl font-semibold text-foreground mb-2">{project.name}</h3>
                {project.description && (
                  <p className="text-foreground/70 mb-2">{project.description}</p>
                )}
                <div className="flex items-center gap-4 text-foreground/70 text-sm">
                  <span>⭐ {project.stars || 0}</span>
                  <span>🍴 {project.forks || 0}</span>
                  {project.language && <span>{project.language}</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
        {projects.length === 0 && query && !loading && (
          <div className="text-center py-12 text-foreground/70">
            No projects found for "{query}"
          </div>
        )}
      </div>
    </div>
  )
}
