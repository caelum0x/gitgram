'use client'

import { useEffect, useState } from 'react'
import { linkPreviewService, type LinkPreview } from '@/services/linkPreviewService'

interface LinkCardProps {
  url: string
  className?: string
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * Renders a rich preview card (title / description / image / domain) for an
 * external URL by fetching unfurl metadata from the backend `/v1/link-preview`
 * proxy. Shows a skeleton while loading and silently falls back to a plain
 * clickable link if no preview is available.
 */
export default function LinkCard({ url, className = '' }: LinkCardProps) {
  const [preview, setPreview] = useState<LinkPreview | null>(null)
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading')
  const [imageBroken, setImageBroken] = useState(false)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setImageBroken(false)

    linkPreviewService
      .getPreview(url)
      .then((result) => {
        if (cancelled) return
        if (result && (result.title || result.description || result.image)) {
          setPreview(result)
          setStatus('loaded')
        } else {
          setStatus('failed')
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('failed')
      })

    return () => {
      cancelled = true
    }
  }, [url])

  const domain = getDomain(url)

  if (status === 'loading') {
    return (
      <div
        className={`flex animate-pulse overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] ${className}`}
        aria-hidden="true"
      >
        <div className="h-24 w-24 shrink-0 bg-[var(--surface-secondary)]" />
        <div className="flex flex-1 flex-col justify-center gap-2 p-3">
          <div className="h-3 w-1/3 rounded bg-[var(--surface-secondary)]" />
          <div className="h-3 w-3/4 rounded bg-[var(--surface-secondary)]" />
          <div className="h-3 w-2/3 rounded bg-[var(--surface-secondary)]" />
        </div>
      </div>
    )
  }

  // No metadata available — degrade to a plain, safe external link.
  if (status === 'failed' || !preview) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow ugc"
        onClick={(e) => e.stopPropagation()}
        className={`inline-flex max-w-full items-center gap-1.5 truncate text-sm text-[var(--primary)] hover:underline ${className}`}
      >
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 11-5.656-5.656l1.5-1.5m6.656-1.328a4 4 0 010-5.656l3-3a4 4 0 115.656 5.656l-1.5 1.5" />
        </svg>
        <span className="truncate">{url}</span>
      </a>
    )
  }

  const showImage = Boolean(preview.image) && !imageBroken

  return (
    <a
      href={preview.url || url}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      onClick={(e) => e.stopPropagation()}
      className={`group flex overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] transition-colors hover:border-[var(--primary)] ${className}`}
    >
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview.image as string}
          alt=""
          loading="lazy"
          onError={() => setImageBroken(true)}
          className="h-auto w-28 shrink-0 self-stretch object-cover sm:w-36"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-3">
        <span className="flex items-center gap-1.5 text-xs text-[var(--foreground-secondary)]">
          {preview.favicon && !imageBroken && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.favicon} alt="" className="h-3.5 w-3.5 rounded-sm" loading="lazy" />
          )}
          <span className="truncate">{preview.siteName || domain}</span>
        </span>
        {preview.title && (
          <span className="line-clamp-2 text-sm font-semibold text-[var(--foreground)] group-hover:text-[var(--primary)]">
            {preview.title}
          </span>
        )}
        {preview.description && (
          <span className="line-clamp-2 text-xs text-[var(--foreground-secondary)]">
            {preview.description}
          </span>
        )}
      </div>
    </a>
  )
}
