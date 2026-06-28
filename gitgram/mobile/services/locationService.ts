import api from './api';

export const locationService = {
  getNearbyProjects: async (latitude: number, longitude: number, radius = 10, limit = 20) => {
    const response = await api.get('/location/projects/nearby', {
      params: { latitude, longitude, radius, limit },
    });
    return response.data;
  },

  getNearbyPosts: async (latitude: number, longitude: number, radius = 10, limit = 20) => {
    const response = await api.get('/location/posts/nearby', {
      params: { latitude, longitude, radius, limit },
    });
    return response.data;
  },

  geocodeAddress: async (address: string) => {
    const response = await api.post('/location/geocode', { address });
    return response.data;
  },

  getNearbyUsers: async (latitude: number, longitude: number, radius = 10, limit = 20) => {
    const response = await api.get('/location/users/nearby', {
      params: { latitude, longitude, radius, limit },
    });
    return response.data;
  },

  getTrendingLocations: async (limit = 50) => {
    const response = await api.get('/location/trending', {
      params: { limit },
    });
    return response.data;
  },
};

