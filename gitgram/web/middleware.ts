import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  buildRepoPath,
  buildRepoTextRawPath,
  buildRepoTextPath,
  isReservedRepoAliasSegment,
} from './utils/repositoryRouting'

// Public routes that don't require authentication
const publicPaths = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/pricing',
  '/terms',
  '/privacy-policy',
  '/auth/github/callback',
  '/auth/google/callback',
  '/embed',
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const segments = pathname.split('/').filter(Boolean)

  // Allow public paths
  if (publicPaths.some(path => pathname === path || pathname.startsWith(path + '/'))) {
    return NextResponse.next()
  }

  // Allow static files and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  if (
    segments.length === 5 &&
    segments[3] === 'text' &&
    segments[4] === 'raw' &&
    (segments[0] === 'repo' || segments[0] === 'project' || segments[0] === 'github')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = buildRepoTextRawPath(segments[1], segments[2])
    return NextResponse.redirect(url)
  }

  if (
    segments.length === 4 &&
    segments[3] === 'text' &&
    (segments[0] === 'repo' || segments[0] === 'project' || segments[0] === 'github')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = buildRepoTextPath(segments[1], segments[2])
    return NextResponse.redirect(url)
  }

  if (
    segments.length === 3 &&
    (segments[0] === 'repo' || segments[0] === 'project' || segments[0] === 'github')
  ) {
    const destination = buildRepoPath(segments[1], segments[2])
    const url = request.nextUrl.clone()
    url.pathname = destination
    return NextResponse.redirect(url)
  }

  if (
    segments.length === 4 &&
    segments[2] === 'text' &&
    segments[3] === 'raw' &&
    !isReservedRepoAliasSegment(segments[0])
  ) {
    return NextResponse.next()
  }

  if (
    segments.length === 3 &&
    segments[2] === 'text' &&
    !isReservedRepoAliasSegment(segments[0])
  ) {
    return NextResponse.next()
  }

  if (segments.length === 2 && !isReservedRepoAliasSegment(segments[0])) {
    return NextResponse.next()
  }

  // For protected routes, check if user has a token cookie
  // Note: Gitgram uses localStorage for auth, but we set a lightweight
  // cookie indicator on login to enable server-side redirect.
  // If no cookie, the client-side auth check in each page will handle redirect.
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
