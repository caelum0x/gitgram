'use client'

import { useState } from 'react'
import {
  EMBED_PLAYER_LABELS,
  getEmbedPlayerAspect,
  type EmbedPlayerParams,
} from '@/utils/embedPlayer'

interface EmbedPlayerProps {
  params: EmbedPlayerParams
  /** Original URL, used for the "open externally" affordance and alt text. */
  url: string
  className?: string
}

/**
 * Renders an inline media player for a recognised provider (YouTube, Twitch,
 * Spotify, Vimeo, SoundCloud, Apple Music, Giphy).
 *
 * To avoid auto-loading third-party iframes (and the privacy / performance
 * cost that entails), non-GIF embeds start as a click-to-load facade showing
 * the provider name. Only after the user opts in do we mount the iframe.
 * GIFs render directly as images since they carry no autoplay-with-audio cost.
 */
export default function EmbedPlayer({ params, url, className = '' }: EmbedPlayerProps) {
  const [activated, setActivated] = useState(false)
  const aspect = getEmbedPlayerAspect(params.type)
  const label = EMBED_PLAYER_LABELS[params.source]

  const frameStyle: React.CSSProperties = aspect.aspectRatio
    ? { aspectRatio: String(aspect.aspectRatio) }
    : { height: aspect.height }

  // GIFs: render as a plain image, no iframe, no facade.
  if (params.isGif) {
    return (
      <div
        className={`overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] ${className}`}
        style={frameStyle}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={params.playerUri}
          alt={`${label} GIF`}
          loading="lazy"
          className="h-full w-full object-contain"
        />
      </div>
    )
  }

  if (!activated) {
    return (
      <button
        type="button"
        onClick={() => setActivated(true)}
        aria-label={`Load ${label} player`}
        className={`group relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] transition-colors hover:border-[var(--primary)] ${className}`}
        style={frameStyle}
      >
        <div className="flex flex-col items-center gap-2 text-[var(--foreground-secondary)] group-hover:text-[var(--foreground)]">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-secondary)] transition-colors group-hover:bg-[var(--primary)]/15">
            <svg className="h-6 w-6 text-[var(--primary)]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <span className="text-sm font-medium">Play on {label}</span>
        </div>
      </button>
    )
  }

  return (
    <div
      className={`overflow-hidden rounded-xl border border-[var(--border)] bg-black ${className}`}
      style={frameStyle}
    >
      <iframe
        src={params.playerUri}
        title={`${label} player`}
        className="h-full w-full"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
      />
    </div>
  )
}
