'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import api from '@/services/api'
import { useAuthStore } from '@/store/authStore'

export default function ProfileActivityPage() {
  const { user } = useAuthStore()
  const [activities, setActivities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      loadActivities()
    }
  }, [user])

  const loadActivities = async () => {
    try {
      const response = await api.get('/v1/users/me/activity')
      setActivities(response.data.activities || [])
    } catch (error) {
      console.error('Load activities error:', error)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Activity</h1>
        <div className="space-y-4">
          {activities.map((activity) => (
            <div key={activity.id} className="p-4 bg-surface rounded-lg">
              <p className="text-foreground">{activity.description}</p>
              <p className="text-sm text-foreground/50 mt-2">
                {new Date(activity.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
        {activities.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No activity yet
          </div>
        )}
      </div>
    </div>
  )
}

