import api from './api';

export const verificationPurchaseService = {
  getPricing: async (type: 'standard' | 'golden', period: 'monthly' | 'annual' = 'monthly') => {
    const response = await api.get('/v1/verification/pricing', {
      params: { type, period },
    });
    return response.data;
  },

  createCheckout: async (type: 'standard' | 'golden', period: 'monthly' | 'annual' = 'monthly') => {
    const response = await api.post('/v1/verification/purchase/checkout', {
      type,
      period,
    });
    return response.data;
  },

  getPurchaseStatus: async () => {
    const response = await api.get('/v1/verification/purchase/status');
    return response.data;
  },

  cancelPurchase: async () => {
    const response = await api.post('/v1/verification/purchase/cancel');
    return response.data;
  },

  upgradeToGolden: async () => {
    const response = await api.post('/v1/verification/purchase/upgrade');
    return response.data;
  },

  downgradeToStandard: async () => {
    const response = await api.post('/v1/verification/purchase/downgrade');
    return response.data;
  },
};

