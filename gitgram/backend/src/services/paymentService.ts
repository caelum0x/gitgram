import axios from 'axios';
import logger from '../utils/logger';

const DODOPAY_API_URL = process.env.DODOPAY_API_URL || process.env.DODO_PAYMENTS_API_URL || 'https://api.dodopay.com';
const DODOPAY_API_KEY = process.env.DODO_PAYMENTS_API_KEY || process.env.DODOPAY_API_KEY || '';
const DODOPAY_SECRET_KEY = process.env.DODO_PAYMENTS_SECRET_KEY || process.env.DODOPAY_SECRET_KEY || '';
const DODOPAY_WEBHOOK_SECRET = process.env.DODO_WEBHOOK_SECRET || process.env.DODOPAY_WEBHOOK_SECRET || '';

// Check if payment service is configured
const isConfigured = (): boolean => Boolean(DODOPAY_API_KEY && DODOPAY_SECRET_KEY);

// Log configuration status on module load
if (!isConfigured()) {
  logger.warn('Payment provider not configured — all users will be on the free tier. Paid features are disabled.');
  logger.info('Set DODOPAY_API_KEY and DODOPAY_SECRET_KEY environment variables to enable payments.');
}

export interface PaymentRequest {
  amount: number;
  currency?: string;
  description?: string;
  customerEmail?: string;
  customerName?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentResponse {
  paymentId: string;
  status: string;
  amount: number;
  currency: string;
  paymentUrl?: string;
  transactionId?: string;
  isMock?: boolean;  // Indicates if this is a mock response
}

export interface PaymentVerification {
  isValid: boolean;
  status: string;
  amount?: number;
  transactionId?: string;
  isMock?: boolean;  // Indicates if this is a mock response
}

export const paymentService = {
  // Check if service is in mock mode
  isMockMode: (): boolean => !isConfigured(),

  async createPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      if (!isConfigured()) {
        logger.warn('Payment provider not configured — cannot create payment. Users are on the free tier.');
        return {
          paymentId: '',
          status: 'not_configured',
          amount: 0,
          currency: request.currency || 'USD',
          isMock: true,
        };
      }

      const response = await axios.post(
        `${DODOPAY_API_URL}/v1/payments`,
        {
          amount: request.amount,
          currency: request.currency || 'USD',
          description: request.description,
          customer_email: request.customerEmail,
          customer_name: request.customerName,
          metadata: request.metadata,
        },
        {
          headers: {
            'Authorization': `Bearer ${DODOPAY_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        paymentId: response.data.id || response.data.payment_id,
        status: response.data.status || 'pending',
        amount: response.data.amount,
        currency: response.data.currency,
        paymentUrl: response.data.payment_url || response.data.checkout_url,
        transactionId: response.data.transaction_id,
      };
    } catch (error: any) {
      logger.error('Create payment error:', error);
      throw new Error('Failed to create payment');
    }
  },

  async verifyPayment(paymentId: string): Promise<PaymentVerification> {
    try {
      if (!isConfigured()) {
        logger.warn('Payment provider not configured — cannot verify payment. Users are on the free tier.');
        return {
          isValid: false,
          status: 'not_configured',
          amount: 0,
          isMock: true,
        };
      }

      const response = await axios.get(
        `${DODOPAY_API_URL}/v1/payments/${paymentId}`,
        {
          headers: {
            'Authorization': `Bearer ${DODOPAY_API_KEY}`,
          },
        }
      );

      return {
        isValid: response.data.status === 'completed' || response.data.status === 'success',
        status: response.data.status,
        amount: response.data.amount,
        transactionId: response.data.transaction_id,
      };
    } catch (error: any) {
      logger.error('Verify payment error:', error);
      return {
        isValid: false,
        status: 'failed',
      };
    }
  },

  async refundPayment(paymentId: string, amount?: number): Promise<boolean> {
    try {
      if (!isConfigured()) {
        logger.warn('Payment provider not configured — cannot process refund. No payment provider available.');
        return false;
      }

      const response = await axios.post(
        `${DODOPAY_API_URL}/v1/payments/${paymentId}/refund`,
        {
          amount,
        },
        {
          headers: {
            'Authorization': `Bearer ${DODOPAY_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data.status === 'refunded' || response.data.status === 'success';
    } catch (error: any) {
      logger.error('Refund payment error:', error);
      return false;
    }
  },

  async handleWebhook(payload: unknown, signature: string): Promise<boolean> {
    try {
      // Verify webhook signature
      if (!DODOPAY_SECRET_KEY) {
        logger.warn('Dodopay secret key not configured, skipping webhook verification');
        return false;
      }

      // Implement webhook signature verification
      const crypto = await import('crypto');
      const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const expectedSignature = crypto
        .createHmac('sha256', DODOPAY_SECRET_KEY)
        .update(payloadString)
        .digest('hex');
      
      // Compare signatures in constant time to prevent timing attacks
      const isValid = signature.length === expectedSignature.length &&
        crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));

      if (!isValid) {
        logger.warn('Webhook signature verification failed');
        return false;
      }

      return true;
    } catch (error: any) {
      logger.error('Handle webhook error:', error);
      return false;
    }
  },

  // Subscription methods
  async createSubscriptionCheckout(data: {
    productId: string;
    quantity?: number;
    customerEmail: string;
    customerName: string;
    returnUrl: string;
    trialPeriodDays?: number;
    metadata?: Record<string, unknown>;
  }): Promise<{ sessionId: string; checkoutUrl: string }> {
    try {
      if (!DODOPAY_API_KEY) {
        logger.warn('Payment provider not configured — cannot create subscription checkout. Users are on the free tier.');
        throw new Error('Payment provider is not configured. Subscriptions are unavailable.');
      }

      const response = await axios.post(
        `${DODOPAY_API_URL}/checkouts`,
        {
          product_cart: [
            {
              product_id: data.productId,
              quantity: data.quantity || 1,
            },
          ],
          subscription_data: data.trialPeriodDays
            ? { trial_period_days: data.trialPeriodDays }
            : undefined,
          customer: {
            email: data.customerEmail,
            name: data.customerName,
          },
          return_url: data.returnUrl,
          metadata: data.metadata,
        },
        {
          headers: {
            Authorization: `Bearer ${DODOPAY_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        sessionId: response.data.session_id,
        checkoutUrl: response.data.checkout_url,
      };
    } catch (error: any) {
      logger.error('Create subscription checkout error:', error);
      throw new Error('Failed to create subscription checkout');
    }
  },

  async changeSubscriptionPlan(
    subscriptionId: string,
    data: {
      productId: string;
      quantity?: number;
      prorationBillingMode: 'prorated_immediately' | 'full_immediately' | 'difference_immediately';
      addons?: Array<{ addon_id: string; quantity: number }>;
    }
  ): Promise<{
    status: string;
    subscriptionId: string;
    invoiceId?: string;
    paymentId?: string;
    prorationBillingMode: string;
  }> {
    try {
      if (!DODOPAY_API_KEY) {
        logger.warn('Payment provider not configured — cannot change subscription plan. Users are on the free tier.');
        throw new Error('Payment provider is not configured. Subscription changes are unavailable.');
      }

      const response = await axios.post(
        `${DODOPAY_API_URL}/subscriptions/${subscriptionId}/change-plan`,
        {
          product_id: data.productId,
          quantity: data.quantity || 1,
          proration_billing_mode: data.prorationBillingMode,
          addons: data.addons || [],
        },
        {
          headers: {
            Authorization: `Bearer ${DODOPAY_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        status: response.data.status,
        subscriptionId: response.data.subscription_id,
        invoiceId: response.data.invoice_id,
        paymentId: response.data.payment_id,
        prorationBillingMode: response.data.proration_billing_mode,
      };
    } catch (error: any) {
      logger.error('Change subscription plan error:', error);
      throw new Error('Failed to change subscription plan');
    }
  },

  async updateSubscriptionPaymentMethod(
    subscriptionId: string,
    data: {
      type: 'new' | 'existing';
      paymentMethodId?: string;
      returnUrl: string;
    }
  ): Promise<{
    paymentId?: string;
    paymentLink?: string;
  }> {
    try {
      if (!DODOPAY_API_KEY) {
        logger.warn('Payment provider not configured — cannot update payment method. Users are on the free tier.');
        throw new Error('Payment provider is not configured. Payment method updates are unavailable.');
      }

      const requestBody: Record<string, string> = {
        type: data.type,
        return_url: data.returnUrl,
      };

      if (data.type === 'existing' && data.paymentMethodId) {
        requestBody.payment_method_id = data.paymentMethodId;
      }

      const response = await axios.post(
        `${DODOPAY_API_URL}/subscriptions/${subscriptionId}/update-payment-method`,
        requestBody,
        {
          headers: {
            Authorization: `Bearer ${DODOPAY_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        paymentId: response.data.payment_id,
        paymentLink: response.data.payment_link,
      };
    } catch (error: any) {
      logger.error('Update subscription payment method error:', error);
      throw new Error('Failed to update subscription payment method');
    }
  },

  async cancelSubscription(subscriptionId: string): Promise<boolean> {
    try {
      if (!DODOPAY_API_KEY) {
        logger.warn('Dodopay credentials not configured, skipping cancellation');
        return false;
      }

      const response = await axios.post(
        `${DODOPAY_API_URL}/subscriptions/${subscriptionId}/cancel`,
        {},
        {
          headers: {
            Authorization: `Bearer ${DODOPAY_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data.status === 'cancelled' || response.data.cancelled === true;
    } catch (error: any) {
      logger.error('Cancel subscription error:', error);
      return false;
    }
  },

  async getSubscription(subscriptionId: string): Promise<Record<string, unknown>> {
    try {
      if (!DODOPAY_API_KEY) {
        logger.warn('Payment provider not configured — returning free tier status. No active subscription.');
        return {
          id: null,
          status: 'inactive',
          plan: 'free',
          product_id: null,
          not_configured: true,
        };
      }

      const response = await axios.get(`${DODOPAY_API_URL}/subscriptions/${subscriptionId}`, {
        headers: {
          Authorization: `Bearer ${DODOPAY_API_KEY}`,
        },
      });

      return response.data;
    } catch (error: any) {
      logger.error('Get subscription error:', error);
      throw new Error('Failed to get subscription');
    }
  },

  async verifyWebhookSignature(
    payload: string,
    headers: {
      'webhook-id'?: string;
      'webhook-signature'?: string;
      'webhook-timestamp'?: string;
    }
  ): Promise<boolean> {
    try {
      if (!DODOPAY_WEBHOOK_SECRET) {
        logger.warn('Dodopay webhook secret not configured, skipping verification');
        return false;
      }

      // Standard webhook signature verification
      const crypto = await import('crypto');
      const timestamp = headers['webhook-timestamp'] || '';
      const signature = headers['webhook-signature'] || '';

      if (!timestamp || !signature) {
        return false;
      }

      // Create signed payload
      const signedPayload = `${timestamp}.${payload}`;
      const expectedSignature = crypto
        .createHmac('sha256', DODOPAY_WEBHOOK_SECRET)
        .update(signedPayload)
        .digest('hex');

      // Compare signatures in constant time
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error: any) {
      logger.error('Verify webhook signature error:', error);
      return false;
    }
  },
};

