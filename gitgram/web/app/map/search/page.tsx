'use client'

import { useState } from 'react'
import Link from 'next/link'
import api from '@/services/api'

export default function MapSearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    try {
      const response = await api.get('/v1/location/search', {
        params: { q: query },
      })
      setResults(response.data.locations || [])
    } catch (error) {
      console.error('Search locations error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Search Locations</h1>

        <form onSubmit={handleSearch} className="mb-6">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a location..."
            className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </form>

        {loading ? (
          <div className="text-center py-12 text-foreground/70">Loading...</div>
        ) : (
          <div className="space-y-2">
            {results.map((location) => (
              <Link
                key={location.name}
                href={`/location/${encodeURIComponent(location.name)}`}
                className="block p-4 bg-surface rounded-lg hover:bg-surface/80"
              >
                <p className="font-semibold text-foreground">📍 {location.name}</p>
                <p className="text-sm text-foreground/70">
                  {location.postsCount || 0} posts
                </p>
              </Link>
            ))}
            {results.length === 0 && query && (
              <div className="text-center py-12 text-foreground/70">
                No locations found
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

