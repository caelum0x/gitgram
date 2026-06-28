/**
 * Local type override for @apollo/server/express4.
 *
 * The package is in the workspace root's node_modules and resolves its `express`
 * import against @types/express v4. The backend uses @types/express v5.
 * This declaration re-declares the public surface using the backend's Express 5 types.
 */
declare module '@apollo/server/express4' {
  import type { Request, RequestHandler, Response } from 'express';
  import type { ApolloServer } from '@apollo/server';
  import type { BaseContext } from '@apollo/server';

  export type ContextFunction<TArgs extends unknown[], TContext extends BaseContext> = (
    ...args: TArgs
  ) => Promise<TContext>;

  export interface ExpressContextFunctionArgument {
    req: Request;
    res: Response;
  }

  export interface ExpressMiddlewareOptions<TContext extends BaseContext> {
    context?: ContextFunction<[ExpressContextFunctionArgument], TContext>;
  }

  export function expressMiddleware(
    server: ApolloServer<BaseContext>,
    options?: ExpressMiddlewareOptions<BaseContext>,
  ): RequestHandler;

  export function expressMiddleware<TContext extends BaseContext>(
    server: ApolloServer<TContext>,
    options: ExpressMiddlewareOptions<TContext> & {
      context: ContextFunction<[ExpressContextFunctionArgument], TContext>;
    },
  ): RequestHandler;
}
