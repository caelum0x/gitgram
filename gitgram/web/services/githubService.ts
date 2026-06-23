import api from './api'

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
}
