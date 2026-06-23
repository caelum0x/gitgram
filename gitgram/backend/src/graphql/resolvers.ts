/**
 * GraphQL Resolvers
 *
 * Implements every Query and Mutation declared in schema.ts.
 * Uses Prisma directly for data access, mirroring the patterns
 * established in the REST controllers.
 */

import { GraphQLScalarType, Kind } from 'graphql';
import type { GraphQLResolveInfo } from 'graphql';
import prisma from '../utils/prisma';
import { FeedService } from '../services/feedService';
import { blockService } from '../services/blockService';
import logger from '../utils/logger';
import type { GraphQLContext } from './index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert an opaque base64 cursor to a post creation date for Prisma's skip. */
function decodeCursor(cursor: string): Date {
  return new Date(Buffer.from(cursor, 'base64').toString('utf-8'));
}

/** Encode a post's createdAt timestamp as an opaque cursor. */
function encodeCursor(date: Date): string {
  return Buffer.from(date.toISOString()).toString('base64');
}

function requireAuth(ctx: GraphQLContext): string {
  if (!ctx.userId) {
    throw new Error('Authentication required');
  }
  return ctx.userId;
}

// ---------------------------------------------------------------------------
// Scalar: DateTime
// ---------------------------------------------------------------------------

const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'ISO-8601 date-time string',
  serialize(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    throw new Error(`DateTime scalar cannot serialize ${typeof value}`);
  },
  parseValue(value: unknown): Date {
    if (typeof value === 'string') return new Date(value);
    throw new Error('DateTime scalar expects a string value');
  },
  parseLiteral(ast: { kind: string; value?: string }): Date {
    if (ast.kind === Kind.STRING && ast.value !== undefined) return new Date(ast.value);
    throw new Error('DateTime scalar literal must be a string');
  },
});

// ---------------------------------------------------------------------------
// Shape helpers: map Prisma rows to GraphQL types
// ---------------------------------------------------------------------------

function mapUser(u: {
  id: string;
  username: string | null;
  displayName?: string | null;
  avatar: string | null;
  bio?: string | null;
  verified: boolean;
  _count?: { followers?: number; following?: number };
  subscription?: { tier: string } | null;
}) {
  return {
    id: u.id,
    username: u.username ?? '',
    displayName: u.displayName ?? null,
    avatar: u.avatar,
    bio: u.bio ?? null,
    followersCount: u._count?.followers ?? 0,
    followingCount: u._count?.following ?? 0,
    isVerified: u.verified,
    tier: (u.subscription?.tier ?? 'free') as 'free' | 'pro' | 'enterprise',
  };
}

function mapPost(p: {
  id: string;
  content: string;
  userId: string | null;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  createdAt: Date;
  user?: {
    id: string;
    username: string | null;
    displayName?: string | null;
    avatar: string | null;
    bio?: string | null;
    verified: boolean;
    _count?: { followers?: number; following?: number };
    subscription?: { tier: string } | null;
  } | null;
  hashtags?: Array<{ hashtag: { name: string } }>;
}) {
  return {
    id: p.id,
    content: p.content,
    author: p.user ? mapUser(p.user) : { id: p.userId ?? '', username: '' },
    likes: p.likesCount,
    commentsCount: p.commentsCount,
    repostsCount: p.sharesCount,
    hashtags: (p.hashtags ?? []).map((ph) => ph.hashtag.name),
    createdAt: p.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Query resolvers
// ---------------------------------------------------------------------------

const feedServiceInstance = new FeedService();

const Query = {
  async user(
    _parent: unknown,
    args: { username: string },
    _ctx: GraphQLContext,
    _info: GraphQLResolveInfo
  ) {
    const user = await prisma.user.findUnique({
      where: { username: args.username },
      include: {
        _count: { select: { followers: true, following: true } },
        subscription: { select: { tier: true } },
      },
    });
    return user ? mapUser(user) : null;
  },

  async post(
    _parent: unknown,
    args: { id: string },
    _ctx: GraphQLContext,
    _info: GraphQLResolveInfo
  ) {
    const post = await prisma.post.findUnique({
      where: { id: args.id },
      include: {
        user: {
          include: {
            _count: { select: { followers: true, following: true } },
            subscription: { select: { tier: true } },
          },
        },
        hashtags: { include: { hashtag: { select: { name: true } } } },
      },
    });
    return post ? mapPost(post) : null;
  },

  async posts(
    _parent: unknown,
    args: { userId?: string; limit?: number; cursor?: string },
    ctx: GraphQLContext,
    _info: GraphQLResolveInfo
  ) {
    const limit = Math.min(args.limit ?? 20, 100);
    const cursorDate = args.cursor ? decodeCursor(args.cursor) : undefined;

    const where: Record<string, unknown> = {
      type: 'POST',
      isArchived: false,
    };
    if (args.userId) where.userId = args.userId;
    if (cursorDate) where.createdAt = { lt: cursorDate };

    // Exclude blocked users when viewer is authenticated
    if (ctx.userId) {
      const blockedIds = await blockService.getAllBlockedIds(ctx.userId);
      if (blockedIds.length > 0) {
        where.userId = { notIn: blockedIds, ...(args.userId ? { equals: args.userId } : {}) };
      }
    }

    const [posts, totalCount] = await Promise.all([
      prisma.post.findMany({
        where,
        include: {
          user: {
            include: {
              _count: { select: { followers: true, following: true } },
              subscription: { select: { tier: true } },
            },
          },
          hashtags: { include: { hashtag: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
      }),
      prisma.post.count({ where }),
    ]);

    const hasNextPage = posts.length > limit;
    const items = hasNextPage ? posts.slice(0, limit) : posts;

    const edges = items.map((p) => ({
      cursor: encodeCursor(p.createdAt),
      node: mapPost(p),
    }));

    return {
      edges,
      pageInfo: {
        hasNextPage,
        endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
      },
      totalCount,
    };
  },

  async repository(
    _parent: unknown,
    args: { owner: string; name: string },
    _ctx: GraphQLContext,
    _info: GraphQLResolveInfo
  ) {
    const repo = await prisma.repository.findUnique({
      where: { owner_name: { owner: args.owner, name: args.name } },
    });
    if (!repo) return null;

    // The repository owner is the user who claimed it, or we synthesise a stub
    let owner = null;
    if (repo.claimedBy) {
      owner = await prisma.user.findUnique({
        where: { id: repo.claimedBy },
        include: {
          _count: { select: { followers: true, following: true } },
          subscription: { select: { tier: true } },
        },
      });
    }

    return {
      id: repo.id,
      fullName: repo.fullName,
      description: repo.description,
      stars: repo.stars,
      forks: repo.forks,
      language: repo.language,
      isPrivate: false, // GitHub public repos only tracked currently
      owner: owner
        ? mapUser(owner)
        : { id: args.owner, username: args.owner, isVerified: false, tier: 'free', followersCount: 0, followingCount: 0 },
    };
  },

  async feed(
    _parent: unknown,
    args: { limit?: number; cursor?: string },
    ctx: GraphQLContext,
    _info: GraphQLResolveInfo
  ) {
    const userId = requireAuth(ctx);
    const limit = Math.min(args.limit ?? 20, 100);

    // Use cursor → page number mapping (FeedService uses page-based pagination)
    const page = args.cursor ? parseInt(Buffer.from(args.cursor, 'base64').toString('utf-8'), 10) : 1;

    const raw = await feedServiceInstance.getPersonalizedFeed(userId, page, limit);
    const posts: unknown[] = Array.isArray(raw) ? raw : (raw as { posts?: unknown[] }).posts ?? [];

    const mappedPosts = (posts as Array<{
      id: string;
      content: string;
      userId: string | null;
      likesCount: number;
      commentsCount: number;
      sharesCount: number;
      createdAt: Date;
      user?: {
        id: string;
        username: string | null;
        avatar: string | null;
        verified: boolean;
      } | null;
    }>).map((p) => ({
      cursor: encodeCursor(p.createdAt),
      node: mapPost(p),
    }));

    const nextPage = page + 1;
    const hasNextPage = mappedPosts.length >= limit;

    return {
      edges: mappedPosts,
      pageInfo: {
        hasNextPage,
        endCursor: hasNextPage ? Buffer.from(String(nextPage)).toString('base64') : null,
      },
      totalCount: mappedPosts.length,
    };
  },

  async trending(
    _parent: unknown,
    _args: Record<string, never>,
    _ctx: GraphQLContext,
    _info: GraphQLResolveInfo
  ) {
    const [trendingPosts, trendingRepos, trendingUsers] = await Promise.all([
      prisma.post.findMany({
        where: { type: 'POST', isArchived: false },
        include: {
          user: {
            include: {
              _count: { select: { followers: true, following: true } },
              subscription: { select: { tier: true } },
            },
          },
          hashtags: { include: { hashtag: { select: { name: true } } } },
        },
        orderBy: { likesCount: 'desc' },
        take: 10,
      }),
      prisma.repository.findMany({
        where: { trending: true },
        orderBy: { trendingScore: 'desc' },
        take: 10,
      }),
      prisma.user.findMany({
        where: { isBanned: false },
        include: {
          _count: { select: { followers: true, following: true } },
          subscription: { select: { tier: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    return {
      posts: trendingPosts.map(mapPost),
      repositories: trendingRepos.map((r) => ({
        id: r.id,
        fullName: r.fullName,
        description: r.description,
        stars: r.stars,
        forks: r.forks,
        language: r.language,
        isPrivate: false,
        owner: { id: r.owner, username: r.owner, isVerified: false, tier: 'free', followersCount: 0, followingCount: 0 },
      })),
      users: trendingUsers.map(mapUser),
    };
  },
};

// ---------------------------------------------------------------------------
// Mutation resolvers
// ---------------------------------------------------------------------------

const Mutation = {
  async createPost(
    _parent: unknown,
    args: { input: { content: string; hashtags?: string[]; repoOwner?: string; repoName?: string; mediaUrls?: string[] } },
    ctx: GraphQLContext,
    _info: GraphQLResolveInfo
  ) {
    const userId = requireAuth(ctx);

    const account = await prisma.account.findFirst({ where: { userId } });
    if (!account) throw new Error('Account not found');

    let repositoryId: string | null = null;
    if (args.input.repoOwner && args.input.repoName) {
      const repo = await prisma.repository.findUnique({
        where: { owner_name: { owner: args.input.repoOwner, name: args.input.repoName } },
      });
      if (repo) repositoryId = repo.id;
    }

    const post = await prisma.post.create({
      data: {
        accountId: account.id,
        userId,
        content: args.input.content,
        mediaUrls: args.input.mediaUrls ?? [],
        repositoryId,
        type: 'POST',
      },
      include: {
        user: {
          include: {
            _count: { select: { followers: true, following: true } },
            subscription: { select: { tier: true } },
          },
        },
        hashtags: { include: { hashtag: { select: { name: true } } } },
      },
    });

    logger.info(`GraphQL createPost: postId=${post.id} userId=${userId}`);
    return mapPost(post);
  },

  async likePost(
    _parent: unknown,
    args: { postId: string },
    ctx: GraphQLContext,
    _info: GraphQLResolveInfo
  ) {
    const userId = requireAuth(ctx);

    const account = await prisma.account.findFirst({ where: { userId } });
    if (!account) throw new Error('Account not found');

    const existing = await prisma.like.findFirst({
      where: { postId: args.postId, accountId: account.id },
    });

    let updatedPost;
    if (existing) {
      // Unlike: remove the like and decrement counter
      await prisma.$transaction([
        prisma.like.delete({ where: { id: existing.id } }),
        prisma.post.update({
          where: { id: args.postId },
          data: { likesCount: { decrement: 1 } },
        }),
      ]);
    } else {
      // Like: create the like and increment counter
      await prisma.$transaction([
        prisma.like.create({ data: { postId: args.postId, accountId: account.id, userId } }),
        prisma.post.update({
          where: { id: args.postId },
          data: { likesCount: { increment: 1 } },
        }),
      ]);
    }

    updatedPost = await prisma.post.findUniqueOrThrow({
      where: { id: args.postId },
      include: {
        user: {
          include: {
            _count: { select: { followers: true, following: true } },
            subscription: { select: { tier: true } },
          },
        },
        hashtags: { include: { hashtag: { select: { name: true } } } },
      },
    });

    return mapPost(updatedPost);
  },

  async followUser(
    _parent: unknown,
    args: { userId: string },
    ctx: GraphQLContext,
    _info: GraphQLResolveInfo
  ) {
    const currentUserId = requireAuth(ctx);
    if (currentUserId === args.userId) throw new Error('Cannot follow yourself');

    const existing = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: currentUserId, followingId: args.userId } },
    });

    if (existing) {
      await prisma.follow.delete({ where: { id: existing.id } });
    } else {
      await prisma.follow.create({
        data: { followerId: currentUserId, followingId: args.userId },
      });
    }

    const target = await prisma.user.findUniqueOrThrow({
      where: { id: args.userId },
      include: {
        _count: { select: { followers: true, following: true } },
        subscription: { select: { tier: true } },
      },
    });

    return mapUser(target);
  },
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const resolvers = {
  DateTime: DateTimeScalar,
  Query,
  Mutation,
};
