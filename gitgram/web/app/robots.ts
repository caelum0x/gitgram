import type { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://gitgram.app'

// There was no robots.txt (static or dynamic) anywhere in the app, so search
// engines had no explicit crawl directives and no sitemap reference for this
// site. Authenticated/private surfaces (messages, settings, admin, etc.) are
// disallowed; public profile/repo/discovery pages remain crawlable.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/admin',
        '/settings',
        '/messages',
        '/notifications',
        '/account',
        '/create',
        '/create-change-story',
        '/create-story',
        '/drafts',
        '/edit',
        '/backup',
        '/compose',
        '/camera',
        '/chat',
        '/follow-requests',
        '/creator-studio',
        '/api-test',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
