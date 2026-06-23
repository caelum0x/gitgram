import api from './api';

export const subscriptionService = {
  // Create checkout session for a plan (premium or creator)
  createCheckout: async (data: {
    productId: string;
    quantity?: number;
    trialPeriodDays?: number;
    returnUrl?: string;
  }) => {
    // Map productId to plan name expected by backend
    const plan = data.productId === 'creator' ? 'creator' : 'premium';
    const response = await api.post('/v1/subscriptions/checkout', { plan });
    return response.data;
  },

  // Get current user's subscription
  getMySubscriptions: async () => {
    const response = await api.get('/v1/subscriptions');
    return response.data;
  },

  // Get current subscription (plan, status, billing period, renewal date, payment method)
  getCurrent: async () => {
    const response = await api.get('/v1/subscriptions/current');
    return response.data;
  },

  // Get usage for the current billing period
  getUsage: async () => {
    const response = await api.get('/v1/subscriptions/usage');
    return response.data;
  },

  // Get billing history / invoices
  getInvoices: async () => {
    const response = await api.get('/v1/subscriptions/invoices');
    return response.data;
  },

  // Create a Polar customer portal session and return its URL
  getPortalUrl: async (returnUrl?: string) => {
    const response = await api.post('/v1/subscriptions/portal', { returnUrl });
    return response.data;
  },

  // Get specific subscription by ID
  getSubscription: async (subscriptionId: string) => {
    const response = await api.get(`/v1/subscriptions/${subscriptionId}`);
    return response.data;
  },

  // Change subscription plan
  changePlan: async (
    subscriptionId: string,
    data: {
      productId: string;
      quantity?: number;
      prorationBillingMode: 'prorated_immediately' | 'full_immediately' | 'difference_immediately';
      addons?: Array<{ addon_id: string; quantity: number }>;
    }
  ) => {
    // For changing plans, create a new checkout session
    const plan = data.productId === 'creator' ? 'creator' : 'premium';
    const response = await api.post('/v1/subscriptions/checkout', { plan });
    return response.data;
  },

  // Update payment method
  updatePaymentMethod: async (
    subscriptionId: string,
    data: {
      type: 'new' | 'existing';
      paymentMethodId?: string;
      returnUrl: string;
    }
  ) => {
    const response = await api.post(
      `/v1/subscriptions/${subscriptionId}/update-payment-method`,
      data
    );
    return response.data;
  },

  // Cancel subscription
  cancelSubscription: async (subscriptionId: string) => {
    const response = await api.delete('/v1/subscriptions');
    return response.data;
  },
};

