'use client'

export const dynamic = 'force-dynamic'
import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'
import { useToast } from '@/components/ui/toast'

function GoogleCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { showToast } = useToast()

  useEffect(() => {
    const code = searchParams.get('code')
    if (!code) {
      showToast('Google authentication failed', 'error')
      router.push('/login')
      return
    }

    api.post('/auth/google', { code })
      .then(({ data }) => {
        // Token is set as httpOnly cookie by the backend
        if (data.user) {
          localStorage.setItem('user', JSON.stringify(data.user))
        }
        useAuthStore.setState({ user: data.user, isAuthenticated: true })
        showToast('Connected with Google!', 'success')

        if (!data.user.username || data.isNewUser) {
          router.push('/onboarding/welcome')
        } else {
          router.push('/feed')
        }
      })
      .catch(() => {
        showToast('Google authentication failed', 'error')
        router.push('/login')
      })
  }, [searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4">🔄</div>
        <p className="text-xl font-semibold">Connecting with Google...</p>
      </div>
    </div>
  )
}

export default function GoogleCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <GoogleCallbackContent />
    </Suspense>
  )
}
