export interface ParsedRepositoryRef {
  owner: string
  name: string
  fullName: string
}

const normalizeRepositoryName = (value: string) =>
  value.replace(/\.git$/i, '').trim()

const buildRepositoryRef = (owner: string, name: string): ParsedRepositoryRef | null => {
  const normalizedOwner = owner.trim()
  const normalizedName = normalizeRepositoryName(name)

  if (!normalizedOwner || !normalizedName) {
    return null
  }

  return {
    owner: normalizedOwner,
    name: normalizedName,
    fullName: `${normalizedOwner}/${normalizedName}`,
  }
}

export const parseRepositoryInput = (input: string): ParsedRepositoryRef | null => {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }

  const sshMatch = trimmed.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i)
  if (sshMatch) {
    return buildRepositoryRef(sshMatch[1], sshMatch[2])
  }

  const directUrlCandidate = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    const url = new URL(directUrlCandidate)
    if (url.hostname === 'github.com' || url.hostname === 'www.github.com') {
      const [owner, name] = url.pathname.split('/').filter(Boolean)
      if (owner && name) {
        return buildRepositoryRef(owner, name)
      }
    }
  } catch {
    // Fall through to owner/repo shorthand parsing.
  }

  const shorthandMatch = trimmed.match(/^([^/\s]+)\/([^/\s?#]+)$/)
  if (shorthandMatch) {
    return buildRepositoryRef(shorthandMatch[1], shorthandMatch[2])
  }

  return null
}

export const buildRepoPath = (owner: string, name: string) =>
  `/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`

export const buildLegacyRepoPath = (owner: string, name: string) =>
  `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`

export const buildRepoTextPath = (owner: string, name: string) =>
  `${buildRepoPath(owner, name)}/text`

export const buildLegacyRepoTextPath = (owner: string, name: string) =>
  `${buildLegacyRepoPath(owner, name)}/text`

export const buildRepoTextRawPath = (owner: string, name: string) =>
  `${buildRepoTextPath(owner, name)}/raw`

export const buildLegacyRepoTextRawPath = (owner: string, name: string) =>
  `${buildLegacyRepoTextPath(owner, name)}/raw`

export const RESERVED_REPO_ALIAS_SEGMENTS = new Set([
  'about',
  'account',
  'activity',
  'admin',
  'ads',
  'analytics',
  'api',
  'api-test',
  'auth',
  'backup',
  'blog',
  'camera',
  'chat',
  'claim',
  'collaborate',
  'collection',
  'collections',
  'compose',
  'create',
  'create-change-story',
  'creator-studio',
  'developers',
  'discover',
  'drafts',
  'edit',
  'error',
  'explore',
  'feed',
  'feedback',
  'follow-requests',
  'followers',
  'following',
  'forgot-password',
  'github',
  'hashtag',
  'help',
  'insights',
  'likes',
  'live',
  'location',
  'login',
  'map',
  'messages',
  'moments',
  'notifications',
  'onboarding',
  'partnerships',
  'post',
  'pricing',
  'privacy-policy',
  'profile',
  'project',
  'projects',
  'reel',
  'reels',
  'register',
  'repo',
  'reset-password',
  'saved',
  'scheduled',
  'search',
  'settings',
  'store',
  'stories',
  'story',
  'subscription',
  'suggested',
  'tag',
  'terms',
  'trending',
  'user',
])

export const isReservedRepoAliasSegment = (segment: string) =>
  RESERVED_REPO_ALIAS_SEGMENTS.has(segment.toLowerCase())
