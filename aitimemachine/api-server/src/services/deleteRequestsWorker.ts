import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { processDeleteRequestJob } from "./dataDeletion.js";

export interface DeleteRequestsWorkerOptions {
  limit?: number;
  dryRun?: boolean;
  userId?: string;
}

export interface DeleteRequestsWorkerResultItem {
  requestId: string;
  userId: string;
  ok: boolean;
  error?: string;
}

export interface DeleteRequestsWorkerResult {
  dryRun: boolean;
  processed: number;
  succeeded: number;
  failed: number;
  results: DeleteRequestsWorkerResultItem[];
}

export async function processDeleteRequestsWorker(
  options: DeleteRequestsWorkerOptions = {}
): Promise<DeleteRequestsWorkerResult> {
  const limit = Math.min(Math.max(Number(options.limit || 50), 1), 500);
  const dryRun = options.dryRun ?? false;

  const whereCondition = options.userId
    ? and(
        eq(schema.jobs.type, "data_delete_request"),
        eq(schema.jobs.status, "pending"),
        eq(schema.jobs.userId, options.userId)
      )
    : and(eq(schema.jobs.type, "data_delete_request"), eq(schema.jobs.status, "pending"));

  const pendingJobs = await db
    .select({
      id: schema.jobs.id,
      userId: schema.jobs.userId,
    })
    .from(schema.jobs)
    .where(whereCondition)
    .orderBy(desc(schema.jobs.createdAt))
    .limit(limit);

  const results: DeleteRequestsWorkerResultItem[] = [];

  for (const job of pendingJobs) {
    try {
      await processDeleteRequestJob(job.id, job.userId, { dryRun });
      results.push({ requestId: job.id, userId: job.userId, ok: true });
    } catch (error) {
      results.push({
        requestId: job.id,
        userId: job.userId,
        ok: false,
        error: error instanceof Error ? error.message : "unknown_error",
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
