'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import api from '@/services/api'

const MapView = dynamic(() => import('react-map-gl/mapbox'), { ssr: false }) as any

export default function MapExplorePage() {
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [viewState, setViewState] = useState({
    longitude: -122.4,
    latitude: 37.8,
    zoom: 10,
  })

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      // Get user's location or use default
      const latitude = viewState.latitude
      const longitude = viewState.longitude
      const response = await api.get('/v1/location/projects/nearby', {
        params: { latitude, longitude, radiusKm: 10 },
      })
      setProjects(response.data.projects || [])
    } catch (error) {
      console.error('Load projects error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="h-screen relative">
        {typeof window !== 'undefined' && (
          <MapView
            {...viewState}
            onMove={(evt: any) => setViewState(evt.viewState)}
            mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''}
            style={{ width: '100%', height: '100%' }}
            mapStyle="mapbox://styles/mapbox/dark-v10"
          >
            {projects.map((project) => (
              project.latitude && project.longitude && (
                <div key={project.id}>
                  {/* Marker would go here */}
                </div>
              )
            ))}
          </MapView>
        )}
      </div>
    </div>
  )
}

