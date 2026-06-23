import api from './api';

export const subscriptionService = {
  getSubscription: async (_subscriptionId?: string) => {
    const { data } = await api.get('/subscriptions');
    return data;
  },

  getMySubscriptions: async () => {
    const { data } = await api.get('/subscriptions');
    return { subscriptions: Array.isArray(data) ? data : [data].filter(Boolean) };
  },

  createCheckout: async (plan: string) => {
    const { data } = await api.post('/subscriptions/checkout', { plan });
    return data;
  },

  getCheckoutURL: async ({
    productId,
    quantity,
    trialPeriodDays,
    returnUrl,
  }: {
    productId: string;
    quantity?: number;
    trialPeriodDays?: number;
    returnUrl?: string;
  }) => {
    const { data } = await api.post('/subscriptions/checkout', {
      plan: productId,
      productId,
      quantity,
      trialPeriodDays,
      returnUrl,
    });
    return data.url || data.checkoutUrl || data.paymentLink;
  },

  cancelSubscription: async (_subscriptionId?: string) => {
    const { data } = await api.delete('/subscriptions');
    return data;
  },

  changePlan: async (
    subscriptionId: string,
    payload: { productId: string; prorationBillingMode?: string }
  ) => {
    const { data } = await api.post('/subscriptions/checkout', {
      plan: payload.productId,
      subscriptionId,
      ...payload,
    });
    return data;
  },

  updatePaymentMethod: async (
    subscriptionId: string,
    payload: { type: 'new' | 'existing'; returnUrl?: string }
  ) => {
    const { data } = await api.post('/subscriptions/checkout', {
      subscriptionId,
      ...payload,
    });
    return data;
  },
};
