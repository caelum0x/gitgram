import type { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://gitgram.app'

// Static, always-public marketing/discovery routes. User/repo profile pages
// are dynamic ([username], [owner]/[repo]) and intentionally left out here
// rather than querying the database at build time from this file; add a
// dedicated sitemap route (e.g. app/sitemap/[id]/route.ts with
// generateSitemaps) if those need to be indexed individually.
const STATIC_ROUTES = [
  '',
  '/explore',
  '/discover',
  '/trending',
  '/search',
  '/pricing',
  '/about',
  '/terms',
  '/privacy-policy',
]

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return STATIC_ROUTES.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === '' ? 'daily' : 'weekly',
    priority: path === '' ? 1 : 0.7,
  }))
}
