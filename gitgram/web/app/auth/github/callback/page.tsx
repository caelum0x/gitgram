'use client'

export const dynamic = 'force-dynamic'
import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'
import { useToast } from '@/components/ui/toast'
import { githubService } from '@/services/githubService'

function GitHubCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { showToast } = useToast()

  useEffect(() => {
    const code = searchParams.get('code')
    if (!code) {
      showToast('GitHub authentication failed', 'error')
      router.push('/login')
      return
    }

    api.post('/auth/github', { code })
      .then(async ({ data }) => {
        // Token is set as httpOnly cookie by the backend
        if (data.user) {
          localStorage.setItem('user', JSON.stringify(data.user))
        }
        useAuthStore.setState({ user: data.user, isAuthenticated: true })
        showToast('Connected with GitHub!', 'success')

        // Auto-sync GitHub repos in the background
        try {
          await githubService.syncProjects()
        } catch {
          // Non-blocking — sync can fail silently on first login
        }

        // If this is a new user (no username set yet), go to onboarding
        if (!data.user.username || data.isNewUser) {
          router.push('/onboarding/welcome')
        } else {
          router.push('/feed')
        }
      })
      .catch(() => {
        showToast('GitHub authentication failed', 'error')
        router.push('/login')
      })
  }, [searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4">🔄</div>
        <p className="text-xl font-semibold">Connecting with GitHub...</p>
      </div>
    </div>
  )
}

export default function GitHubCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <GitHubCallbackContent />
    </Suspense>
  )
}
