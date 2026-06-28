import api from './api';

export const verificationPurchaseService = {
  getPricing: async (type: 'standard' | 'golden', period: 'monthly' | 'annual' = 'monthly') => {
    const response = await api.get('/verification/pricing', {
      params: { type, period },
    });
    return response.data;
  },

  createCheckout: async (type: 'standard' | 'golden', period: 'monthly' | 'annual' = 'monthly') => {
    const response = await api.post('/verification/purchase/checkout', {
      type,
      period,
    });
    return response.data;
  },

  getPurchaseStatus: async () => {
    const response = await api.get('/verification/purchase/status');
    return response.data;
  },

  cancelPurchase: async () => {
    const response = await api.post('/verification/purchase/cancel');
    return response.data;
  },

  upgradeToGolden: async () => {
    const response = await api.post('/verification/purchase/upgrade');
    return response.data;
  },

  downgradeToStandard: async () => {
    const response = await api.post('/verification/purchase/downgrade');
    return response.data;
  },
};

