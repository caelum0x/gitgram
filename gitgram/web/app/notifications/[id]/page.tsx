'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { notificationService } from '@/services/notificationService'

export default function NotificationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const notificationId = params.id as string
  const [notification, setNotification] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadNotification()
    markAsRead()
  }, [notificationId])

  const loadNotification = async () => {
    try {
      const response = await notificationService.getNotification(notificationId)
      setNotification(response.notification || response)
    } catch (error) {
      console.error('Load notification error:', error)
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async () => {
    try {
      await notificationService.markAsRead([notificationId])
    } catch (error) {
      console.error('Mark as read error:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground">Loading...</div>
      </div>
    )
  }

  if (!notification) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground">Notification not found</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="bg-surface rounded-lg p-6">
          <h1 className="text-2xl font-bold text-foreground mb-4">
            {notification.title || 'Notification'}
          </h1>
          <p className="text-foreground mb-4">
            {notification.body || notification.content || 'No message available.'}
          </p>
          <p className="text-sm text-foreground/50">
            {new Date(notification.createdAt).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  )
}
