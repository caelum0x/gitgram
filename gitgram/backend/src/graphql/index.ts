/**
 * GraphQL server setup using Apollo Server 4 + graphql-http.
 *
 * Mount in src/index.ts (after existing middleware):
 *
 *   import { applyGraphQL } from './graphql';
 *   applyGraphQL(app);
 *
 * Endpoint: POST /graphql
 * Playground (dev only): GET /graphql  → Apollo Sandbox redirect
 */

import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import type {
  GraphQLRequestContext,
  GraphQLRequestListener,
} from '@apollo/server';
import type { Express, Request } from 'express';
import DataLoader from 'dataloader';
import { typeDefs } from './schema';
import { resolvers } from './resolvers';
import prisma from '../utils/prisma';
import { verifyAccessToken } from '../utils/jwt';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/** Loaders that batch & cache DB reads within a single GraphQL request. */
export interface GraphQLLoaders {
  userById: DataLoader<string, UserShape | null>;
}

export interface GraphQLContext {
  userId: string | null;
  loaders: GraphQLLoaders;
}

// Minimal user shape used by DataLoader (mirrors mapUser inputs in resolvers).
interface UserShape {
  id: string;
  username: string | null;
  displayName?: string | null;
  avatar: string | null;
  bio?: string | null;
  verified: boolean;
  _count: { followers: number; following: number };
  subscription: { tier: string } | null;
}

/** Build per-request DataLoaders to batch Prisma queries and avoid N+1 problems. */
function buildLoaders(): GraphQLLoaders {
  const userById = new DataLoader<string, UserShape | null>(async (ids: readonly string[]) => {
    const users = await prisma.user.findMany({
      where: { id: { in: ids as string[] } },
      include: {
        _count: { select: { followers: true, following: true } },
        subscription: { select: { tier: true } },
      },
    });

    const byId = new Map<string, UserShape>();
    for (const u of users as Array<typeof users[0]>) {
      byId.set(u.id, {
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        avatar: u.avatar,
        bio: u.bio,
        verified: u.verified,
        _count: u._count,
        subscription: u.subscription,
      });
    }

    // DataLoader requires the result array to be in the same order as the keys.
    return ids.map((id) => byId.get(id) ?? null);
  });

  return { userById };
}

/** Extract userId from JWT stored in httpOnly cookie or Authorization header. */
function extractUserId(req: Request): string | null {
  try {
    const token =
      (req as Request & { cookies?: Record<string, string> }).cookies?.token ??
      req.headers.authorization?.replace('Bearer ', '');
    if (!token) return null;
    const payload = verifyAccessToken(token);
    return payload.userId ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Apollo Server instance (created once at module load time)
// ---------------------------------------------------------------------------

const server = new ApolloServer<GraphQLContext>({
  typeDefs,
  resolvers,
  // Show stack traces only in development
  includeStacktraceInErrorResponses: process.env.NODE_ENV !== 'production',
  // Disable built-in landing page in production; Apollo Sandbox is served in dev
  introspection: process.env.NODE_ENV !== 'production',
  plugins: [
    {
      async requestDidStart(
        requestContext: GraphQLRequestContext<GraphQLContext>,
      ): Promise<GraphQLRequestListener<GraphQLContext>> {
        const operationName = requestContext.request.operationName ?? '(anonymous)';
        const start = Date.now();
        return {
          async willSendResponse() {
            logger.info(`GraphQL ${operationName} completed in ${Date.now() - start}ms`);
          },
          async didEncounterErrors(errContext) {
            for (const err of errContext.errors) {
              logger.error(`GraphQL error in ${operationName}: ${err.message}`);
            }
          },
        };
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Mount function
// ---------------------------------------------------------------------------

/**
 * Start Apollo Server and attach it to the Express app at /graphql.
 * Call this once, after all other middleware is registered.
 */
export async function applyGraphQL(app: Express): Promise<void> {
  await server.start();

  app.use(
    '/graphql',
    // expressMiddleware handles JSON parsing internally, but the app-level
    // json() middleware runs first — this is fine for Apollo Server 4.
    expressMiddleware(server, {
      context: async ({ req }: { req: Request }): Promise<GraphQLContext> => ({
        userId: extractUserId(req),
        loaders: buildLoaders(),
      }),
    })
  );

  logger.info('GraphQL endpoint mounted at /graphql');
}

export { server as apolloServer };
