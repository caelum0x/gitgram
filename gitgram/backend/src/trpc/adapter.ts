/**
 * Express adapter for the tRPC appRouter.
 *
 * Mount this middleware in src/index.ts (or wherever Express is configured):
 *
 *   import { trpcMiddleware } from './trpc/adapter';
 *   app.use('/trpc', trpcMiddleware);
 *
 * All existing REST routes remain untouched.
 *
 * Required packages (add to package.json if not already present):
 *   "@trpc/server": "^11.0.0"
 *   "zod": "^3.22.0"
 */

import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter, createContext } from './index';

/**
 * Ready-to-mount Express middleware that handles all tRPC requests.
 * Mount at a path such as `/trpc` so calls look like `/trpc/post.getFeed`.
 */
export const trpcMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext,
});
