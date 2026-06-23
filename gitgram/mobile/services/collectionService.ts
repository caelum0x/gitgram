import api from './api';

export const collectionService = {
  getCollections: async () => {
    const response = await api.get('/v1/collections');
    return response.data;
  },

  getCollection: async (collectionId: string) => {
    const response = await api.get(`/v1/collections/${collectionId}`);
    return response.data;
  },

  createCollection: async (data: {
    name: string;
    description?: string;
    isPrivate?: boolean;
  }) => {
    const response = await api.post('/v1/collections', data);
    return response.data;
  },

  updateCollection: async (collectionId: string, data: {
    name?: string;
    description?: string;
    isPrivate?: boolean;
  }) => {
    const response = await api.put(`/v1/collections/${collectionId}`, data);
    return response.data;
  },

  deleteCollection: async (collectionId: string) => {
    const response = await api.delete(`/v1/collections/${collectionId}`);
    return response.data;
  },

  addPostToCollection: async (collectionId: string, postId: string) => {
    const response = await api.post(`/v1/collections/${collectionId}/posts`, {
      postId,
    });
    return response.data;
  },

  removePostFromCollection: async (collectionId: string, postId: string) => {
    const response = await api.delete(`/v1/collections/${collectionId}/posts/${postId}`);
    return response.data;
  },
};

