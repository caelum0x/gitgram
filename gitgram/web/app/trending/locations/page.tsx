'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import api from '@/services/api'

export default function TrendingLocationsPage() {
  const [locations, setLocations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadLocations()
  }, [])

  const loadLocations = async () => {
    try {
      const response = await api.get('/v1/location/trending')
      setLocations(response.data.locations || [])
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
          {locations.map((location, index) => (
            <Link
              key={location.name}
              href={`/location/${encodeURIComponent(location.name)}`}
              className="flex items-center justify-between p-4 bg-surface rounded-lg hover:bg-surface/80"
            >
              <div className="flex items-center gap-4">
                <span className="text-2xl font-bold text-foreground/50">#{index + 1}</span>
                <div>
                  <p className="font-semibold text-foreground">📍 {location.name}</p>
                  <p className="text-sm text-foreground/70">
                    {location.postsCount || 0} posts
                  </p>
                </div>
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

