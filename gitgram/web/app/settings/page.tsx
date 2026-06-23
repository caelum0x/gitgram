'use client'
import Link from 'next/link'
import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const router = useRouter()
  const { isAuthenticated, logout } = useAuthStore()
  useEffect(() => {
    if (!isAuthenticated) router.replace('/login')
  }, [isAuthenticated, router])

  if (!isAuthenticated) return null

  const handleLogout = async () => {
    await logout()
    router.push('/')
  }

  const sections = [
    { title: 'Account', href: '/settings/account', icon: '👤', desc: 'Name, email, username, password' },
    { title: 'Privacy', href: '/settings/privacy', icon: '🔒', desc: 'Visibility, DMs, data export, 2FA' },
    { title: 'Notifications', href: '/settings/notifications', icon: '🔔', desc: 'Push, email, quiet hours' },
    { title: 'Appearance', href: '/settings/appearance', icon: '🎨', desc: 'Theme, font size, language, density' },
    { title: 'Security', href: '/settings/security', icon: '🛡️', desc: 'Sessions, login history, 2FA' },
    { title: 'Blocked Users', href: '/settings/blocked', icon: '🚫', desc: 'Manage blocked accounts' },
    { title: 'Language', href: '/settings/language', icon: '🌐', desc: 'Display language and region' },
    { title: 'Data & Storage', href: '/settings/data', icon: '💾', desc: 'Cache, downloads, data export' },
    { title: 'Subscription', href: '/settings/subscription', icon: '⭐', desc: 'Plan, billing, premium features' },
    { title: 'Preferences', href: '/settings/preferences', icon: '⚙️', desc: 'Accessibility, autoplay, content' },
  ]

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">Settings</h1>
      <div className="space-y-2">
        {sections.map(s => (
          <Link key={s.href} href={s.href} className="flex items-center gap-4 p-4 bg-card border border-border rounded-lg hover:bg-muted/50 transition-colors">
            <span className="text-2xl w-9 text-center flex-shrink-0">{s.icon}</span>
            <div className="min-w-0">
              <span className="block font-semibold text-foreground">{s.title}</span>
              <span className="block text-sm text-foreground/50 truncate">{s.desc}</span>
            </div>
            <span className="ml-auto text-foreground/30 flex-shrink-0">&#8250;</span>
          </Link>
        ))}
      </div>

      <div className="mt-8 pt-8 border-t border-border">
        <button
          onClick={handleLogout}
          className="w-full py-3 bg-error text-white rounded-lg hover:bg-error/90 font-semibold"
        >
          Log Out
        </button>
      </div>
    </div>
  )
}
