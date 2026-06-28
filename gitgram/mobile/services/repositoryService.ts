import api from './api';

export const repositoryService = {
  search: async (query: string) => {
    const response = await api.get(`/repositories/search?q=${encodeURIComponent(query)}`);
    return response.data;
  },

  getTrending: async (language?: string) => {
    const url = language 
      ? `/repositories/trending?language=${language}`
      : '/repositories/trending';
    const response = await api.get(url);
    return response.data;
  },

  get: async (owner: string, name: string) => {
    const response = await api.get(`/repositories/${owner}/${name}`);
    return response.data;
  },

  getPosts: async (owner: string, name: string) => {
    const response = await api.get(`/repositories/${owner}/${name}/posts`);
    return response.data;
  },

  follow: async (owner: string, name: string) => {
    const response = await api.post(`/repositories/${owner}/${name}/follow`);
    return response.data;
  },

  unfollow: async (owner: string, name: string) => {
    const response = await api.delete(`/repositories/${owner}/${name}/follow`);
    return response.data;
  },

  getFollowing: async () => {
    const response = await api.get('/repositories/following');
    return response.data;
  },

  parseUrl: async (url: string) => {
    const response = await api.get('/repositories/parse-url', { params: { url } });
    return response.data;
  },

  getComments: async (owner: string, name: string, page = 1, limit = 20) => {
    const response = await api.get(`/repositories/${owner}/${name}/comments`, {
      params: { page, limit },
    });
    return response.data;
  },

  addComment: async (owner: string, name: string, content: string) => {
    const response = await api.post(`/repositories/${owner}/${name}/comments`, { content });
    return response.data;
  },

  getReactions: async (owner: string, name: string) => {
    const response = await api.get(`/repositories/${owner}/${name}/reactions`);
    return response.data;
  },

  addReaction: async (owner: string, name: string, type: string) => {
    const response = await api.post(`/repositories/${owner}/${name}/reactions`, { type });
    return response.data;
  },
};

export default repositoryService;
