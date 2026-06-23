'use client'

import { lazy, Suspense, ComponentType } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

interface LazyLoadOptions {
  fallback?: React.ReactNode
  delay?: number
}

// Create a lazy-loaded component with built-in suspense
export function lazyLoad<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  options?: LazyLoadOptions
) {
  const LazyComponent = lazy(importFn)

  return function LazyWrapper(props: React.ComponentProps<T>) {
    const fallback = options?.fallback ?? (
      <div className="flex items-center justify-center p-8">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )

    return (
      <Suspense fallback={fallback}>
        <LazyComponent {...props} />
      </Suspense>
    )
  }
}

// Common fallback components
export function PageLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted text-sm">Loading...</p>
      </div>
    </div>
  )
}

export function ComponentLoadingFallback() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export function FeedLoadingFallback() {
  return (
    <div className="space-y-4 p-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton variant="circular" className="w-10 h-10" />
            <div className="space-y-2">
              <Skeleton className="w-32 h-3" />
              <Skeleton className="w-24 h-2" />
            </div>
          </div>
          <Skeleton className="w-full h-3" />
          <Skeleton className="w-3/4 h-3" />
          <Skeleton className="w-full h-48 rounded-lg" />
        </div>
      ))}
    </div>
  )
}

// Intersection observer based lazy loading for images
export function LazyImage({
  src,
  alt,
  className = '',
  placeholder,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement> & {
  placeholder?: string
}) {
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      {...props}
    />
  )
}

// Preload critical images
export function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = reject
    img.src = src
  })
}

// Preload multiple images
export function preloadImages(srcs: string[]): Promise<void[]> {
  return Promise.all(srcs.map(preloadImage))
}
