import api from './api';

export const githubService = {
  getRepositories: async () => {
    const response = await api.get('/github/repositories');
    return response.data;
  },

  getUserProjects: async (page = 1, limit = 20) => {
    const response = await api.get('/github/projects', {
      params: { page, limit },
    });
    return response.data;
  },

  getProject: async (projectId: string) => {
    const response = await api.get(`/github/projects/${projectId}`);
    return response.data;
  },

  syncProject: async (projectId: string) => {
    const response = await api.post(`/github/projects/${projectId}/sync`);
    return response.data;
  },

  syncAllProjects: async () => {
    const response = await api.post('/github/sync/all');
    return response.data;
  },

  createProject: async (data: { owner: string; repo: string; description?: string; tags?: string[] }) => {
    const response = await api.post('/github/projects', data);
    return response.data;
  },

  updateProject: async (projectId: string, data: { description?: string; tags?: string[] }) => {
    const response = await api.put(`/github/projects/${projectId}`, data);
    return response.data;
  },

  searchProjects: async (query: string, page = 1, limit = 20) => {
    const response = await api.get('/search/projects', {
      params: { q: query, page, limit },
    });
    return response.data;
  },

  saveProject: async (projectId: string) => {
    const response = await api.post(`/github/projects/${projectId}/save`);
    return response.data;
  },

  getSavedProjects: async (page = 1, limit = 20) => {
    const response = await api.get('/github/projects/saved', {
      params: { page, limit },
    });
    return response.data;
  },

  getRepositoryContent: async (owner: string, repo: string, path: string = '') => {
    const response = await api.get(`/github/repos/${owner}/${repo}/contents/${path}`);
    return response.data;
  },
};
