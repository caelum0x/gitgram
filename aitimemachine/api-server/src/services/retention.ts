import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { db, schema } from "../db/index.js";

export const DATA_CLASSES = [
  "checkpoints",
  "messages",
  "tool_calls",
  "social_media",
  "exports",
  "audit_logs",
] as const;

export type DataClass = (typeof DATA_CLASSES)[number];

export interface RetentionApplyResult {
  projectId: string;
  dryRun: boolean;
  summary: Record<string, { retentionDays: number; cutoff: string; deleted: number }>;
}

async function ensureProjectOwned(userId: string, projectId: string) {
  const [project] = await db
    .select({ id: schema.projects.id, orgId: schema.projects.orgId })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);

  return project;
}

async function resolvePolicyForProject(
  userId: string,
  projectId: string,
  dataClass: DataClass
): Promise<typeof schema.retentionPolicies.$inferSelect | null> {
  const project = await ensureProjectOwned(userId, projectId);
  if (!project) return null;

  const [projectPolicy] = await db
    .select()
    .from(schema.retentionPolicies)
    .where(
      and(
        eq(schema.retentionPolicies.projectId, projectId),
        eq(schema.retentionPolicies.dataClass, dataClass)
      )
    )
    .orderBy(desc(schema.retentionPolicies.updatedAt))
    .limit(1);

  if (projectPolicy) return projectPolicy;

  if (project.orgId) {
    const [orgPolicy] = await db
      .select()
      .from(schema.retentionPolicies)
      .where(
        and(
          eq(schema.retentionPolicies.organizationId, project.orgId),
          eq(schema.retentionPolicies.dataClass, dataClass)
        )
      )
      .orderBy(desc(schema.retentionPolicies.updatedAt))
      .limit(1);

    if (orgPolicy) return orgPolicy;
  }

  return null;
}

function cutoffFromDays(retentionDays: number) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  return cutoff;
}

export async function applyRetentionForProject(
  userId: string,
  projectId: string,
  opts: { dataClass?: DataClass; dryRun?: boolean } = {}
): Promise<RetentionApplyResult> {
  const dryRun = opts.dryRun ?? true;

  const project = await ensureProjectOwned(userId, projectId);
  if (!project) {
    throw new Error("project_not_found");
  }

  const classes = opts.dataClass ? [opts.dataClass] : [...DATA_CLASSES];
  const summary: Record<string, { retentionDays: number; cutoff: string; deleted: number }> = {};

  for (const dataClass of classes) {
    const policy = await resolvePolicyForProject(userId, projectId, dataClass);
    if (!policy) continue;

    const cutoff = cutoffFromDays(policy.retentionDays);
    let deleted = 0;

    if (dataClass === "checkpoints") {
      const old = await db
        .select({ id: schema.checkpoints.id })
        .from(schema.checkpoints)
        .where(
          and(
            eq(schema.checkpoints.projectId, projectId),
            eq(schema.checkpoints.userId, userId),
            lte(schema.checkpoints.createdAt, cutoff)
          )
        );
      const checkpointIds = old.map((c: { id: string }) => c.id);
      deleted = checkpointIds.length;

      if (!dryRun && checkpointIds.length > 0) {
        await db
          .update(schema.chatMessages)
          .set({ checkpointId: null })
          .where(inArray(schema.chatMessages.checkpointId, checkpointIds));
        await db
          .update(schema.toolCalls)
          .set({ checkpointBeforeId: null })
          .where(inArray(schema.toolCalls.checkpointBeforeId, checkpointIds));
        await db
          .update(schema.toolCalls)
          .set({ checkpointAfterId: null })
          .where(inArray(schema.toolCalls.checkpointAfterId, checkpointIds));
        await db
          .delete(schema.checkpoints)
          .where(inArray(schema.checkpoints.id, checkpointIds));
      }
    }

    if (dataClass === "messages") {
      const old = await db
        .select({ id: schema.chatMessages.id })
        .from(schema.chatMessages)
        .where(
          and(
            eq(schema.chatMessages.projectId, projectId),
            eq(schema.chatMessages.userId, userId),
            lte(schema.chatMessages.timestamp, cutoff)
          )
        );
      deleted = old.length;

      if (!dryRun && deleted > 0) {
        await db
          .delete(schema.chatMessages)
          .where(
            and(
              eq(schema.chatMessages.projectId, projectId),
              eq(schema.chatMessages.userId, userId),
              lte(schema.chatMessages.timestamp, cutoff)
            )
          );
      }
    }

    if (dataClass === "tool_calls") {
      const old = await db
        .select({ id: schema.toolCalls.id })
        .from(schema.toolCalls)
        .where(
          and(
            eq(schema.toolCalls.projectId, projectId),
            eq(schema.toolCalls.userId, userId),
            lte(schema.toolCalls.timestamp, cutoff)
          )
        );
      deleted = old.length;

      if (!dryRun && deleted > 0) {
        await db
          .delete(schema.toolCalls)
          .where(
            and(
              eq(schema.toolCalls.projectId, projectId),
              eq(schema.toolCalls.userId, userId),
              lte(schema.toolCalls.timestamp, cutoff)
            )
          );
      }
    }

    if (dataClass === "social_media") {
      const [repoRows, postRows, commentRows, reactionRows] = await Promise.all([
        db
          .select({ id: schema.repositories.id })
          .from(schema.repositories)
          .where(
            and(
              eq(schema.repositories.projectId, projectId),
              eq(schema.repositories.userId, userId)
            )
          ),
        db
          .select({ id: schema.posts.id })
          .from(schema.posts)
          .where(
            and(
              eq(schema.posts.projectId, projectId),
              eq(schema.posts.authorUserId, userId),
              lte(schema.posts.createdAt, cutoff)
            )
          ),
        db
          .select({ id: schema.comments.id })
          .from(schema.comments)
          .where(lte(schema.comments.createdAt, cutoff)),
        db
          .select({ id: schema.reactions.id })
          .from(schema.reactions)
          .where(lte(schema.reactions.createdAt, cutoff)),
      ]);

      const repoIds = repoRows.map((r: { id: string }) => r.id);
      const postIds = postRows.map((p: { id: string }) => p.id);
      const commentIds = commentRows.map((c: { id: string }) => c.id);

      deleted = postIds.length + commentIds.length + reactionRows.length;

      if (!dryRun) {
        if (postIds.length > 0) {
          await db
            .delete(schema.postAssets)
            .where(inArray(schema.postAssets.postId, postIds));

          await db
            .delete(schema.reactions)
            .where(
              and(
                eq(schema.reactions.targetType, "post"),
                inArray(schema.reactions.targetId, postIds)
              )
            );
        }

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

        await db
          .delete(schema.comments)
          .where(lte(schema.comments.createdAt, cutoff));

        await db
          .delete(schema.reactions)
          .where(lte(schema.reactions.createdAt, cutoff));

        await db
          .delete(schema.posts)
          .where(
            and(
              eq(schema.posts.projectId, projectId),
              eq(schema.posts.authorUserId, userId),
              lte(schema.posts.createdAt, cutoff)
            )
          );

        if (repoIds.length > 0) {
          await db
            .delete(schema.follows)
            .where(
              and(
                eq(schema.follows.targetType, "repository"),
                inArray(schema.follows.targetRepositoryId, repoIds),
                lte(schema.follows.createdAt, cutoff)
              )
            );
        }
      }
    }

    if (dataClass === "exports") {
      const old = await db
        .select({ id: schema.knowledgeBaseArtifacts.id })
        .from(schema.knowledgeBaseArtifacts)
        .where(
          and(
            eq(schema.knowledgeBaseArtifacts.projectId, projectId),
            lte(schema.knowledgeBaseArtifacts.createdAt, cutoff)
          )
        );
      deleted = old.length;

      if (!dryRun && deleted > 0) {
        await db
          .delete(schema.knowledgeBaseArtifacts)
          .where(
            and(
              eq(schema.knowledgeBaseArtifacts.projectId, projectId),
              lte(schema.knowledgeBaseArtifacts.createdAt, cutoff)
            )
          );
      }
    }

    if (dataClass === "audit_logs") {
      const old = await db
        .select({
          id: schema.auditLogs.id,
          metadata: schema.auditLogs.metadata,
          createdAt: schema.auditLogs.createdAt,
          userId: schema.auditLogs.userId,
        })
        .from(schema.auditLogs)
        .where(and(eq(schema.auditLogs.userId, userId), lte(schema.auditLogs.createdAt, cutoff)));

      const scoped = old.filter((row: { id: string; metadata: unknown }) => {
        const metadata = (row.metadata || {}) as Record<string, unknown>;
        return metadata.projectId === projectId;
      });

      deleted = scoped.length;

      if (!dryRun && deleted > 0) {
        const scopedIds = scoped.map((row: { id: string }) => row.id);
        await db
          .delete(schema.auditLogs)
          .where(inArray(schema.auditLogs.id, scopedIds));
      }
    }

    summary[dataClass] = {
      retentionDays: policy.retentionDays,
      cutoff: cutoff.toISOString(),
      deleted,
    };
  }

  return {
    projectId,
    dryRun,
    summary,
  };
}
