'use client'

import { useMemo } from 'react'
import { extractUrls } from '@/utils/extractUrls'
import { getEmbedPlayerSource } from '@/utils/embedPlayer'
import EmbedPlayer from './EmbedPlayer'
import LinkCard from './LinkCard'

interface RichEmbedsProps {
  /** Raw post content to scan for embeddable / unfurlable URLs. */
  content: string
  /** Maximum number of embeds to render below the text (default 2). */
  max?: number
  className?: string
}

/**
 * Scans post content for external URLs and renders, for each:
 *  - an inline media player (YouTube/Twitch/Spotify/Vimeo/SoundCloud/Apple
 *    Music/Giphy) when the URL maps to a known provider, or
 *  - a link-preview / unfurl card (title, description, image, domain) for any
 *    other external URL.
 *
 * Renders nothing when the content has no external URLs, so it is safe to mount
 * unconditionally after any post body.
 */
export default function RichEmbeds({ content, max = 2, className = '' }: RichEmbedsProps) {
  const urls = useMemo(() => extractUrls(content, { limit: max }), [content, max])

  if (urls.length === 0) return null

  return (
    <div className={`mt-3 flex flex-col gap-3 ${className}`}>
      {urls.map((url) => {
        const player = getEmbedPlayerSource(url)
        if (player) {
          return <EmbedPlayer key={url} params={player} url={url} />
        }
        return <LinkCard key={url} url={url} />
      })}
    </div>
  )
}
