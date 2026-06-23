'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'
import { useToast } from '@/components/ui/toast'

export default function TwoFactorSetupPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const [step, setStep] = useState<'setup' | 'verify'>('setup')
  const [qrCode, setQrCode] = useState<string>('')
  const [secret, setSecret] = useState<string>('')
  const [code, setCode] = useState('')
  const [settingUp, setSettingUp] = useState(false)
  const [verifying, setVerifying] = useState(false)

  const handleSetup = async () => {
    setSettingUp(true)
    try {
      const response = await api.post('/v1/settings/account/2fa/setup')
      setQrCode(response.data.qrCode)
      setSecret(response.data.secret)
      setStep('verify')
    } catch (error) {
      console.error('Setup 2FA error:', error)
      showToast('Failed to setup 2FA', 'error')
    } finally {
      setSettingUp(false)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code) return

    setVerifying(true)
    try {
      await api.post('/v1/settings/account/2fa/verify', { code, secret })
      router.push('/account/security')
    } catch (error) {
      console.error('Verify 2FA error:', error)
      showToast('Invalid code', 'error')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Two-Factor Authentication</h1>

        {step === 'setup' ? (
          <div className="space-y-6">
            <div className="bg-surface rounded-lg p-6">
              <p className="text-foreground mb-4">
                Two-factor authentication adds an extra layer of security to your account.
              </p>
              <button
                onClick={handleSetup}
                disabled={settingUp}
                className="px-6 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {settingUp ? 'Setting up...' : 'Enable 2FA'}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleVerify} className="space-y-6">
            <div className="bg-surface rounded-lg p-6">
              <p className="text-foreground mb-4">
                Scan this QR code with your authenticator app:
              </p>
              {qrCode && (
                <div className="mb-4">
                  <img src={qrCode} alt="QR Code" className="mx-auto" />
                </div>
              )}
              {secret && (
                <div className="mb-4">
                  <p className="text-sm text-foreground/70 mb-2">Or enter this code manually:</p>
                  <code className="block p-2 bg-background rounded text-foreground">{secret}</code>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Enter verification code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                maxLength={6}
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="000000"
              />
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                disabled={verifying || !code}
                className="px-6 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {verifying ? 'Verifying...' : 'Verify & Enable'}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="px-6 py-2 bg-surface border border-border rounded-lg text-foreground hover:bg-surface/80"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

