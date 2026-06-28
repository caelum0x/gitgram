/**
 * Rich inline embed-player detection.
 *
 * Ported from Bluesky's `src/lib/strings/embed-player.ts` and adapted to the
 * gitgram-web stack: this is a pure, framework-agnostic URL -> embed mapping
 * with no React Native / iframe-host dependencies. Given an arbitrary URL it
 * returns the parameters needed to render an inline player (YouTube, YouTube
 * Shorts, Twitch, Spotify, Vimeo, SoundCloud, Apple Music, Giphy) or
 * `undefined` when the URL is not a recognised media provider.
 *
 * The detection is intentionally a flat, well-tested table of host/path rules
 * so new providers can be added without touching the rendering layer.
 */

export const embedPlayerSources = [
  'youtube',
  'youtubeShorts',
  'twitch',
  'spotify',
  'soundcloud',
  'appleMusic',
  'vimeo',
  'giphy',
] as const

export type EmbedPlayerSource = (typeof embedPlayerSources)[number]

export type EmbedPlayerType =
  | 'youtube_video'
  | 'youtube_short'
  | 'twitch_video'
  | 'spotify_album'
  | 'spotify_playlist'
  | 'spotify_song'
  | 'soundcloud_track'
  | 'soundcloud_set'
  | 'apple_music_playlist'
  | 'apple_music_album'
  | 'apple_music_song'
  | 'vimeo_video'
  | 'giphy_gif'

/** Human-readable provider labels, used for accessibility / fallbacks. */
export const EMBED_PLAYER_LABELS: Record<EmbedPlayerSource, string> = {
  youtube: 'YouTube',
  youtubeShorts: 'YouTube Shorts',
  vimeo: 'Vimeo',
  twitch: 'Twitch',
  giphy: 'GIPHY',
  spotify: 'Spotify',
  appleMusic: 'Apple Music',
  soundcloud: 'SoundCloud',
}

export interface EmbedPlayerParams {
  type: EmbedPlayerType
  /** The iframe / image `src` to render. */
  playerUri: string
  source: EmbedPlayerSource
  /** GIFs render as `<img>` rather than `<iframe>`. */
  isGif?: boolean
  /** Hide provider chrome (used for shorts / gifs). */
  hideDetails?: boolean
}

const giphyRegex = /media(?:[0-4]\.giphy\.com|\.giphy\.com)/i
const gifFilenameRegex = /^(\S+)\.(webp|gif|mp4)$/i

/**
 * The `parent` query param Twitch requires for its embed to load. On the
 * server (SSR) there is no `window`, so we fall back to `localhost`; the
 * embed is only ever rendered client-side, where the real hostname is used.
 */
function getEmbedParentHost(): string {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return window.location.hostname
  }
  return 'localhost'
}

/**
 * Aspect-ratio / fixed-height hint for a given embed type, so the caller can
 * reserve layout space and avoid cumulative layout shift.
 */
export function getEmbedPlayerAspect(
  type: EmbedPlayerType,
): { aspectRatio?: number; height?: number } {
  switch (type) {
    case 'youtube_video':
    case 'twitch_video':
    case 'vimeo_video':
      return { aspectRatio: 16 / 9 }
    case 'youtube_short':
      return { aspectRatio: 9 / 16 }
    case 'spotify_album':
    case 'apple_music_album':
    case 'apple_music_playlist':
    case 'spotify_playlist':
    case 'soundcloud_set':
      return { height: 380 }
    case 'spotify_song':
      return { height: 152 }
    case 'soundcloud_track':
      return { height: 165 }
    case 'apple_music_song':
      return { height: 150 }
    case 'giphy_gif':
      return { aspectRatio: 1 }
    default:
      return { aspectRatio: 16 / 9 }
  }
}

/**
 * Parse a URL into inline-player embed parameters, or `undefined` if the URL
 * is not a recognised media provider. Never throws on malformed input.
 */
export function getEmbedPlayerSource(url: string): EmbedPlayerParams | undefined {
  let urlp: URL
  try {
    urlp = new URL(url)
  } catch {
    return undefined
  }

  // ── YouTube (youtu.be short links) ────────────────────────────────────────
  if (urlp.hostname === 'youtu.be') {
    const videoId = urlp.pathname.split('/')[1]
    const seek = encodeURIComponent((urlp.searchParams.get('t') ?? '0').replace(/s$/, ''))
    if (videoId) {
      return {
        type: 'youtube_video',
        source: 'youtube',
        playerUri: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?start=${seek}`,
      }
    }
  }

  // ── YouTube (full links, shorts, live) ────────────────────────────────────
  if (
    urlp.hostname === 'www.youtube.com' ||
    urlp.hostname === 'youtube.com' ||
    urlp.hostname === 'm.youtube.com' ||
    urlp.hostname === 'music.youtube.com'
  ) {
    const [, page, shortOrLiveVideoId] = urlp.pathname.split('/')
    const isShorts = page === 'shorts'
    const isLive = page === 'live'
    const videoId = isShorts || isLive ? shortOrLiveVideoId : urlp.searchParams.get('v') ?? ''
    const seek = encodeURIComponent((urlp.searchParams.get('t') ?? '0').replace(/s$/, ''))

    if (videoId) {
      return {
        type: isShorts ? 'youtube_short' : 'youtube_video',
        source: isShorts ? 'youtubeShorts' : 'youtube',
        hideDetails: isShorts || undefined,
        playerUri: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?start=${seek}`,
      }
    }
  }

  // ── Twitch ────────────────────────────────────────────────────────────────
  if (
    urlp.hostname === 'twitch.tv' ||
    urlp.hostname === 'www.twitch.tv' ||
    urlp.hostname === 'm.twitch.tv'
  ) {
    const parent = getEmbedParentHost()
    const [, channelOrVideo, clipOrId, id] = urlp.pathname.split('/')

    if (channelOrVideo === 'videos') {
      return {
        type: 'twitch_video',
        source: 'twitch',
        playerUri: `https://player.twitch.tv/?volume=0.5&!muted&video=${encodeURIComponent(clipOrId)}&parent=${parent}`,
      }
    }
    if (clipOrId === 'clip') {
      return {
        type: 'twitch_video',
        source: 'twitch',
        playerUri: `https://clips.twitch.tv/embed?volume=0.5&clip=${encodeURIComponent(id)}&parent=${parent}`,
      }
    }
    if (channelOrVideo) {
      return {
        type: 'twitch_video',
        source: 'twitch',
        playerUri: `https://player.twitch.tv/?volume=0.5&!muted&channel=${encodeURIComponent(channelOrVideo)}&parent=${parent}`,
      }
    }
  }

  // ── Spotify ───────────────────────────────────────────────────────────────
  if (urlp.hostname === 'open.spotify.com') {
    const [, typeOrLocale, idOrType, id] = urlp.pathname.split('/')
    if (idOrType) {
      const resolvedId = encodeURIComponent(id ?? idOrType)
      if (typeOrLocale === 'playlist' || idOrType === 'playlist') {
        return { type: 'spotify_playlist', source: 'spotify', playerUri: `https://open.spotify.com/embed/playlist/${resolvedId}` }
      }
      if (typeOrLocale === 'album' || idOrType === 'album') {
        return { type: 'spotify_album', source: 'spotify', playerUri: `https://open.spotify.com/embed/album/${resolvedId}` }
      }
      if (typeOrLocale === 'track' || idOrType === 'track') {
        return { type: 'spotify_song', source: 'spotify', playerUri: `https://open.spotify.com/embed/track/${resolvedId}` }
      }
      if (typeOrLocale === 'episode' || idOrType === 'episode') {
        return { type: 'spotify_song', source: 'spotify', playerUri: `https://open.spotify.com/embed/episode/${resolvedId}` }
      }
      if (typeOrLocale === 'show' || idOrType === 'show') {
        return { type: 'spotify_song', source: 'spotify', playerUri: `https://open.spotify.com/embed/show/${resolvedId}` }
      }
    }
  }

  // ── SoundCloud ────────────────────────────────────────────────────────────
  if (urlp.hostname === 'soundcloud.com' || urlp.hostname === 'www.soundcloud.com') {
    const [, user, trackOrSets, set] = urlp.pathname.split('/')
    if (user && trackOrSets) {
      const playerUri = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&visual=false&hide_related=true`
      if (trackOrSets === 'sets' && set) {
        return { type: 'soundcloud_set', source: 'soundcloud', playerUri }
      }
      return { type: 'soundcloud_track', source: 'soundcloud', playerUri }
    }
  }

  // ── Apple Music ───────────────────────────────────────────────────────────
  if (urlp.hostname === 'music.apple.com') {
    const pathParams = urlp.pathname.split('/')
    const type = pathParams[2]
    const songId = urlp.searchParams.get('i')
    if (pathParams.length === 5 && (type === 'playlist' || type === 'album' || type === 'song')) {
      const embedUri = `https://embed.music.apple.com${urlp.pathname}${songId ? `?i=${encodeURIComponent(songId)}` : ''}`
      if (type === 'playlist') {
        return { type: 'apple_music_playlist', source: 'appleMusic', playerUri: embedUri }
      }
      if (type === 'album') {
        return songId
          ? { type: 'apple_music_song', source: 'appleMusic', playerUri: embedUri }
          : { type: 'apple_music_album', source: 'appleMusic', playerUri: embedUri }
      }
      return { type: 'apple_music_song', source: 'appleMusic', playerUri: embedUri }
    }
  }

  // ── Vimeo ─────────────────────────────────────────────────────────────────
  if (urlp.hostname === 'vimeo.com' || urlp.hostname === 'www.vimeo.com') {
    const [, videoId] = urlp.pathname.split('/')
    if (videoId && /^\d+$/.test(videoId)) {
      return { type: 'vimeo_video', source: 'vimeo', playerUri: `https://player.vimeo.com/video/${videoId}` }
    }
  }

  // ── Giphy (page links) ────────────────────────────────────────────────────
  if (urlp.hostname === 'giphy.com' || urlp.hostname === 'www.giphy.com') {
    const [, gifs, nameAndId] = urlp.pathname.split('/')
    if (gifs === 'gifs' && nameAndId) {
      const gifId = nameAndId.split('-').pop()
      if (gifId) {
        return {
          type: 'giphy_gif',
          source: 'giphy',
          isGif: true,
          hideDetails: true,
          playerUri: `https://i.giphy.com/media/${encodeURIComponent(gifId)}/200.webp`,
        }
      }
    }
  }

  // ── Giphy (direct media links: media.giphy.com / media0-4.giphy.com) ──────
  if (giphyRegex.test(urlp.hostname)) {
    const [, media, trackingOrId, idOrFilename, filename] = urlp.pathname.split('/')
    if (media === 'media') {
      if (idOrFilename && gifFilenameRegex.test(idOrFilename)) {
        return { type: 'giphy_gif', source: 'giphy', isGif: true, hideDetails: true, playerUri: `https://i.giphy.com/media/${encodeURIComponent(trackingOrId)}/200.webp` }
      }
      if (filename && gifFilenameRegex.test(filename)) {
        return { type: 'giphy_gif', source: 'giphy', isGif: true, hideDetails: true, playerUri: `https://i.giphy.com/media/${encodeURIComponent(idOrFilename)}/200.webp` }
      }
    }
  }

  // ── Giphy (i.giphy.com) ───────────────────────────────────────────────────
  if (urlp.hostname === 'i.giphy.com' || urlp.hostname === 'www.i.giphy.com') {
    const [, mediaOrFilename, filename] = urlp.pathname.split('/')
    if (mediaOrFilename === 'media' && filename) {
      const gifId = filename.split('.')[0]
      return { type: 'giphy_gif', source: 'giphy', isGif: true, hideDetails: true, playerUri: `https://i.giphy.com/media/${encodeURIComponent(gifId)}/200.webp` }
    }
    if (mediaOrFilename) {
      const gifId = mediaOrFilename.split('.')[0]
      return { type: 'giphy_gif', source: 'giphy', isGif: true, hideDetails: true, playerUri: `https://i.giphy.com/media/${encodeURIComponent(gifId)}/200.webp` }
    }
  }

  return undefined
}

/** Convenience predicate: does this URL map to an inline player? */
export function isEmbedPlayerUrl(url: string): boolean {
  return getEmbedPlayerSource(url) !== undefined
}
