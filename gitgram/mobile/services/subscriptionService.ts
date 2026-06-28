import api from './api';

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: string;
  interval: string;
  available: boolean;
  features: string[];
}

export interface PlansResponse {
  plans: SubscriptionPlan[];
  currentPlan: string;
}

export const subscriptionService = {
  getPlans: async (): Promise<PlansResponse> => {
    const { data } = await api.get<PlansResponse>('/subscriptions/plans');
    return data;
  },

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
