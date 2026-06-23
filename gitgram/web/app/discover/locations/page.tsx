'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { locationService } from '@/services/locationService'

export default function DiscoverLocationsPage() {
  const [locations, setLocations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadLocations()
  }, [])

  const loadLocations = async () => {
    try {
      const response = await locationService.getTrendingLocations(50)
      setLocations(response.locations || [])
    } catch (error) {
      console.error('Load locations error:', error)
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
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Trending Locations</h1>
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
        </div>
        {locations.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No trending locations yet
          </div>
        )}
      </div>
    </div>
  )
}

