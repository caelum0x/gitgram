import api from './api';

export const complianceService = {
  exportUserData: async () => {
    const response = await api.get('/compliance/export-data');
    return response.data;
  },

  deleteAccount: async () => {
    const response = await api.delete('/compliance/account');
    return response.data;
  },

  updateDataRetention: async (retentionDays: number) => {
    const response = await api.put('/compliance/retention', {
      retentionDays,
    });
    return response.data;
  },
};

