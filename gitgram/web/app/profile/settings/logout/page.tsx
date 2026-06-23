'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { authService } from '@/services/authService'

export default function LogoutPage() {
  const router = useRouter()
  const { logout } = useAuthStore()
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await authService.logout()
      await logout()
      router.push('/login')
    } catch (error) {
      console.error('Logout error:', error)
      await logout()
      router.push('/login')
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Logout</h1>
        <div className="bg-surface rounded-lg p-6 mb-6">
          <p className="text-foreground mb-4">
            Are you sure you want to log out?
          </p>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full px-6 py-2 bg-red-500 text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {loggingOut ? 'Logging out...' : 'Logout'}
          </button>
        </div>
      </div>
    </div>
  )
}

