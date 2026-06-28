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

export const buildOwnerPath = (owner: string) => `/${encodeURIComponent(owner.trim())}`

export type GithubRefType = 'user' | 'repo'

export interface GithubRef {
  /** 'user' when the URL points at a GitHub account, 'repo' when it points at a repository. */
  type: GithubRefType
  owner: string
  /** Repository name — only present when type === 'repo'. */
  name?: string
  /** The canonical Gitgram path this GitHub URL maps to (each account/repo is a Gitgram profile). */
  gitgramPath: string
}

/**
 * Transform a GitHub URL (or owner / owner/repo shorthand) into the Gitgram account it maps to.
 * Every GitHub account and repository is a first-class Gitgram profile that can host the project's
 * posts, demos, photos, reels, and snippets:
 *   https://github.com/caelum0x            -> { type:'user', owner:'caelum0x', gitgramPath:'/caelum0x' }
 *   https://github.com/caelum0x/settlekit  -> { type:'repo', owner:'caelum0x', name:'settlekit', gitgramPath:'/caelum0x/settlekit' }
 */
export const parseGithubUrl = (input: string): GithubRef | null => {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }

  // Repository form (URL, ssh, or owner/repo shorthand) — reuse the existing parser.
  const repo = parseRepositoryInput(trimmed)
  if (repo) {
    return {
      type: 'repo',
      owner: repo.owner,
      name: repo.name,
      gitgramPath: buildRepoPath(repo.owner, repo.name),
    }
  }

  // Owner-only GitHub URL, e.g. https://github.com/caelum0x
  const directUrlCandidate = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(directUrlCandidate)
    if (url.hostname === 'github.com' || url.hostname === 'www.github.com') {
      const segments = url.pathname.split('/').filter(Boolean)
      const owner = segments[0]
      if (segments.length === 1 && owner && !isReservedRepoAliasSegment(owner)) {
        return { type: 'user', owner, gitgramPath: buildOwnerPath(owner) }
      }
    }
  } catch {
    // Fall through to bare-username shorthand.
  }

  // Bare username / @handle shorthand, e.g. "caelum0x" or "@caelum0x"
  const bare = trimmed.match(/^@?([A-Za-z0-9](?:[A-Za-z0-9-]{0,38})?)$/)
  if (bare && !isReservedRepoAliasSegment(bare[1])) {
    return { type: 'user', owner: bare[1], gitgramPath: buildOwnerPath(bare[1]) }
  }

  return null
}

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
