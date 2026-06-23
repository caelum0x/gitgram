'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuthStore } from '@/store/authStore'
import { userService } from '@/services/userService'
import { getErrorMessage } from '@/utils/error'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'

export default function SwitchAccountPage() {
  const { user, setUser } = useAuthStore()
  const router = useRouter()
  const { showToast } = useToast()
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState<string | null>(null)

  useEffect(() => {
    loadAccounts()
  }, [])

  const loadAccounts = async () => {
    try {
      const response = await userService.getLinkedAccounts()
      setAccounts(response.accounts || [])
    } catch (error) {
      console.error('Load accounts error:', error)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Switch Account</h1>
        <div className="space-y-2">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between p-4 bg-surface rounded-lg"
            >
              <Link
                href={`/profile/${account.id}`}
                className="flex items-center gap-4 flex-1 hover:opacity-80"
              >
                {account.avatar ? (
                  <Image
                    src={account.avatar}
                    alt={account.username}
                    width={50}
                    height={50}
                    className="rounded-full"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center">
                    <span className="text-white font-semibold">
                      {account.username[0].toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-semibold text-foreground">@{account.username}</p>
                  {account.isPrimary && (
                    <p className="text-sm text-foreground/50">Primary account</p>
                  )}
                </div>
              </Link>
              <div className="flex gap-2">
                {!account.isPrimary && (
                  <button
                    onClick={async () => {
                      try {
                        setSwitching(account.id)
                        const result = await userService.switchAccount(account.id)
                        // Update auth store with new account
                        if (result.account) {
                          setUser(result.account)
                          router.push('/feed')
                        }
                      } catch (error: unknown) {
                        showToast(getErrorMessage(error), 'error')
                      } finally {
                        setSwitching(null)
                      }
                    }}
                    disabled={switching === account.id}
                    className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                  >
                    {switching === account.id ? 'Switching...' : 'Switch'}
                  </button>
                )}
                <button
                  onClick={async () => {
                    if (!confirm('Unlink this account?')) return
                    try {
                      await userService.unlinkAccount(account.id)
                      loadAccounts()
                    } catch (error: unknown) {
                      showToast(getErrorMessage(error), 'error')
                    }
                  }}
                  className="px-4 py-2 bg-error text-white rounded-lg text-sm font-semibold hover:opacity-90"
                >
                  Unlink
                </button>
              </div>
            </div>
          ))}
        </div>
        {accounts.length === 0 && (
          <div className="text-center py-12">
            <p className="text-foreground/70 mb-4">
              No linked accounts
            </p>
            <p className="text-sm text-foreground/50 mb-4">
              Link another account to switch between them
            </p>
            <button
              onClick={() => router.push('/profile/settings/switch/link')}
              className="px-4 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90"
            >
              Link Account
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

