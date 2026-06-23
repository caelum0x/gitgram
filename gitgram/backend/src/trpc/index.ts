/**
 * tRPC entry point for the Gitgram backend.
 *
 * Exports:
 *   - `appRouter`    — the merged application router
 *   - `AppRouter`    — the inferred type (used by the client for end-to-end types)
 *   - `createContext` — the Express context factory
 *   - `trpcMiddleware` — ready-to-mount Express middleware
 *
 * Mount in src/index.ts:
 *
 *   import { trpcMiddleware } from './trpc';
 *   app.use('/trpc', trpcMiddleware);
 */

import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './router';
import { createContext } from './context';

export { appRouter } from './router';
export type { AppRouter } from './router';
export { createContext } from './context';
export type { Context } from './context';

/**
 * Pre-built Express middleware.  Drop this directly onto the Express app:
 *
 *   app.use('/trpc', trpcMiddleware);
 *
 * Every tRPC call will be available at `/trpc/<router>.<procedure>`.
 */
export const trpcMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext,
});
