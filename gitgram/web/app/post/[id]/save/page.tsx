'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import api from '@/services/api'

export default function SavePostPage() {
  const params = useParams()
  const router = useRouter()
  const postId = params.id as string
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    handleSave()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await api.post(`/v1/posts/${postId}/save`)
      setSaved(response.data?.saved ?? true)
      setTimeout(() => {
        router.back()
      }, 1000)
    } catch (error) {
      console.error('Save post error:', error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        {saving ? (
          <div className="text-foreground">Saving...</div>
        ) : saved ? (
          <div>
            <p className="text-foreground mb-4">Post saved!</p>
            <p className="text-foreground/50">Redirecting...</p>
          </div>
        ) : (
          <div>
            <p className="text-foreground mb-4">Post unsaved</p>
            <p className="text-foreground/50">Redirecting...</p>
          </div>
        )}
      </div>
    </div>
  )
}
