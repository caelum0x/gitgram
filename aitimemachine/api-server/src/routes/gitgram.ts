import crypto from "crypto";
import { Router } from "express";
import { and, desc, eq, gte, inArray, isNotNull, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { logger } from "../lib/monitoring.js";

const router = Router();
router.use(apiKeyAuth);

const importRepoSchema = z.object({
  projectId: z.string().min(1),
  owner: z.string().min(1),
  name: z.string().min(1),
  repositoryId: z.string().min(1).optional(),
  rootPath: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const createPostSchema = z.object({
  repositoryId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  type: z.enum(["post", "reel", "story", "change_story", "snippet"]),
  caption: z.string().max(5000).optional(),
  codeSnippet: z.string().optional(),
  language: z.string().max(128).optional(),
  linkedCheckpointId: z.string().min(1).optional(),
  visibility: z.enum(["public", "followers", "private"]).default("public"),
  publishNow: z.boolean().default(true),
  assets: z
    .array(
      z.object({
        mediaType: z.enum(["image", "video", "gif"]),
        storageKey: z.string().min(1),
        mimeType: z.string().optional(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
        durationMs: z.number().int().nonnegative().optional(),
      })
    )
    .max(10)
    .default([]),
});

const listPostsQuerySchema = z.object({
  repositoryId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  authorUserId: z.string().min(1).optional(),
  type: z.enum(["post", "reel", "story", "change_story", "snippet"]).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const createCommentSchema = z.object({
  postId: z.string().uuid().optional(),
  body: z.string().min(1).max(2000),
  parentCommentId: z.string().uuid().optional(),
});

const reactSchema = z.object({
  targetType: z.enum(["post", "comment", "repository"]),
  targetId: z.string().min(1),
  reaction: z.enum(["like", "love", "fire", "clap", "rocket"]).default("like"),
  active: z.boolean().default(true),
});

const followSchema = z
  .object({
    targetType: z.enum(["user", "repository"]),
    targetUserId: z.string().min(1).optional(),
    targetRepositoryId: z.string().min(1).optional(),
  })
  .refine(
    (value) =>
      (value.targetType === "user" && !!value.targetUserId && !value.targetRepositoryId) ||
      (value.targetType === "repository" && !!value.targetRepositoryId && !value.targetUserId),
    {
      message: "Provide targetUserId for user follows or targetRepositoryId for repository follows",
      path: ["targetType"],
    }
  );

const trendingQuerySchema = z.object({
  windowDays: z.coerce.number().int().positive().max(90).default(7),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

function canonicalRepoId(owner: string, name: string): string {
  const raw = `${owner}/${name}`.toLowerCase();
  const safe = raw.replace(/[^a-z0-9/_-]/g, "-").replace(/\//g, "_");
  const hash = crypto.createHash("sha1").update(raw).digest("hex").slice(0, 8);
  return `repo_${safe}_${hash}`;
}

async function ensureProjectOwned(userId: string, projectId: string) {
  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);

  return project;
}

async function ensureRepositoryAccess(userId: string, repositoryId: string) {
  const [repo] = await db
    .select({ id: schema.repositories.id, userId: schema.repositories.userId })
    .from(schema.repositories)
    .where(eq(schema.repositories.id, repositoryId))
    .limit(1);

  if (!repo) return null;
  if (repo.userId !== userId) return null;
  return repo;
}

router.post("/repos/import", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const payload = importRepoSchema.parse(req.body);

    const project = await ensureProjectOwned(userId, payload.projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const repositoryId = payload.repositoryId || canonicalRepoId(payload.owner, payload.name);

    const [existingRepo] = await db
      .select({ id: schema.repositories.id, userId: schema.repositories.userId })
      .from(schema.repositories)
      .where(eq(schema.repositories.id, repositoryId))
      .limit(1);

    if (existingRepo && existingRepo.userId !== userId) {
      return res.status(409).json({ error: "Repository already exists under another account" });
    }

    const rootPath = payload.rootPath || `/github/${payload.owner}/${payload.name}`;

    await db
      .insert(schema.repositories)
      .values({
        id: repositoryId,
        projectId: payload.projectId,
        userId,
        name: `${payload.owner}/${payload.name}`,
        rootPath,
        metadata: {
          provider: "github",
          owner: payload.owner,
          repo: payload.name,
          ...(payload.metadata || {}),
        },
      })
      .onConflictDoUpdate({
        target: schema.repositories.id,
        set: {
          name: `${payload.owner}/${payload.name}`,
          projectId: payload.projectId,
          rootPath,
          metadata: {
            provider: "github",
            owner: payload.owner,
            repo: payload.name,
            ...(payload.metadata || {}),
          },
          updatedAt: new Date(),
        },
      });

    await db
      .insert(schema.projectRepositories)
      .values({
        projectId: payload.projectId,
        repositoryId,
      })
      .onConflictDoNothing();

    await db
      .insert(schema.repoProfiles)
      .values({
        repositoryId,
      })
      .onConflictDoNothing();

    return res.status(201).json({
      success: true,
      repository: {
        id: repositoryId,
        owner: payload.owner,
        name: payload.name,
        fullName: `${payload.owner}/${payload.name}`,
        projectId: payload.projectId,
        rootPath,
      },
    });
  } catch (error) {
    logger.error("gitgram repo import error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid repo import request" });
  }
});

router.post("/posts", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const payload = createPostSchema.parse(req.body);

    if (!payload.projectId && !payload.repositoryId) {
      return res.status(400).json({ error: "Either projectId or repositoryId is required" });
    }

    if (payload.projectId) {
      const project = await ensureProjectOwned(userId, payload.projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
    }

    if (payload.repositoryId) {
      const repo = await ensureRepositoryAccess(userId, payload.repositoryId);
      if (!repo) {
        return res.status(404).json({ error: "Repository not found" });
      }
    }

    const [post] = await db
      .insert(schema.posts)
      .values({
        authorUserId: userId,
        repositoryId: payload.repositoryId || null,
        projectId: payload.projectId || null,
        type: payload.type,
        caption: payload.caption || null,
        codeSnippet: payload.codeSnippet || null,
        language: payload.language || null,
        linkedCheckpointId: payload.linkedCheckpointId || null,
        visibility: payload.visibility,
        publishedAt: payload.publishNow ? new Date() : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    if (payload.assets.length > 0) {
      await db.insert(schema.postAssets).values(
        payload.assets.map((asset, idx) => ({
          postId: post.id,
          mediaType: asset.mediaType,
          storageKey: asset.storageKey,
          mimeType: asset.mimeType || null,
          width: asset.width || null,
          height: asset.height || null,
          durationMs: asset.durationMs || null,
          position: idx,
          createdAt: new Date(),
        }))
      );
    }

    return res.status(201).json({
      success: true,
      post: {
        id: post.id,
        repositoryId: post.repositoryId,
        projectId: post.projectId,
        type: post.type,
        caption: post.caption,
        codeSnippet: post.codeSnippet,
        language: post.language,
        linkedCheckpointId: post.linkedCheckpointId,
        visibility: post.visibility,
        publishedAt: post.publishedAt,
        createdAt: post.createdAt,
      },
    });
  } catch (error) {
    logger.error("gitgram create post error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid post request" });
  }
});

router.get("/posts", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const query = listPostsQuerySchema.parse(req.query);

    const conditions: any[] = [];

    if (query.repositoryId) {
      conditions.push(eq(schema.posts.repositoryId, query.repositoryId));
    }
    if (query.projectId) {
      const project = await ensureProjectOwned(userId, query.projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      conditions.push(eq(schema.posts.projectId, query.projectId));
    }
    if (query.authorUserId) {
      conditions.push(eq(schema.posts.authorUserId, query.authorUserId));
    }
    if (query.type) {
      conditions.push(eq(schema.posts.type, query.type));
    }

    conditions.push(
      or(
        eq(schema.posts.visibility, "public"),
        and(eq(schema.posts.visibility, "private"), eq(schema.posts.authorUserId, userId)),
        and(eq(schema.posts.visibility, "followers"), eq(schema.posts.authorUserId, userId))
      )
    );

    const posts = await db
      .select()
      .from(schema.posts)
      .where(and(...conditions))
      .orderBy(desc(schema.posts.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    const postIds = posts.map((p: any) => p.id);
    const [assets, comments, reactions] = await Promise.all([
      postIds.length > 0
        ? db
            .select()
            .from(schema.postAssets)
            .where(inArray(schema.postAssets.postId, postIds))
            .orderBy(schema.postAssets.position)
        : Promise.resolve([]),
      postIds.length > 0
        ? db
            .select({ id: schema.comments.id, postId: schema.comments.postId })
            .from(schema.comments)
            .where(inArray(schema.comments.postId, postIds))
        : Promise.resolve([]),
      postIds.length > 0
        ? db
            .select({ id: schema.reactions.id, targetId: schema.reactions.targetId })
            .from(schema.reactions)
            .where(
              and(
                eq(schema.reactions.targetType, "post"),
                inArray(schema.reactions.targetId, postIds)
              )
            )
        : Promise.resolve([]),
    ]);

    const assetsByPost = new Map<string, typeof assets>();
    for (const asset of assets) {
      const arr = assetsByPost.get(asset.postId) || [];
      arr.push(asset);
      assetsByPost.set(asset.postId, arr);
    }

    const commentCountByPost = new Map<string, number>();
    for (const c of comments) {
      commentCountByPost.set(c.postId, (commentCountByPost.get(c.postId) || 0) + 1);
    }

    const reactionCountByPost = new Map<string, number>();
    for (const r of reactions) {
      reactionCountByPost.set(r.targetId, (reactionCountByPost.get(r.targetId) || 0) + 1);
    }

    return res.json({
      success: true,
      posts: posts.map((post: any) => ({
        ...post,
        assets: assetsByPost.get(post.id) || [],
        counts: {
          comments: commentCountByPost.get(post.id) || 0,
          reactions: reactionCountByPost.get(post.id) || 0,
        },
      })),
      pagination: {
        limit: query.limit,
        offset: query.offset,
        hasMore: posts.length === query.limit,
      },
    });
  } catch (error) {
    logger.error("gitgram list posts error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid posts query" });
  }
});

router.get("/repos/:repositoryId/feed", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { repositoryId } = req.params;
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
    const offset = Math.max(Number(req.query.offset || 0), 0);

    const posts = await db
      .select()
      .from(schema.posts)
      .where(
        and(
          eq(schema.posts.repositoryId, repositoryId),
          or(
            eq(schema.posts.visibility, "public"),
            and(eq(schema.posts.visibility, "private"), eq(schema.posts.authorUserId, userId)),
            and(eq(schema.posts.visibility, "followers"), eq(schema.posts.authorUserId, userId))
          )
        )
      )
      .orderBy(desc(schema.posts.createdAt))
      .limit(limit)
      .offset(offset);

    const postIds = posts.map((p: any) => p.id);
    const [assets, comments, reactions] = await Promise.all([
      postIds.length > 0
        ? db
            .select()
            .from(schema.postAssets)
            .where(inArray(schema.postAssets.postId, postIds))
            .orderBy(schema.postAssets.position)
        : Promise.resolve([]),
      postIds.length > 0
        ? db
            .select({ id: schema.comments.id, postId: schema.comments.postId })
            .from(schema.comments)
            .where(inArray(schema.comments.postId, postIds))
        : Promise.resolve([]),
      postIds.length > 0
        ? db
            .select({ id: schema.reactions.id, targetId: schema.reactions.targetId })
            .from(schema.reactions)
            .where(
              and(
                eq(schema.reactions.targetType, "post"),
                inArray(schema.reactions.targetId, postIds)
              )
            )
        : Promise.resolve([]),
    ]);

    const assetsByPost = new Map<string, typeof assets>();
    for (const asset of assets) {
      const arr = assetsByPost.get(asset.postId) || [];
      arr.push(asset);
      assetsByPost.set(asset.postId, arr);
    }

    const commentCountByPost = new Map<string, number>();
    for (const c of comments) {
      commentCountByPost.set(c.postId, (commentCountByPost.get(c.postId) || 0) + 1);
    }

    const reactionCountByPost = new Map<string, number>();
    for (const r of reactions) {
      reactionCountByPost.set(r.targetId, (reactionCountByPost.get(r.targetId) || 0) + 1);
    }

    return res.json({
      success: true,
      repositoryId,
      feed: posts.map((post: any) => ({
        ...post,
        assets: assetsByPost.get(post.id) || [],
        counts: {
          comments: commentCountByPost.get(post.id) || 0,
          reactions: reactionCountByPost.get(post.id) || 0,
        },
      })),
      pagination: {
        limit,
        offset,
        hasMore: posts.length === limit,
      },
    });
  } catch (error) {
    logger.error("gitgram repo feed error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid repo feed request" });
  }
});

router.post("/posts/:postId/comments", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { postId } = req.params;
    const payload = createCommentSchema.parse(req.body);

    const [post] = await db
      .select({ id: schema.posts.id })
      .from(schema.posts)
      .where(eq(schema.posts.id, postId))
      .limit(1);

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    if (payload.parentCommentId) {
      const [parent] = await db
        .select({ id: schema.comments.id, postId: schema.comments.postId })
        .from(schema.comments)
        .where(eq(schema.comments.id, payload.parentCommentId))
        .limit(1);

      if (!parent || parent.postId !== postId) {
        return res.status(400).json({ error: "Invalid parentCommentId" });
      }
    }

    const [comment] = await db
      .insert(schema.comments)
      .values({
        postId,
        authorUserId: userId,
        parentCommentId: payload.parentCommentId || null,
        body: payload.body,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return res.status(201).json({ success: true, comment });
  } catch (error) {
    logger.error("gitgram create comment error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid comment request" });
  }
});

router.post("/comments", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const payload = createCommentSchema.parse(req.body);
    if (!payload.postId) {
      return res.status(400).json({ error: "postId is required" });
    }

    const [post] = await db
      .select({ id: schema.posts.id })
      .from(schema.posts)
      .where(eq(schema.posts.id, payload.postId))
      .limit(1);

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    if (payload.parentCommentId) {
      const [parent] = await db
        .select({ id: schema.comments.id, postId: schema.comments.postId })
        .from(schema.comments)
        .where(eq(schema.comments.id, payload.parentCommentId))
        .limit(1);

      if (!parent || parent.postId !== payload.postId) {
        return res.status(400).json({ error: "Invalid parentCommentId" });
      }
    }

    const [comment] = await db
      .insert(schema.comments)
      .values({
        postId: payload.postId,
        authorUserId: userId,
        parentCommentId: payload.parentCommentId || null,
        body: payload.body,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return res.status(201).json({ success: true, comment });
  } catch (error) {
    logger.error("gitgram create comment error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid comment request" });
  }
});

router.get("/posts/:postId/comments", async (req: AuthenticatedRequest, res) => {
  try {
    const { postId } = req.params;
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 200);
    const offset = Math.max(Number(req.query.offset || 0), 0);

    const comments = await db
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.postId, postId))
      .orderBy(desc(schema.comments.createdAt))
      .limit(limit)
      .offset(offset);

    return res.json({
      success: true,
      comments,
      pagination: {
        limit,
        offset,
        hasMore: comments.length === limit,
      },
    });
  } catch (error) {
    logger.error("gitgram list comments error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid comments query" });
  }
});

router.post("/reactions", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const payload = reactSchema.parse(req.body);

    if (payload.targetType === "post") {
      const [post] = await db
        .select({ id: schema.posts.id })
        .from(schema.posts)
        .where(eq(schema.posts.id, payload.targetId))
        .limit(1);
      if (!post) return res.status(404).json({ error: "Post not found" });
    }

    if (payload.targetType === "comment") {
      const [comment] = await db
        .select({ id: schema.comments.id })
        .from(schema.comments)
        .where(eq(schema.comments.id, payload.targetId))
        .limit(1);
      if (!comment) return res.status(404).json({ error: "Comment not found" });
    }

    if (payload.targetType === "repository") {
      const [repo] = await db
        .select({ id: schema.repositories.id })
        .from(schema.repositories)
        .where(eq(schema.repositories.id, payload.targetId))
        .limit(1);
      if (!repo) return res.status(404).json({ error: "Repository not found" });
    }

    if (!payload.active) {
      await db
        .delete(schema.reactions)
        .where(
          and(
            eq(schema.reactions.userId, userId),
            eq(schema.reactions.targetType, payload.targetType),
            eq(schema.reactions.targetId, payload.targetId),
            eq(schema.reactions.reaction, payload.reaction)
          )
        );

      return res.json({ success: true, active: false });
    }

    await db
      .insert(schema.reactions)
      .values({
        userId,
        targetType: payload.targetType,
        targetId: payload.targetId,
        reaction: payload.reaction,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    return res.status(201).json({
      success: true,
      active: true,
      reaction: {
        targetType: payload.targetType,
        targetId: payload.targetId,
        reaction: payload.reaction,
      },
    });
  } catch (error) {
    logger.error("gitgram reactions error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid reaction request" });
  }
});

router.post("/follows", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const payload = followSchema.parse(req.body);

    if (payload.targetType === "user") {
      if (payload.targetUserId === userId) {
        return res.status(400).json({ error: "Cannot follow yourself" });
      }

      const [targetUser] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.id, payload.targetUserId!))
        .limit(1);

      if (!targetUser) {
        return res.status(404).json({ error: "Target user not found" });
      }
    }

    if (payload.targetType === "repository") {
      const [repo] = await db
        .select({ id: schema.repositories.id })
        .from(schema.repositories)
        .where(eq(schema.repositories.id, payload.targetRepositoryId!))
        .limit(1);

      if (!repo) {
        return res.status(404).json({ error: "Target repository not found" });
      }
    }

    await db
      .insert(schema.follows)
      .values({
        followerUserId: userId,
        targetType: payload.targetType,
        targetUserId: payload.targetUserId || null,
        targetRepositoryId: payload.targetRepositoryId || null,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    return res.status(201).json({ success: true });
  } catch (error) {
    logger.error("gitgram follows error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid follow request" });
  }
});

router.delete("/follows", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const payload = followSchema.parse(req.body);

    await db
      .delete(schema.follows)
      .where(
        and(
          eq(schema.follows.followerUserId, userId),
          eq(schema.follows.targetType, payload.targetType),
          payload.targetType === "user"
            ? eq(schema.follows.targetUserId, payload.targetUserId!)
            : eq(schema.follows.targetRepositoryId, payload.targetRepositoryId!)
        )
      );

    return res.json({ success: true });
  } catch (error) {
    logger.error("gitgram unfollow error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid unfollow request" });
  }
});

router.get("/trending", async (req: AuthenticatedRequest, res) => {
  try {
    const query = trendingQuerySchema.parse(req.query);

    const recentScores = await db
      .select({
        repositoryId: schema.trendScores.repositoryId,
        score: schema.trendScores.score,
        windowStart: schema.trendScores.windowStart,
        windowEnd: schema.trendScores.windowEnd,
        signals: schema.trendScores.signals,
      })
      .from(schema.trendScores)
      .orderBy(desc(schema.trendScores.windowEnd))
      .limit(query.limit * 3);

    if (recentScores.length > 0) {
      const latestByRepo = new Map<string, (typeof recentScores)[number]>();
      for (const row of recentScores) {
        if (!latestByRepo.has(row.repositoryId)) {
          latestByRepo.set(row.repositoryId, row);
        }
      }

      const top = Array.from(latestByRepo.values())
        .sort((a, b) => Number(b.score) - Number(a.score))
        .slice(0, query.limit);

      const repoIds = top.map((r) => r.repositoryId);
      const repos = repoIds.length > 0
        ? await db
            .select({ id: schema.repositories.id, name: schema.repositories.name, metadata: schema.repositories.metadata })
            .from(schema.repositories)
            .where(inArray(schema.repositories.id, repoIds))
        : [];
      const repoById = new Map(repos.map((r: any) => [r.id, r]));

      return res.json({
        success: true,
        source: "trend_scores",
        repositories: top.map((row) => ({
          repositoryId: row.repositoryId,
          repository: repoById.get(row.repositoryId) || null,
          score: Number(row.score),
          windowStart: row.windowStart,
          windowEnd: row.windowEnd,
          signals: row.signals,
        })),
      });
    }

    const since = new Date();
    since.setDate(since.getDate() - query.windowDays);

    const recentPosts = await db
      .select({ id: schema.posts.id, repositoryId: schema.posts.repositoryId, createdAt: schema.posts.createdAt })
      .from(schema.posts)
      .where(
        and(
          gte(schema.posts.createdAt, since),
          isNotNull(schema.posts.repositoryId)
        )
      );

    const postsWithRepo = recentPosts.filter((p: any) => !!p.repositoryId);
    const postIds = postsWithRepo.map((p: any) => p.id);

    const [postReactions, postComments] = await Promise.all([
      postIds.length > 0
        ? db
            .select({ targetId: schema.reactions.targetId })
            .from(schema.reactions)
            .where(
              and(eq(schema.reactions.targetType, "post"), inArray(schema.reactions.targetId, postIds))
            )
        : Promise.resolve([]),
      postIds.length > 0
        ? db
            .select({ postId: schema.comments.postId })
            .from(schema.comments)
            .where(inArray(schema.comments.postId, postIds))
        : Promise.resolve([]),
    ]);

    const repoScores = new Map<string, { posts: number; reactions: number; comments: number }>();
    const postToRepo = new Map<string, string>();

    for (const post of postsWithRepo) {
      const repoId = post.repositoryId!;
      postToRepo.set(post.id, repoId);
      const s = repoScores.get(repoId) || { posts: 0, reactions: 0, comments: 0 };
      s.posts += 1;
      repoScores.set(repoId, s);
    }

    for (const reaction of postReactions) {
      const repoId = postToRepo.get(reaction.targetId);
      if (!repoId) continue;
      const s = repoScores.get(repoId) || { posts: 0, reactions: 0, comments: 0 };
      s.reactions += 1;
      repoScores.set(repoId, s);
    }

    for (const comment of postComments) {
      const repoId = postToRepo.get(comment.postId);
      if (!repoId) continue;
      const s = repoScores.get(repoId) || { posts: 0, reactions: 0, comments: 0 };
      s.comments += 1;
      repoScores.set(repoId, s);
    }

    const ranked = Array.from(repoScores.entries())
      .map(([repositoryId, s]) => ({
        repositoryId,
        score: s.posts * 3 + s.reactions + s.comments * 2,
        signals: s,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, query.limit);

    const repos = ranked.length > 0
      ? await db
          .select({ id: schema.repositories.id, name: schema.repositories.name, metadata: schema.repositories.metadata })
          .from(schema.repositories)
          .where(inArray(schema.repositories.id, ranked.map((r) => r.repositoryId)))
      : [];

    const repoById = new Map(repos.map((r: any) => [r.id, r]));

    return res.json({
      success: true,
      source: "computed",
      windowDays: query.windowDays,
      repositories: ranked.map((row) => ({
        repositoryId: row.repositoryId,
        repository: repoById.get(row.repositoryId) || null,
        score: row.score,
        signals: row.signals,
      })),
    });
  } catch (error) {
    logger.error("gitgram trending error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid trending request" });
  }
});

export default router;
