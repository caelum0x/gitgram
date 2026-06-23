// Error tracking utility (Sentry-ready)
// For production, install: npm install @sentry/node @sentry/integrations

import logger from './logger';

interface ErrorContext {
  userId?: string;
  requestId?: string;
  endpoint?: string;
  method?: string;
  body?: any;
  query?: any;
  params?: any;
}

class ErrorTracker {
  private initialized: boolean = false;

  initialize() {
    if (process.env.SENTRY_DSN) {
      try {
        // Initialize Sentry if DSN is provided
        const Sentry = require('@sentry/node');
        const { Integrations } = require('@sentry/integrations');

        Sentry.init({
          dsn: process.env.SENTRY_DSN,
          environment: process.env.NODE_ENV || 'development',
          integrations: [
            new Integrations.Http({ tracing: true }),
            new Integrations.Express({ app: require('../index').app }),
          ],
          tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
          beforeSend(event: any, hint: any) {
            // Filter out sensitive data
            if (event.request) {
              if (event.request.cookies) {
                delete event.request.cookies;
              }
              if (event.request.headers) {
                delete event.request.headers.authorization;
              }
            }
            return event;
          },
        });

        this.initialized = true;
        logger.info('Sentry initialized');
      } catch (error) {
        logger.warn('Sentry not available, using console logging');
        this.initialized = false;
      }
    } else {
      this.initialized = false;
    }
  }

  captureException(error: Error, context?: ErrorContext) {
    if (this.initialized) {
      try {
        const Sentry = require('@sentry/node');
        
        Sentry.withScope((scope: any) => {
          if (context?.userId) {
            scope.setUser({ id: context.userId });
          }
          if (context?.requestId) {
            scope.setTag('requestId', context.requestId);
          }
          if (context?.endpoint) {
            scope.setTag('endpoint', context.endpoint);
          }
          if (context?.method) {
            scope.setTag('method', context.method);
          }
          if (context?.body) {
            scope.setContext('body', context.body);
          }
          if (context?.query) {
            scope.setContext('query', context.query);
          }
          if (context?.params) {
            scope.setContext('params', context.params);
          }

          Sentry.captureException(error);
        });
      } catch (err) {
        logger.error('Failed to capture exception in Sentry:', err);
        this.logError(error, context);
      }
    } else {
      this.logError(error, context);
    }
  }

  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', context?: ErrorContext) {
    if (this.initialized) {
      try {
        const Sentry = require('@sentry/node');
        
        Sentry.withScope((scope: any) => {
          if (context?.userId) {
            scope.setUser({ id: context.userId });
          }
          if (context?.requestId) {
            scope.setTag('requestId', context.requestId);
          }

          Sentry.captureMessage(message, level);
        });
      } catch (err) {
        logger.error('Failed to capture message in Sentry:', err);
        this.logMessage(message, level, context);
      }
    } else {
      this.logMessage(message, level, context);
    }
  }

  setUser(userId: string, userData?: { email?: string; username?: string }) {
    if (this.initialized) {
      try {
        const Sentry = require('@sentry/node');
        Sentry.setUser({
          id: userId,
          email: userData?.email,
          username: userData?.username,
        });
      } catch (err) {
        // Ignore errors
      }
    }
  }

  private logError(error: Error, context?: ErrorContext) {
    logger.error('Error:', {
      message: error.message,
      stack: error.stack,
      context,
    });
  }

  private logMessage(message: string, level: string, context?: ErrorContext) {
    const logMethod = level === 'error' ? logger.error.bind(logger) : level === 'warning' ? logger.warn.bind(logger) : logger.info.bind(logger);
    logMethod(`[${level.toUpperCase()}] ${message}`, context || '');
  }
}

export const errorTracker = new ErrorTracker();

// Initialize on import if SENTRY_DSN is set
if (process.env.SENTRY_DSN) {
  errorTracker.initialize();
}

