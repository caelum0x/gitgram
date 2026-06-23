import api from './api';

export const advertisementsService = {
  getAds: async () => {
    const { data } = await api.get('/advertisements');
    return data;
  },

  createAd: async (adData: any) => {
    const { data } = await api.post('/advertisements', adData);
    return data;
  },

  updateAd: async (id: string, updates: any) => {
    const { data } = await api.patch(`/advertisements/${id}`, updates);
    return data;
  },

  getActiveAds: async (type?: string) => {
    const { data } = await api.get(`/advertisements/active${type ? `?type=${type}` : ''}`);
    return data;
  },
};
