'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'

const MapView = dynamic(() => import('react-map-gl/mapbox'), { ssr: false }) as any

export default function MapPickerPage() {
  const router = useRouter()
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)

  const handleSelect = () => {
    if (location) {
      // Pass location back or save it
      router.back()
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="h-screen relative">
        {typeof window !== 'undefined' && (
          <MapView
            latitude={location?.lat || 37.8}
            longitude={location?.lng || -122.4}
            zoom={10}
            onMove={(evt: any) => setLocation({ lat: evt.viewState.latitude, lng: evt.viewState.longitude })}
            mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''}
            style={{ width: '100%', height: '100%' }}
            mapStyle="mapbox://styles/mapbox/dark-v10"
          />
        )}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
          <button
            onClick={handleSelect}
            className="px-6 py-3 bg-accent text-white rounded-lg font-semibold hover:opacity-90"
          >
            Select Location
          </button>
        </div>
      </div>
    </div>
  )
}

