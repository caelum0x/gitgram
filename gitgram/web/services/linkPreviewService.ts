import api from './api'

/**
 * Link preview / unfurl card metadata.
 *
 * Mirrors the gitgram backend `LinkPreviewData` shape returned by the
 * `/v1/link-preview` proxy endpoint, which resolves OpenGraph
 * title/description/image server-side (avoiding browser CORS and centralising
 * caching). Ported in spirit from Bluesky's `getLinkMeta`, adapted to this
 * product's axios service convention.
 */
export interface LinkPreview {
  url: string
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
  favicon: string | null
  domain: string
}

interface LinkPreviewResponse {
  success: boolean
  preview?: LinkPreview
}

/** Module-scoped in-flight + result cache so the same URL is fetched once. */
const previewCache = new Map<string, Promise<LinkPreview | null>>()

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export const linkPreviewService = {
  /**
   * Fetch unfurl metadata for a single external URL.
   * Returns `null` when the URL is invalid or no preview could be generated;
   * never throws, so callers can render a graceful fallback.
   */
  getPreview: async (url: string): Promise<LinkPreview | null> => {
    if (!isHttpUrl(url)) return null

    const cached = previewCache.get(url)
    if (cached) return cached

    const request = (async (): Promise<LinkPreview | null> => {
      try {
        const { data } = await api.get<LinkPreviewResponse>('/v1/link-preview', {
          params: { url },
        })
        if (data?.success && data.preview) {
          return data.preview
        }
        return null
      } catch {
        // Unfurl failures are non-fatal — the caller falls back to a plain link.
        return null
      }
    })()

    previewCache.set(url, request)
    // Evict failed lookups so a transient error can be retried later.
    request.then((result) => {
      if (result === null) previewCache.delete(url)
    })
    return request
  },
}
