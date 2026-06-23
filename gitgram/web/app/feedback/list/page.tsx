'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import api from '@/services/api'

export default function FeedbackListPage() {
  const [feedbacks, setFeedbacks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFeedbacks()
  }, [])

  const loadFeedbacks = async () => {
    try {
      const response = await api.get('/v1/feedback')
      setFeedbacks(response.data.feedbacks || response.data || [])
    } catch (error) {
      console.error('Load feedbacks error:', error)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">My Feedback</h1>
        <div className="space-y-4">
          {feedbacks.map((feedback) => (
            <Link
              key={feedback.id}
              href={`/feedback/${feedback.id}`}
              className="block p-4 bg-surface rounded-lg hover:bg-surface/80"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-foreground">{feedback.subject || feedback.type}</p>
                <span className={`text-xs px-2 py-1 rounded ${
                  feedback.status === 'resolved' ? 'bg-green-500/20 text-green-500' :
                  feedback.status === 'pending' ? 'bg-yellow-500/20 text-yellow-500' :
                  'bg-gray-500/20 text-gray-500'
                }`}>
                  {feedback.status || 'pending'}
                </span>
              </div>
              <p className="text-sm text-foreground/70 line-clamp-2">
                {feedback.message || feedback.body}
              </p>
              <p className="text-xs text-foreground/50 mt-2">
                {new Date(feedback.createdAt).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
        {feedbacks.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No feedback submitted yet
          </div>
        )}
      </div>
    </div>
  )
}
