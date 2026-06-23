'use client'

import { usePathname } from 'next/navigation'
import Navbar from '@/components/Navbar'
import LandingNavbar from '@/components/LandingNavbar'
import { useAuthStore } from '@/store/authStore'

const publicPages = ['/pricing', '/terms', '/privacy-policy']

export default function ConditionalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const { isAuthenticated, isInitialized } = useAuthStore()

  const isAuthPage =
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname?.startsWith('/auth/')

  const isLandingPage = pathname === '/'
  const isPublicPage = publicPages.includes(pathname || '')

  if (isAuthPage) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        {children}
      </div>
    )
  }

  if (isLandingPage) {
    return (
      <div className="min-h-screen w-full bg-background">
        {children}
      </div>
    )
  }

  // Public pages: show LandingNavbar for unauthenticated users
  if (isPublicPage && isInitialized && !isAuthenticated) {
    return (
      <div className="flex min-h-screen w-full flex-col bg-background">
        <LandingNavbar />
        <main className="flex-1 w-full pt-16">
          {children}
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <Navbar />
      <main className="flex-1 w-full">
        {children}
      </main>
    </div>
  )
}
