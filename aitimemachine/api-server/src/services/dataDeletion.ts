import {
  and,
  eq,
  inArray,
  isNull,
  ne,
  or,
} from "drizzle-orm";
import { db, schema } from "../db/index.js";

interface DeleteRequestParams {
  scope?: "project" | "user";
  projectId?: string | null;
  reason?: string | null;
}

interface DeletionSummary {
  scope: "project" | "user";
  projectId?: string | null;
  deletedProjectIds: string[];
  deletedRepositoryIds: string[];
  deletedCheckpointIds: string[];
  processedAt: string;
}

async function previewProjectScopedDeletion(
  userId: string,
  projectId: string
): Promise<DeletionSummary> {
  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);

  if (!project) {
    throw new Error("project_not_found");
  }

  const [repositories, checkpoints] = await Promise.all([
    db
      .select({ id: schema.repositories.id })
      .from(schema.repositories)
      .where(and(eq(schema.repositories.projectId, projectId), eq(schema.repositories.userId, userId))),
    db
      .select({ id: schema.checkpoints.id })
      .from(schema.checkpoints)
      .where(and(eq(schema.checkpoints.projectId, projectId), eq(schema.checkpoints.userId, userId))),
  ]);

  return {
    scope: "project",
    projectId,
    deletedProjectIds: [projectId],
    deletedRepositoryIds: repositories.map((r) => r.id),
    deletedCheckpointIds: checkpoints.map((c) => c.id),
    processedAt: new Date().toISOString(),
  };
}

async function previewUserScopedDeletion(userId: string): Promise<DeletionSummary> {
  const projects = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.userId, userId));

  const deletedProjectIds = projects.map((p) => p.id);
  const deletedRepositoryIds: string[] = [];
  const deletedCheckpointIds: string[] = [];

  for (const projectId of deletedProjectIds) {
    const preview = await previewProjectScopedDeletion(userId, projectId);
    deletedRepositoryIds.push(...preview.deletedRepositoryIds);
    deletedCheckpointIds.push(...preview.deletedCheckpointIds);
  }

  return {
    scope: "user",
    projectId: null,
    deletedProjectIds,
    deletedRepositoryIds,
    deletedCheckpointIds,
    processedAt: new Date().toISOString(),
  };
}

async function deleteProjectScopedData(userId: string, projectId: string): Promise<DeletionSummary> {
  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);

  if (!project) {
    throw new Error("project_not_found");
  }

  const repositories = await db
    .select({ id: schema.repositories.id })
    .from(schema.repositories)
    .where(eq(schema.repositories.projectId, projectId));
  const repositoryIds = repositories.map((r) => r.id);

  const checkpoints = await db
    .select({ id: schema.checkpoints.id })
    .from(schema.checkpoints)
    .where(and(eq(schema.checkpoints.projectId, projectId), eq(schema.checkpoints.userId, userId)));
  const checkpointIds = checkpoints.map((cp) => cp.id);

  const posts = await db
    .select({ id: schema.posts.id })
    .from(schema.posts)
    .where(
      and(
        eq(schema.posts.authorUserId, userId),
        repositoryIds.length > 0
          ? or(
              eq(schema.posts.projectId, projectId),
              inArray(schema.posts.repositoryId, repositoryIds)
            )
          : eq(schema.posts.projectId, projectId)
      )
    );
  const postIds = posts.map((p) => p.id);

  const commentsForPosts = postIds.length
    ? await db
        .select({ id: schema.comments.id })
        .from(schema.comments)
        .where(inArray(schema.comments.postId, postIds))
    : [];
  const commentIds = commentsForPosts.map((c) => c.id);

  if (commentIds.length > 0) {
    await db
      .delete(schema.reactions)
      .where(
        and(
          eq(schema.reactions.targetType, "comment"),
          inArray(schema.reactions.targetId, commentIds)
        )
      );
  }

  if (postIds.length > 0) {
    await db
      .delete(schema.reactions)
      .where(
        and(eq(schema.reactions.targetType, "post"), inArray(schema.reactions.targetId, postIds))
      );
  }

  if (repositoryIds.length > 0) {
    await db
      .delete(schema.reactions)
      .where(
        and(
          eq(schema.reactions.targetType, "repository"),
          inArray(schema.reactions.targetId, repositoryIds)
        )
      );

    await db
      .delete(schema.follows)
      .where(
        and(
          eq(schema.follows.targetType, "repository"),
          inArray(schema.follows.targetRepositoryId, repositoryIds)
        )
      );

    await db
      .delete(schema.trendScores)
      .where(inArray(schema.trendScores.repositoryId, repositoryIds));

    await db
      .delete(schema.repoProfiles)
      .where(inArray(schema.repoProfiles.repositoryId, repositoryIds));

    await db
      .delete(schema.projectRepositories)
      .where(inArray(schema.projectRepositories.repositoryId, repositoryIds));

    await db
      .delete(schema.codeEmbeddings)
      .where(inArray(schema.codeEmbeddings.repositoryId, repositoryIds));

    await db
      .delete(schema.knowledgeBaseFiles)
      .where(inArray(schema.knowledgeBaseFiles.repositoryId, repositoryIds));

    await db
      .delete(schema.indexedFiles)
      .where(inArray(schema.indexedFiles.repositoryId, repositoryIds));
  }

  if (postIds.length > 0) {
    await db
      .delete(schema.comments)
      .where(
        and(eq(schema.comments.authorUserId, userId), inArray(schema.comments.postId, postIds))
      );
  }

  await db
    .delete(schema.posts)
    .where(and(eq(schema.posts.authorUserId, userId), eq(schema.posts.projectId, projectId)));

  if (checkpointIds.length > 0) {
    await db
      .delete(schema.diffs)
      .where(
        or(
          inArray(schema.diffs.fromCheckpointId, checkpointIds),
          inArray(schema.diffs.toCheckpointId, checkpointIds)
        )
      );

    await db
      .delete(schema.checkpointFiles)
      .where(inArray(schema.checkpointFiles.checkpointId, checkpointIds));
  }

  await db.delete(schema.toolCalls).where(eq(schema.toolCalls.projectId, projectId));
  await db.delete(schema.chatMessages).where(eq(schema.chatMessages.projectId, projectId));
  await db.delete(schema.terminalEvents).where(eq(schema.terminalEvents.projectId, projectId));
  await db.delete(schema.events).where(eq(schema.events.projectId, projectId));
  await db.delete(schema.savedContexts).where(eq(schema.savedContexts.projectId, projectId));
  await db.delete(schema.chatSessions).where(eq(schema.chatSessions.projectId, projectId));

  await db.delete(schema.consents).where(eq(schema.consents.projectId, projectId));
  await db.delete(schema.researchJobs).where(eq(schema.researchJobs.projectId, projectId));
  await db.delete(schema.researchPapers).where(eq(schema.researchPapers.projectId, projectId));
  await db
    .delete(schema.knowledgeBaseArtifacts)
    .where(eq(schema.knowledgeBaseArtifacts.projectId, projectId));

  await db
    .delete(schema.checkpoints)
    .where(and(eq(schema.checkpoints.projectId, projectId), eq(schema.checkpoints.userId, userId)));

  await db
    .delete(schema.repositories)
    .where(and(eq(schema.repositories.projectId, projectId), eq(schema.repositories.userId, userId)));

  await db
    .delete(schema.projectRepositories)
    .where(eq(schema.projectRepositories.projectId, projectId));

  await db
    .delete(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)));

  return {
    scope: "project",
    projectId,
    deletedProjectIds: [projectId],
    deletedRepositoryIds: repositoryIds,
    deletedCheckpointIds: checkpointIds,
    processedAt: new Date().toISOString(),
  };
}

async function deleteUserScopedData(userId: string): Promise<DeletionSummary> {
  const projectRows = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.userId, userId));

  const deletedProjectIds: string[] = [];
  const deletedRepositoryIds: string[] = [];
  const deletedCheckpointIds: string[] = [];

  for (const project of projectRows) {
    const projectSummary = await deleteProjectScopedData(userId, project.id);
    deletedProjectIds.push(...projectSummary.deletedProjectIds);
    deletedRepositoryIds.push(...projectSummary.deletedRepositoryIds);
    deletedCheckpointIds.push(...projectSummary.deletedCheckpointIds);
  }

  const ownComments = await db
    .select({ id: schema.comments.id })
    .from(schema.comments)
    .where(eq(schema.comments.authorUserId, userId));
  const ownCommentIds = ownComments.map((c) => c.id);

  if (ownCommentIds.length > 0) {
    await db
      .delete(schema.reactions)
      .where(
        and(
          eq(schema.reactions.targetType, "comment"),
          inArray(schema.reactions.targetId, ownCommentIds)
        )
      );
  }

  await db.delete(schema.comments).where(eq(schema.comments.authorUserId, userId));
  await db.delete(schema.posts).where(eq(schema.posts.authorUserId, userId));
  await db.delete(schema.reactions).where(eq(schema.reactions.userId, userId));
  await db
    .delete(schema.follows)
    .where(
      or(
        eq(schema.follows.followerUserId, userId),
        eq(schema.follows.targetUserId, userId)
      )
    );

  await db.delete(schema.consents).where(eq(schema.consents.grantedByUserId, userId));
  await db.delete(schema.apiKeys).where(eq(schema.apiKeys.userId, userId));
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
  await db.delete(schema.subscriptions).where(eq(schema.subscriptions.userId, userId));

  const webhooks = await db
    .select({ id: schema.webhooks.id })
    .from(schema.webhooks)
    .where(eq(schema.webhooks.userId, userId));

  if (webhooks.length > 0) {
    await db
      .delete(schema.webhookDeliveries)
      .where(inArray(schema.webhookDeliveries.webhookId, webhooks.map((w) => w.id)));
  }
  await db.delete(schema.webhooks).where(eq(schema.webhooks.userId, userId));

  await db
    .delete(schema.researchJobs)
    .where(and(eq(schema.researchJobs.userId, userId), isNull(schema.researchJobs.projectId)));
  await db
    .delete(schema.researchPapers)
    .where(and(eq(schema.researchPapers.userId, userId), isNull(schema.researchPapers.projectId)));
  await db
    .delete(schema.knowledgeBaseArtifacts)
    .where(eq(schema.knowledgeBaseArtifacts.userId, userId));
  await db.delete(schema.blobs).where(eq(schema.blobs.userId, userId));

  await db
    .delete(schema.jobs)
    .where(and(eq(schema.jobs.userId, userId), ne(schema.jobs.type, "data_delete_request")));

  await db.delete(schema.auditLogs).where(eq(schema.auditLogs.userId, userId));

  await db
    .update(schema.users)
    .set({
      email: `deleted+${userId}@deleted.local`,
      name: "Deleted User",
      plan: "free",
      polarCustomerId: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId));

  return {
    scope: "user",
    projectId: null,
    deletedProjectIds,
    deletedRepositoryIds,
    deletedCheckpointIds,
    processedAt: new Date().toISOString(),
  };
}

export async function processDeleteRequestJob(
  requestId: string,
  userId: string,
  opts: { dryRun?: boolean } = {}
) {
  const [job] = await db
    .select({
      id: schema.jobs.id,
      userId: schema.jobs.userId,
      status: schema.jobs.status,
      params: schema.jobs.params,
    })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.id, requestId),
        eq(schema.jobs.userId, userId),
        eq(schema.jobs.type, "data_delete_request")
      )
    )
    .limit(1);

  if (!job) {
    throw new Error("delete_request_not_found");
  }

  if (job.status === "completed") {
    return {
      alreadyCompleted: true,
      requestId,
    };
  }

  const params = (job.params || {}) as DeleteRequestParams;
  if (opts.dryRun) {
    let preview: DeletionSummary;

    if (params.scope === "project") {
      if (!params.projectId) throw new Error("project_id_required");
      preview = await previewProjectScopedDeletion(userId, params.projectId);
    } else {
      preview = await previewUserScopedDeletion(userId);
    }

    await db
      .update(schema.jobs)
      .set({
        result: {
          state: "dry_run_preview",
          summary: preview,
        },
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, requestId));

    return {
      alreadyCompleted: false,
      dryRun: true,
      requestId,
      summary: preview,
    };
  }

  await db
    .update(schema.jobs)
    .set({
      status: "running",
      progress: 10,
      result: { state: "running" },
      updatedAt: new Date(),
    })
    .where(eq(schema.jobs.id, requestId));

  try {
    let summary: DeletionSummary;

    if (params.scope === "project") {
      if (!params.projectId) throw new Error("project_id_required");
      summary = await deleteProjectScopedData(userId, params.projectId);
    } else {
      summary = await deleteUserScopedData(userId);
    }

    await db
      .update(schema.jobs)
      .set({
        status: "completed",
        progress: 100,
        result: {
          state: "completed",
          summary,
        },
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, requestId));

    return {
      alreadyCompleted: false,
      requestId,
      summary,
    };
  } catch (error) {
    await db
      .update(schema.jobs)
      .set({
        status: "failed",
        error: error instanceof Error ? error.message : "unknown_error",
        result: {
          state: "failed",
        },
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, requestId));

    throw error;
  }
}

export async function processPendingDeleteRequestsForUser(
  userId: string,
  limit: number,
  opts: { dryRun?: boolean } = {}
) {
  const rows = await db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.userId, userId),
        eq(schema.jobs.type, "data_delete_request"),
        eq(schema.jobs.status, "pending")
      )
    )
    .limit(limit);

  const results: Array<{ requestId: string; ok: boolean; error?: string }> = [];

  for (const row of rows) {
    try {
      await processDeleteRequestJob(row.id, userId, opts);
      results.push({ requestId: row.id, ok: true });
    } catch (error) {
      results.push({
        requestId: row.id,
        ok: false,
        error: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }

  return results;
}
