// Analytics utility (Mixpanel/Amplitude ready)
// For production, install: npm install mixpanel or npm install @amplitude/analytics-node

import logger from './logger';

interface AnalyticsEvent {
  event: string;
  properties?: Record<string, any>;
  userId?: string;
}

class Analytics {
  private initialized: boolean = false;
  private client: any = null;
  private provider: 'mixpanel' | 'amplitude' | 'console' = 'console';

  initialize(provider: 'mixpanel' | 'amplitude' = 'mixpanel', config: any = {}) {
    try {
      if (provider === 'mixpanel' && config.token) {
        const Mixpanel = require('mixpanel');
        this.client = Mixpanel.init(config.token, {
          host: config.host || 'api.mixpanel.com',
        });
        this.provider = 'mixpanel';
        this.initialized = true;
        logger.info('Mixpanel initialized');
      } else if (provider === 'amplitude' && config.apiKey) {
        const { init } = require('@amplitude/analytics-node');
        this.client = init(config.apiKey, {
          serverUrl: config.serverUrl,
        });
        this.provider = 'amplitude';
        this.initialized = true;
        logger.info('Amplitude initialized');
      } else {
        this.provider = 'console';
        this.initialized = false;
        logger.info('Analytics not configured, using console logging');
      }
    } catch (error) {
      logger.warn('Analytics initialization failed:', error);
      this.provider = 'console';
      this.initialized = false;
    }
  }

  track(event: string, properties?: Record<string, any>, userId?: string) {
    const analyticsEvent: AnalyticsEvent = {
      event,
      properties,
      userId,
    };

    if (this.initialized && this.client) {
      try {
        if (this.provider === 'mixpanel') {
          if (userId) {
            this.client.people.set(userId, properties || {});
          }
          this.client.track(event, {
            ...properties,
            distinct_id: userId,
            time: new Date(),
          });
        } else if (this.provider === 'amplitude') {
          this.client.logEvent({
            event_type: event,
            user_id: userId,
            event_properties: properties,
            time: Date.now(),
          });
        }
      } catch (error) {
        logger.error('Analytics track error:', error);
        this.logEvent(analyticsEvent);
      }
    } else {
      this.logEvent(analyticsEvent);
    }
  }

  identify(userId: string, traits?: Record<string, any>) {
    if (this.initialized && this.client) {
      try {
        if (this.provider === 'mixpanel') {
          this.client.people.set(userId, traits || {});
        } else if (this.provider === 'amplitude') {
          this.client.setUserId(userId);
          if (traits) {
            this.client.setUserProperties(traits);
          }
        }
      } catch (error) {
        logger.error('Analytics identify error:', error);
      }
    }
  }

  page(name: string, properties?: Record<string, any>, userId?: string) {
    this.track(`Page Viewed: ${name}`, properties, userId);
  }

  private logEvent(event: AnalyticsEvent) {
    if (process.env.NODE_ENV === 'development') {
      logger.info('[Analytics]', event);
    }
  }
}

export const analytics = new Analytics();

// Initialize if configured
if (process.env.MIXPANEL_TOKEN) {
  analytics.initialize('mixpanel', {
    token: process.env.MIXPANEL_TOKEN,
    host: process.env.MIXPANEL_HOST,
  });
} else if (process.env.AMPLITUDE_API_KEY) {
  analytics.initialize('amplitude', {
    apiKey: process.env.AMPLITUDE_API_KEY,
    serverUrl: process.env.AMPLITUDE_SERVER_URL,
  });
}

// Common event tracking helpers
export const trackUserAction = (
  action: string,
  userId: string,
  properties?: Record<string, any>
) => {
  analytics.track(`User Action: ${action}`, properties, userId);
};

export const trackAPIUsage = (
  endpoint: string,
  method: string,
  responseTime: number,
  statusCode: number,
  userId?: string
) => {
  analytics.track('API Request', {
    endpoint,
    method,
    responseTime,
    statusCode,
    success: statusCode < 400,
  }, userId);
};

export const trackFeatureUsage = (
  feature: string,
  userId: string,
  properties?: Record<string, any>
) => {
  analytics.track(`Feature Used: ${feature}`, properties, userId);
};

export const trackError = (
  error: Error,
  context?: Record<string, any>,
  userId?: string
) => {
  analytics.track('Error Occurred', {
    error: error.message,
    stack: error.stack,
    ...context,
  }, userId);
};

