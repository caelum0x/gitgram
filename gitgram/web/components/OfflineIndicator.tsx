'use client'

import { useState, useEffect } from 'react'

interface OfflineIndicatorProps {
  className?: string
}

export default function OfflineIndicator({ className = '' }: OfflineIndicatorProps) {
  const [isOffline, setIsOffline] = useState(false)
  const [showRetry, setShowRetry] = useState(false)

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false)
      setShowRetry(false)
    }

    const handleOffline = () => {
      setIsOffline(true)
      // Show retry button after 5 seconds
      setTimeout(() => setShowRetry(true), 5000)
    }

    // Check initial state
    if (!navigator.onLine) {
      setIsOffline(true)
      setShowRetry(true)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!isOffline) return null

  const handleRetry = () => {
    // Try to refresh the page
    window.location.reload()
  }

  return (
    <div
      className={`fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-warning/10 border border-warning text-warning-foreground rounded-lg p-4 shadow-lg z-50 ${className}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-3">
        <svg
          className="w-5 h-5 flex-shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
          />
        </svg>
        <div className="flex-1">
          <h3 className="font-semibold text-sm">You're offline</h3>
          <p className="text-xs mt-1 opacity-80">
            Some features may be limited. We'll reconnect automatically when you're back online.
          </p>
          {showRetry && (
            <button
              onClick={handleRetry}
              className="mt-2 text-xs font-medium underline hover:no-underline"
            >
              Retry now
            </button>
          )}
        </div>
        <button
          onClick={() => setIsOffline(false)}
          className="p-1 hover:bg-warning/20 rounded"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// Hook for checking online status
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    setIsOnline(navigator.onLine)

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}

// Offline fallback component
export function OfflineFallback({
  children,
  fallback,
}: {
  children: React.ReactNode
  fallback?: React.ReactNode
}) {
  const isOnline = useOnlineStatus()

  if (!isOnline && fallback) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
