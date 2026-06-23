'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import api from '@/services/api'

export default function RecentSearchesPage() {
  const [recentSearches, setRecentSearches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRecentSearches()
  }, [])

  const loadRecentSearches = async () => {
    try {
      // Get from localStorage or API
      const stored = localStorage.getItem('recent-searches')
      if (stored) {
        setRecentSearches(JSON.parse(stored))
      }
    } catch (error) {
      console.error('Load recent searches error:', error)
    } finally {
      setLoading(false)
    }
  }

  const clearRecentSearches = () => {
    localStorage.removeItem('recent-searches')
    setRecentSearches([])
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
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-foreground">Recent Searches</h1>
          {recentSearches.length > 0 && (
            <button
              onClick={clearRecentSearches}
              className="text-accent hover:underline text-sm"
            >
              Clear All
            </button>
          )}
        </div>

        <div className="space-y-2">
          {recentSearches.map((search, index) => (
            <Link
              key={index}
              href={`/search/posts?q=${encodeURIComponent(search.query)}`}
              className="flex items-center justify-between p-4 bg-surface rounded-lg hover:bg-surface/80"
            >
              <div className="flex items-center gap-3">
                <span className="text-foreground/50">🔍</span>
                <span className="text-foreground">{search.query}</span>
                <span className="text-sm text-foreground/50">{search.type}</span>
              </div>
              <span className="text-foreground/50">{search.timestamp}</span>
            </Link>
          ))}
        </div>

        {recentSearches.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No recent searches
          </div>
        )}
      </div>
    </div>
  )
}

