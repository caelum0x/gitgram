'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { githubService } from '@/services/githubService'

export default function SavedProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async (pageNum = 1, refresh = false) => {
    try {
      setLoading(true)
      const response = await githubService.getSavedProjects(pageNum, 20)
      const newProjects = response.projects || []

      if (refresh) {
        setProjects(newProjects)
      } else {
        setProjects((prev) => [...prev, ...newProjects])
      }
      setHasMore(response.pagination?.page < response.pagination?.pages)
    } catch (error) {
      console.error('Load saved projects error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      const nextPage = page + 1
      setPage(nextPage)
      loadProjects(nextPage)
    }
  }

  if (loading && projects.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold text-foreground mb-8">Saved Projects</h1>

        {projects.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/project/${project.id}`}
                  className="bg-surface rounded-lg overflow-hidden hover:bg-surface/80 transition-colors"
                >
                  {project.screenshots && project.screenshots.length > 0 ? (
                    <div className="relative aspect-video">
                      <Image
                        src={project.screenshots[0]}
                        alt={project.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="aspect-video bg-border flex items-center justify-center">
                      <span className="text-4xl">📦</span>
                    </div>
                  )}
                  <div className="p-4">
                    <h3 className="font-semibold text-foreground mb-2">{project.name}</h3>
                    {project.description && (
                      <p className="text-sm text-foreground/70 mb-3 line-clamp-2">
                        {project.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-sm text-foreground/70">
                      <span>⭐ {project.stars || 0}</span>
                      {project.language && <span>{project.language}</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            {hasMore && (
              <div className="text-center mt-8">
                <button
                  onClick={handleLoadMore}
                  disabled={loading}
                  className="px-6 py-2 bg-surface border border-border rounded-lg text-foreground hover:bg-surface/80 disabled:opacity-50"
                >
                  {loading ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12 text-foreground/70">
            <p className="text-xl mb-2">No saved projects</p>
            <p className="text-sm">Save projects to view them here</p>
          </div>
        )}
      </div>
    </div>
  )
}

