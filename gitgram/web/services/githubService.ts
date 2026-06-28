import api from './api'

// ---------------------------------------------------------------------------
// Write-back result envelope
// ---------------------------------------------------------------------------

/**
 * Result of a GitHub write-back action proxied through the backend. The backend
 * uses the user's stored OAuth token (scope `repo,read:user`, requested in
 * connectGitHub) to call the GitHub REST API on their behalf.
 */
export interface GitHubActionResult {
  success: boolean
  /** New state after the action: true if now starred / following. */
  active: boolean
  message?: string
}

export interface GitHubStarStatus {
  starred: boolean
}

export interface GitHubFollowStatus {
  following: boolean
}

export const githubService = {
  connectGitHub: () => {
    const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
    const redirectUri = `${window.location.origin}/auth/github/callback`
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=user:email,repo,read:user`
  },

  syncProjects: async () => {
    const { data } = await api.post('/github/sync')
    return data
  },

  getProjects: async () => {
    const { data } = await api.get('/github/projects')
    return data
  },

  getProject: async (owner: string, repo: string) => {
    const { data } = await api.get(`/github/projects/${owner}/${repo}`)
    return data
  },

  claimAccount: async (githubUsername: string) => {
    const { data } = await api.post('/github/claim', { githubUsername })
    return data
  },

  disconnectGitHub: async () => {
    const { data } = await api.delete('/github/disconnect')
    return data
  },

  searchProjects: async (query: string, page = 1, limit = 20) => {
    const { data } = await api.get('/github/search', { params: { q: query, page, limit } })
    return data
  },

  getSavedProjects: async (page = 1, limit = 20) => {
    const { data } = await api.get('/github/saved', { params: { page, limit } })
    return data
  },

  syncProject: async (repoName: string, owner: string) => {
    const { data } = await api.post('/github/sync-project', { repoName, owner })
    return data
  },

  // -------------------------------------------------------------------------
  // GitHub write-back (star / follow) — proxied through the backend, which
  // holds the user's OAuth token. Mirrors gh-social's starAction/followAction.
  // `repoName` is the `owner/repo` full name.
  // -------------------------------------------------------------------------

  hasStarredRepo: async (repoName: string): Promise<boolean> => {
    const { data } = await api.get<GitHubStarStatus>('/github/starred', {
      params: { repo: repoName },
    })
    return Boolean(data?.starred)
  },

  starRepo: async (repoName: string): Promise<GitHubActionResult> => {
    const { data } = await api.put<GitHubActionResult>('/github/star', { repo: repoName })
    return data
  },

  unstarRepo: async (repoName: string): Promise<GitHubActionResult> => {
    const { data } = await api.delete<GitHubActionResult>('/github/star', {
      data: { repo: repoName },
    })
    return data
  },

  isFollowingOnGitHub: async (username: string): Promise<boolean> => {
    const { data } = await api.get<GitHubFollowStatus>('/github/following', {
      params: { username },
    })
    return Boolean(data?.following)
  },

  followOnGitHub: async (username: string): Promise<GitHubActionResult> => {
    const { data } = await api.put<GitHubActionResult>('/github/follow', { username })
    return data
  },

  unfollowOnGitHub: async (username: string): Promise<GitHubActionResult> => {
    const { data } = await api.delete<GitHubActionResult>('/github/follow', {
      data: { username },
    })
    return data
  },
}
