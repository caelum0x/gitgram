'use client'
import { useAuthStore } from '@/store/authStore'
import { useRouter } from 'next/navigation'
import { ReactNode } from 'react'

interface PageTemplateProps {
  title: string
  children: ReactNode
  requireAuth?: boolean
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
}

export function PageTemplate({ title, children, requireAuth = true, maxWidth = 'lg' }: PageTemplateProps) {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()

  if (requireAuth && !isAuthenticated) {
    router.push('/login')
    return null
  }

  const widthClass = {
    sm: 'max-w-2xl',
    md: 'max-w-4xl',
    lg: 'max-w-6xl',
    xl: 'max-w-7xl',
    full: 'max-w-full'
  }[maxWidth]

  return (
    <div className={`${widthClass} mx-auto py-8 px-4`}>
      <h1 className="text-3xl font-bold mb-8">{title}</h1>
      {children}
    </div>
  )
}
