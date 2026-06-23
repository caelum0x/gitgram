'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useAuthStore } from '@/store/authStore'
import { authService } from '@/services/authService'
import { PasswordStrength } from '@/components/ui/password-strength'
import { useToast } from '@/components/ui/toast'
import { Confetti } from '@/components/ui/confetti'
import { getErrorMessage } from '@/utils/error'

export default function RegisterPage() {
  const router = useRouter()
  const { register } = useAuthStore()
  const { showToast } = useToast()
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      showToast('Passwords do not match', 'error')
      setLoading(false)
      return
    }

    try {
      await register({
        username: formData.username,
        email: formData.email,
        password: formData.password
      })
      setShowConfetti(true)
      showToast('Welcome to Gitgram! 🎉', 'success')
      setTimeout(() => router.push('/onboarding/welcome'), 2000)
    } catch (err: unknown) {
      const errorMsg = getErrorMessage(err)
      setError(errorMsg)
      showToast(errorMsg, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleGitHubLogin = () => {
    const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
    const redirectUri = `${window.location.origin}/auth/github/callback`
    if (clientId) {
      window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=user:email,repo`
    } else {
      showToast('GitHub OAuth not configured', 'error')
    }
  }

  return (
    <>
      {showConfetti && <Confetti />}
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full"
      >
        {/* Header */}
        <div className="mb-8">
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 mb-4"
          >
            <svg className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </motion.div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Create account</h1>
          <p className="text-foreground-secondary">Join the developer community</p>
        </div>

        {/* Form Card */}
        <div className="bg-surface/50 backdrop-blur-xl border border-border/50 rounded-2xl p-8 shadow-2xl">
          {/* GitHub OAuth */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleGitHubLogin}
            type="button"
            className="w-full flex items-center justify-center gap-3 h-12 rounded-xl bg-foreground text-background font-semibold hover:bg-foreground/90 transition-all shadow-lg"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0.5C5.37 0.5 0 5.87 0 12.5C0 17.93 3.59 22.53 8.53 24C9.13 24.1 9.32 23.73 9.32 23.41C9.32 23.12 9.31 22.13 9.31 21.08C5.97 21.84 5.23 19.58 5.23 19.58C4.69 18.23 3.86 17.85 3.86 17.85C2.79 17.11 3.94 17.13 3.94 17.13C5.12 17.21 5.79 18.28 5.79 18.28C6.84 20.08 8.57 19.58 9.21 19.29C9.31 18.53 9.61 18.02 9.93 17.73C7.23 17.43 4.42 16.36 4.42 11.63C4.42 10.27 4.93 9.17 5.73 8.35C5.61 8.05 5.23 6.95 5.85 5.23C5.85 5.23 6.84 4.91 9.27 6.55C10.22 6.29 11.23 6.16 12.24 6.15C13.25 6.16 14.26 6.29 15.21 6.55C17.64 4.91 18.63 5.23 18.63 5.23C19.27 6.95 18.89 8.05 18.76 8.35C19.57 9.17 20.08 10.27 20.08 11.63C20.08 16.37 17.26 17.43 14.56 17.73C14.96 18.09 15.31 18.81 15.31 19.95C15.31 21.57 15.29 22.87 15.29 23.23C15.29 23.55 15.48 23.93 16.09 23.82C21.01 22.33 24.48 17.73 24.48 12.5C24.48 5.87 19.11 0.5 12.5 0.5H12Z" />
            </svg>
            Continue with GitHub
          </motion.button>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/50" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 bg-surface text-foreground-secondary">or</span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-error/10 border border-error/30 text-error px-4 py-3 rounded-xl text-sm flex items-center gap-2"
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </motion.div>
            )}

            {/* Username Input */}
            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium text-foreground">Username</label>
              <input
                id="username"
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
                autoComplete="username"
                className="w-full h-12 px-4 rounded-xl bg-background border border-border text-foreground placeholder:text-foreground-secondary/40 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                placeholder="johndoe"
              />
            </div>

            {/* Email Input */}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">Email address</label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                autoComplete="email"
                className="w-full h-12 px-4 rounded-xl bg-background border border-border text-foreground placeholder:text-foreground-secondary/40 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                placeholder="you@example.com"
              />
            </div>

            {/* Password Input */}
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  autoComplete="new-password"
                  className="w-full h-12 px-4 pr-12 rounded-xl bg-background border border-border text-foreground placeholder:text-foreground-secondary/40 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground-secondary hover:text-foreground transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {showPassword ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    )}
                  </svg>
                </button>
              </div>
              <PasswordStrength password={formData.password} />
            </div>

            {/* Confirm Password Input */}
            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">Confirm password</label>
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                required
                autoComplete="new-password"
                className="w-full h-12 px-4 rounded-xl bg-background border border-border text-foreground placeholder:text-foreground-secondary/40 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                placeholder="••••••••"
              />
            </div>

            {/* Submit Button */}
            <motion.button
              whileHover={{ scale: loading ? 1 : 1.01 }}
              whileTap={{ scale: loading ? 1 : 0.99 }}
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-accent to-accent-hover text-white font-semibold hover:shadow-lg hover:shadow-accent/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating account...
                </span>
              ) : 'Create account'}
            </motion.button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center text-sm text-foreground-secondary">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-primary hover:text-primary-hover transition-colors">
              Sign in
            </Link>
          </div>
        </div>

        {/* Terms */}
        <p className="mt-6 text-center text-xs text-foreground-secondary/60">
          By continuing, you agree to our{' '}
          <Link href="/terms" className="underline hover:text-foreground-secondary">Terms</Link>
          {' '}and{' '}
          <Link href="/privacy" className="underline hover:text-foreground-secondary">Privacy Policy</Link>
        </p>
      </motion.div>
    </>
  )
}
