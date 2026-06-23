import api from './api';

export const locationService = {
  getNearbyProjects: async (latitude: number, longitude: number, radius = 10, limit = 20) => {
    const response = await api.get('/v1/location/projects/nearby', {
      params: { latitude, longitude, radius, limit },
    });
    return response.data;
  },

  getNearbyPosts: async (latitude: number, longitude: number, radius = 10, limit = 20) => {
    const response = await api.get('/v1/location/posts/nearby', {
      params: { latitude, longitude, radius, limit },
    });
    return response.data;
  },

  geocodeAddress: async (address: string) => {
    const response = await api.post('/v1/location/geocode', { address });
    return response.data;
  },

  getNearbyUsers: async (latitude: number, longitude: number, radius = 10, limit = 20) => {
    const response = await api.get('/v1/location/users/nearby', {
      params: { latitude, longitude, radius, limit },
    });
    return response.data;
  },

  getTrendingLocations: async (limit = 50) => {
    const response = await api.get('/v1/location/trending', {
      params: { limit },
    });
    return response.data;
  },
};

