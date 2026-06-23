import { Linking } from 'react-native';
import { logger } from './logger';

export interface PaymentCallbackParams {
  paymentId?: string;
  status?: string;
  subscriptionId?: string;
  productId?: string;
}

export class PaymentDeepLinkHandler {
  private listeners: Array<(params: PaymentCallbackParams) => void> = [];
  private urlSubscription: any = null;

  constructor() {
    this.initialize();
  }

  private initialize() {
    // Handle deep links when app is already running
    this.urlSubscription = Linking.addEventListener('url', this.handleDeepLink);

    // Handle deep link if app was opened from a link
    Linking.getInitialURL().then((url) => {
      if (url) {
        this.handleDeepLink({ url });
      }
    });
  }

  private handleDeepLink = ({ url }: { url: string }) => {
    try {
      logger.log('Deep link received:', url);
      if (url.includes('payment-status') || url.includes('subscription-status') || url.includes('payment_id') || url.includes('subscription_id')) {
        const params = this.parsePaymentParams(url);
        logger.log('Parsed payment params:', params);
        this.notifyListeners(params);
      }
    } catch (error) {
      logger.error('Deep link handling error:', error);
    }
  };

  private parsePaymentParams(url: string): PaymentCallbackParams {
    const params: PaymentCallbackParams = {};
    
    try {
      // Handle both standard URLs and deep link URLs (gitgram://)
      let urlToParse = url;
      if (url.includes('://')) {
        // Extract query string from deep link
        const queryIndex = url.indexOf('?');
        if (queryIndex !== -1) {
          urlToParse = 'https://example.com' + url.substring(queryIndex);
        }
      }

      const urlObj = new URL(urlToParse);
      const searchParams = urlObj.searchParams;

      params.paymentId = searchParams.get('payment_id') || undefined;
      params.status = searchParams.get('status') || undefined;
      params.subscriptionId = searchParams.get('subscription_id') || undefined;
      params.productId = searchParams.get('productId') || undefined;
    } catch (error) {
      // Fallback for non-standard URL formats
      const match = url.match(/[?&]([^=]+)=([^&]+)/g);
      if (match) {
        match.forEach((param) => {
          const [key, value] = param.substring(1).split('=');
          const decodedValue = decodeURIComponent(value);
          if (key === 'payment_id') params.paymentId = decodedValue;
          if (key === 'status') params.status = decodedValue;
          if (key === 'subscription_id') params.subscriptionId = decodedValue;
          if (key === 'productId') params.productId = decodedValue;
        });
      }
    }

    return params;
  }

  public addListener(callback: (params: PaymentCallbackParams) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private notifyListeners(params: PaymentCallbackParams) {
    this.listeners.forEach((callback) => {
      try {
        callback(params);
      } catch (error) {
        logger.error('Payment callback error:', error);
      }
    });
  }

  public cleanup() {
    if (this.urlSubscription) {
      this.urlSubscription.remove();
      this.urlSubscription = null;
    }
  }
}

// Singleton instance
export const paymentDeepLinkHandler = new PaymentDeepLinkHandler();

