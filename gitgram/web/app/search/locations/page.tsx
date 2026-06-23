'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import api from '@/services/api'

export default function SearchLocationsPage() {
  const searchParams = useSearchParams()
  const query = searchParams.get('q') || ''
  const [locations, setLocations] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (query) {
      searchLocations()
    }
  }, [query])

  const searchLocations = async () => {
    setLoading(true)
    try {
      const response = await api.get('/v1/location/search', {
        params: { q: query },
      })
      setLocations(response.data.locations || [])
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
        {loading ? (
          <div className="text-center py-12 text-foreground/70">Loading...</div>
        ) : (
          <div className="space-y-2">
            {locations.map((location) => (
              <Link
                key={location.name}
                href={`/location/${encodeURIComponent(location.name)}`}
                className="flex items-center justify-between p-4 bg-surface rounded-lg hover:bg-surface/80"
              >
                <div>
                  <p className="font-semibold text-foreground">📍 {location.name}</p>
                  <p className="text-sm text-foreground/70">
                    {location.postsCount || 0} posts
                  </p>
                </div>
                <span className="text-accent">→</span>
              </Link>
            ))}
            {locations.length === 0 && query && (
              <div className="text-center py-12 text-foreground/70">
                No locations found for "{query}"
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

