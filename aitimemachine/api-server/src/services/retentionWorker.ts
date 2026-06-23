import { eq, inArray } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { logAction } from "./auditLog.js";
import { applyRetentionForProject, DataClass } from "./retention.js";

export interface RetentionWorkerOptions {
  limit?: number;
  dryRun?: boolean;
  projectId?: string;
  userId?: string;
  dataClass?: DataClass;
}

export interface RetentionWorkerResultItem {
  projectId: string;
  userId: string;
  ok: boolean;
  summary?: Record<string, { retentionDays: number; cutoff: string; deleted: number }>;
  error?: string;
}

export interface RetentionWorkerResult {
  dryRun: boolean;
  processed: number;
  succeeded: number;
  failed: number;
  results: RetentionWorkerResultItem[];
}

async function resolveTargetProjects(opts: {
  projectId?: string;
  userId?: string;
  limit: number;
}): Promise<Array<{ id: string; userId: string }>> {
  if (opts.projectId) {
    const rows = await db
      .select({ id: schema.projects.id, userId: schema.projects.userId })
      .from(schema.projects)
      .where(eq(schema.projects.id, opts.projectId))
      .limit(1);
    return rows;
  }

  const policies = await db
    .select({
      projectId: schema.retentionPolicies.projectId,
      organizationId: schema.retentionPolicies.organizationId,
    })
    .from(schema.retentionPolicies)
    .limit(5000);

  const directProjectIds: string[] = Array.from(
    new Set(
      policies
        .map((p: any) => p.projectId)
        .filter((id: unknown): id is string => typeof id === "string")
    )
  );

  const orgIds: string[] = Array.from(
    new Set(
      policies
        .map((p: any) => p.organizationId)
        .filter((id: unknown): id is string => typeof id === "string")
    )
  );

  const [directProjects, orgProjects] = await Promise.all([
    directProjectIds.length > 0
      ? db
          .select({ id: schema.projects.id, userId: schema.projects.userId })
          .from(schema.projects)
          .where(inArray(schema.projects.id, directProjectIds))
      : Promise.resolve([]),
    orgIds.length > 0
      ? db
          .select({ id: schema.projects.id, userId: schema.projects.userId })
          .from(schema.projects)
          .where(inArray(schema.projects.orgId, orgIds))
      : Promise.resolve([]),
  ]);

  const map = new Map<string, { id: string; userId: string }>();
  for (const p of [...directProjects, ...orgProjects]) {
    if (opts.userId && p.userId !== opts.userId) continue;
    map.set(p.id, p);
  }

  return Array.from(map.values()).slice(0, opts.limit);
}

export async function processRetentionWorker(
  options: RetentionWorkerOptions = {}
): Promise<RetentionWorkerResult> {
  const limit = Math.min(Math.max(Number(options.limit || 100), 1), 1000);
  const dryRun = options.dryRun ?? true;

  const targets = await resolveTargetProjects({
    projectId: options.projectId,
    userId: options.userId,
    limit,
  });

  const results: RetentionWorkerResultItem[] = [];

  for (const target of targets) {
    try {
      const result = await applyRetentionForProject(target.userId, target.id, {
        dryRun,
        dataClass: options.dataClass,
      });

      await logAction(target.userId, "retention.applied", "settings", target.id, {
        projectId: target.id,
        worker: true,
        dryRun,
        dataClass: options.dataClass || "all",
        summary: result.summary,
      });

      results.push({
        projectId: target.id,
        userId: target.userId,
        ok: true,
        summary: result.summary,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      results.push({
        projectId: target.id,
        userId: target.userId,
        ok: false,
        error: message,
      });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;

  return {
    dryRun,
    processed: results.length,
    succeeded,
    failed,
    results,
  };
}
