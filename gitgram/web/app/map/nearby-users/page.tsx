'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import api from '@/services/api'

export default function NearbyUsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          })
          loadUsers()
        },
        () => {
          setLoading(false)
        }
      )
    } else {
      setLoading(false)
    }
  }, [])

  const loadUsers = async () => {
    if (!location) return

    try {
      const response = await api.get('/v1/location/users/nearby', {
        params: { latitude: location.lat, longitude: location.lng, radiusKm: 10 },
      })
      setUsers(response.data.users || [])
    } catch (error) {
      console.error('Load users error:', error)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Nearby Users</h1>
        <div className="space-y-2">
          {users.map((user) => (
            <Link
              key={user.id}
              href={`/profile/${user.id}`}
              className="flex items-center gap-4 p-4 bg-surface rounded-lg hover:bg-surface/80"
            >
              {user.avatar ? (
                <Image
                  src={user.avatar}
                  alt={user.username}
                  width={50}
                  height={50}
                  className="rounded-full"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center">
                  <span className="text-white font-semibold">
                    {user.username[0].toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex-1">
                <p className="font-semibold text-foreground">@{user.username}</p>
                {user.distance && (
                  <p className="text-sm text-foreground/70">
                    {user.distance.toFixed(1)} km away
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
        {users.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No nearby users
          </div>
        )}
      </div>
    </div>
  )
}

