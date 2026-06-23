'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import api from '@/services/api'

export default function FeedbackDetailPage() {
  const params = useParams()
  const feedbackId = params.id as string
  const [feedback, setFeedback] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFeedback()
  }, [feedbackId])

  const loadFeedback = async () => {
    try {
      const response = await api.get(`/v1/feedback/${feedbackId}`)
      setFeedback(response.data.feedback || response.data)
    } catch (error) {
      console.error('Load feedback error:', error)
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

  if (!feedback) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground">Feedback not found</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="bg-surface rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-foreground">
              {feedback.subject || feedback.type}
            </h1>
            <span className={`text-xs px-2 py-1 rounded ${
              feedback.status === 'resolved' ? 'bg-green-500/20 text-green-500' :
              feedback.status === 'pending' ? 'bg-yellow-500/20 text-yellow-500' :
              'bg-gray-500/20 text-gray-500'
            }`}>
              {feedback.status || 'pending'}
            </span>
          </div>
          <p className="text-foreground mb-4">{feedback.message || feedback.body}</p>
          <p className="text-sm text-foreground/50">
            Submitted: {new Date(feedback.createdAt).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  )
}
