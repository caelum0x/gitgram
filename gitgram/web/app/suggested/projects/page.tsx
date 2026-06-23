'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { githubService } from '@/services/githubService'

export default function SuggestedProjectsPage() {
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSuggestedProjects()
  }, [])

  const loadSuggestedProjects = async () => {
    try {
      const response = await githubService.searchProjects('react', 1, 20)
      setProjects(response.projects || [])
    } catch (error) {
      console.error('Load suggested projects error:', error)
    } finally {
      setLoading(false)
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
      <div className="max-w-4xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Suggested Projects</h1>
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
        {projects.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No suggested projects
          </div>
        )}
      </div>
    </div>
  )
}

