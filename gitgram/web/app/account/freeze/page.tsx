'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'

export default function FreezeAccountPage() {
  const router = useRouter()
  const [freezing, setFreezing] = useState(false)

  const handleFreeze = async () => {
    if (!confirm('Are you sure you want to freeze your account? You can unfreeze it later.')) {
      return
    }

    setFreezing(true)
    try {
      await api.post('/v1/settings/account/freeze')
      router.push('/settings/account')
    } catch (error) {
      console.error('Freeze account error:', error)
    } finally {
      setFreezing(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-4">Freeze Account</h1>
        <div className="bg-surface rounded-lg p-6 mb-6">
          <p className="text-foreground mb-4">
            Freezing your account will temporarily hide your profile and content from other users.
          </p>
          <p className="text-foreground/70">
            You can unfreeze your account at any time. Your data will be preserved.
          </p>
        </div>

        <button
          onClick={handleFreeze}
          disabled={freezing}
          className="px-6 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {freezing ? 'Freezing...' : 'Freeze Account'}
        </button>
      </div>
    </div>
  )
}

