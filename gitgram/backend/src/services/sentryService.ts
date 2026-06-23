import * as Sentry from '@sentry/node';

export const initSentry = (app: any) => {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    });
  }
};

export const sentryRequestHandler = () => (req: any, res: any, next: any) => next();
export const sentryTracingHandler = () => (req: any, res: any, next: any) => next();
export const sentryErrorHandler = () => (err: any, req: any, res: any, next: any) => next(err);

export default Sentry;
