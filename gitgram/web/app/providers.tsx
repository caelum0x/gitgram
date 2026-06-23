'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { ToastProvider } from '@/components/ui/toast'
import { useAuthStore } from '@/store/authStore'

function AuthBootstrap() {
  const initialize = useAuthStore((state) => state.initialize)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    initialize()
  }, [initialize])

  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthBootstrap />
        {children}
      </ToastProvider>
    </QueryClientProvider>
  )
}
