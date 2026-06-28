/**
 * Local type override for @trpc/server/adapters/express.
 *
 * The package is in the workspace root's node_modules and resolves its `express`
 * import against @types/express v4. The backend uses @types/express v5.
 * This declaration re-declares the adapter's public surface using the
 * backend's Express 5 types so createExpressMiddleware and its context
 * factory type are structurally compatible.
 */
declare module '@trpc/server/adapters/express' {
  import type { NextFunction, Request, RequestHandler, Response } from 'express';
  // Re-use AnyRouter from the tRPC core so callers can still pass typed routers.
  import type { AnyRouter } from '@trpc/server';

  export type CreateExpressContextOptions = {
    req: Request;
    res: Response;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type NodeHTTPCreateContextFn<TRouter extends AnyRouter> = (
    opts: CreateExpressContextOptions,
  ) => Promise<object>;

  export interface ExpressMiddlewareOptions<TRouter extends AnyRouter> {
    router: TRouter;
    createContext?: (opts: CreateExpressContextOptions) => Promise<object>;
    onError?: (opts: {
      error: Error;
      type: string;
      path: string;
      input: unknown;
      ctx: unknown;
      req: Request;
    }) => void;
  }

  export function createExpressMiddleware<TRouter extends AnyRouter>(
    opts: ExpressMiddlewareOptions<TRouter>,
  ): RequestHandler;
}
