'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { githubService } from '@/services/githubService'
import { repoService } from '@/services/repoService'
import { parseRepositoryInput } from '@/utils/repositoryRouting'

interface LinkedRepo {
  owner: string
  name: string
  fullName: string
  description?: string
  stars?: number
  language?: string
}

interface RepoLinkerProps {
  onSelect: (repo: LinkedRepo) => void
  onClose: () => void
}

interface SearchResult {
  id?: string
  owner: string
  name: string
  fullName?: string
  full_name?: string
  description?: string
  stars?: number
  stargazers_count?: number
  language?: string
}

export default function RepoLinker({ onSelect, onClose }: RepoLinkerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [myProjects, setMyProjects] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [activeTab, setActiveTab] = useState<'my' | 'search'>('my')
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadMyProjects()
    if (inputRef.current) inputRef.current.focus()
  }, [])

  const loadMyProjects = async () => {
    try {
      const data = await githubService.getProjects()
      setMyProjects(data.projects || [])
    } catch {
      setMyProjects([])
    } finally {
      setLoadingProjects(false)
    }
  }

  const searchRepos = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }

    setLoading(true)
    try {
      const response = await repoService.search({ q: query, limit: 10 })
      setSearchResults(response.data?.repositories || response.data || [])
    } catch {
      setSearchResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSearchChange = (val: string) => {
    setSearchQuery(val)
    if (val.trim()) setActiveTab('search')

    // Debounced search
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      searchRepos(val)
    }, 400)
  }

  const handleSelect = (repo: SearchResult) => {
    onSelect({
      owner: repo.owner,
      name: repo.name,
      fullName: repo.fullName || repo.full_name || `${repo.owner}/${repo.name}`,
      description: repo.description,
      stars: repo.stars ?? repo.stargazers_count,
      language: repo.language,
    })
  }

  const handleGitHubUrlPaste = (val: string) => {
    const repositoryRef = parseRepositoryInput(val)
    if (repositoryRef) {
      onSelect({
        owner: repositoryRef.owner,
        name: repositoryRef.name,
        fullName: repositoryRef.fullName,
      })
    }
  }

  const displayRepos = activeTab === 'my' ? myProjects : searchResults
  const isLoading = activeTab === 'my' ? loadingProjects : loading

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-surface border border-border rounded-2xl shadow-xl overflow-hidden max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-foreground" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            <h3 className="text-lg font-semibold text-foreground">Link Repository</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-foreground-secondary hover:text-foreground hover:bg-surface-secondary rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search Input */}
        <div className="px-5 py-3 border-b border-border">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                handleSearchChange(e.target.value)
                handleGitHubUrlPaste(e.target.value)
              }}
              placeholder="Search repos or paste a GitHub URL..."
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground placeholder:text-foreground-secondary"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('my')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'my'
                ? 'text-primary border-primary'
                : 'text-foreground-secondary border-transparent hover:text-foreground'
            }`}
          >
            My Repos ({myProjects.length})
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'search'
                ? 'text-primary border-primary'
                : 'text-foreground-secondary border-transparent hover:text-foreground'
            }`}
          >
            Search
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : displayRepos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-foreground-secondary">
              <svg className="w-12 h-12 mb-3 opacity-50" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              <p className="text-sm">
                {activeTab === 'my'
                  ? 'No repositories found. Sync your GitHub projects first.'
                  : searchQuery.trim()
                  ? 'No repositories match your search.'
                  : 'Type to search for repositories.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {displayRepos.map((repo, index) => (
                <li key={repo.id || `${repo.owner}/${repo.name}-${index}`}>
                  <button
                    onClick={() => handleSelect(repo)}
                    className="w-full text-left px-5 py-3 hover:bg-surface-secondary transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-surface-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg className="w-4 h-4 text-foreground-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">
                          {repo.fullName || repo.full_name || `${repo.owner}/${repo.name}`}
                        </p>
                        {repo.description && (
                          <p className="text-xs text-foreground-secondary mt-0.5 line-clamp-1">
                            {repo.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1">
                          {repo.language && (
                            <span className="text-xs text-foreground-secondary flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-primary" />
                              {repo.language}
                            </span>
                          )}
                          {(repo.stars ?? repo.stargazers_count) !== undefined && (
                            <span className="text-xs text-foreground-secondary flex items-center gap-0.5">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279-7.416-3.967-7.417 3.967 1.481-8.279-6.064-5.828 8.332-1.151z" />
                              </svg>
                              {repo.stars ?? repo.stargazers_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="w-full py-2 text-sm text-foreground-secondary hover:text-foreground border border-border rounded-lg hover:bg-surface-secondary transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
