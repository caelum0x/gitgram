'use client'

import { useEffect, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { toast } from 'react-hot-toast'
import { EmbedModal } from './EmbedModal'

interface ShareMenuProps {
  url: string
  title: string
  description?: string
  postId?: string
}

type ShareItem = {
  id: string
  label: string
  icon: React.ReactNode
  onClick: () => void
  dividerBefore?: boolean
}

/** Build a filesystem-safe filename from arbitrary text. */
function toFileSlug(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return slug || 'gitgram-share'
}

export function ShareMenu({ url, title, description, postId }: ShareMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [embedOpen, setEmbedOpen] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const captureRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = url
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleShareTwitter = () => {
    const encodedUrl = encodeURIComponent(url)
    const encodedText = encodeURIComponent(title)
    const twitterUrl = `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`
    window.open(twitterUrl, '_blank', 'noopener,noreferrer,width=600,height=400')
    setIsOpen(false)
  }

  const handleShareLinkedIn = () => {
    const encodedUrl = encodeURIComponent(url)
    const encodedTitle = encodeURIComponent(title)
    const encodedDesc = encodeURIComponent(description ?? '')
    const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}&title=${encodedTitle}&summary=${encodedDesc}`
    window.open(linkedInUrl, '_blank', 'noopener,noreferrer,width=600,height=500')
    setIsOpen(false)
  }

  const handleEmbed = () => {
    setIsOpen(false)
    setEmbedOpen(true)
  }

  const handleDownloadImage = async () => {
    if (!captureRef.current || isDownloading) return

    setIsDownloading(true)
    try {
      const dataUrl = await toPng(captureRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#0d1117',
      })

      const link = document.createElement('a')
      link.download = `${toFileSlug(title)}.png`
      link.href = dataUrl
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      toast.success('Image downloaded')
      setIsOpen(false)
    } catch {
      toast.error('Could not generate image. Please try again.')
    } finally {
      setIsDownloading(false)
    }
  }

  const menuItems: ShareItem[] = [
    {
      id: 'copy-link',
      label: copied ? 'Copied!' : 'Copy link',
      icon: copied ? (
        <svg className="w-4 h-4 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      ),
      onClick: handleCopyLink,
    },
    {
      id: 'twitter',
      label: 'Share on Twitter / X',
      icon: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
      onClick: handleShareTwitter,
    },
    {
      id: 'linkedin',
      label: 'Share on LinkedIn',
      icon: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      ),
      onClick: handleShareLinkedIn,
    },
    {
      id: 'embed',
      label: 'Embed',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      ),
      onClick: handleEmbed,
      dividerBefore: true,
    },
    {
      id: 'download',
      label: isDownloading ? 'Generating image…' : 'Download as image',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      ),
      onClick: () => { void handleDownloadImage() },
    },
  ]

  return (
    <>
      <div className="relative inline-block">
        {/* Trigger button */}
        <button
          ref={buttonRef}
          onClick={() => setIsOpen((prev) => !prev)}
          aria-label="Share"
          aria-haspopup="true"
          aria-expanded={isOpen}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--surface-secondary)] transition-colors"
        >
          {/* Arrow/share icon */}
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
            />
          </svg>
          <span className="hidden sm:inline text-xs font-medium">Share</span>
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div
            ref={menuRef}
            role="menu"
            aria-label="Share options"
            className="absolute right-0 top-full z-50 mt-1.5 w-52 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl overflow-hidden"
          >
            {menuItems.map((item) => (
              <div key={item.id}>
                {item.dividerBefore && (
                  <div className="h-px bg-[var(--border)] mx-3" />
                )}
                <button
                  role="menuitem"
                  onClick={item.onClick}
                  disabled={item.id === 'download' && isDownloading}
                  className={[
                    'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors',
                    item.id === 'copy-link' && copied
                      ? 'text-[var(--accent)]'
                      : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--surface-secondary)]',
                    item.id === 'download' && isDownloading ? 'opacity-60 cursor-wait' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Embed modal — rendered outside dropdown so it's not clipped */}
      {postId && (
        <EmbedModal
          isOpen={embedOpen}
          onClose={() => setEmbedOpen(false)}
          id={postId}
        />
      )}

      {/*
        Off-screen share card. Rendered far off-screen (not display:none, which
        breaks html-to-image layout) so it can be captured to a PNG on demand.
      */}
      <div
        aria-hidden="true"
        style={{ position: 'fixed', left: '-9999px', top: 0, pointerEvents: 'none' }}
      >
        <div
          ref={captureRef}
          style={{
            width: 600,
            padding: 40,
            backgroundColor: '#0d1117',
            color: '#e6edf3',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#58a6ff' }}>Gitgram</span>
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.25, margin: 0 }}>
            {title}
          </h2>
          {description && (
            <p style={{ fontSize: 16, lineHeight: 1.5, color: '#8b949e', margin: 0 }}>
              {description.slice(0, 280)}
            </p>
          )}
          <p style={{ fontSize: 14, color: '#6e7681', margin: 0, wordBreak: 'break-all' }}>
            {url}
          </p>
        </div>
      </div>
    </>
  )
}
