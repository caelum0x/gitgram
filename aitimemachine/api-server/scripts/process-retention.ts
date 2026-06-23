import { DataClass } from "../src/services/retention.js";
import { processRetentionWorker } from "../src/services/retentionWorker.js";

function parseBoolean(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parseDataClass(value: string | undefined): DataClass | undefined {
  if (!value) return undefined;
  const allowed: DataClass[] = [
    "checkpoints",
    "messages",
    "tool_calls",
    "social_media",
    "exports",
    "audit_logs",
  ];
  return allowed.includes(value as DataClass) ? (value as DataClass) : undefined;
}

async function main() {
  const result = await processRetentionWorker({
    limit: Number(process.env.RETENTION_WORKER_LIMIT || 100),
    dryRun: parseBoolean(process.env.RETENTION_WORKER_DRY_RUN, true),
    projectId: process.env.RETENTION_WORKER_PROJECT_ID,
    userId: process.env.RETENTION_WORKER_USER_ID,
    dataClass: parseDataClass(process.env.RETENTION_WORKER_DATA_CLASS),
  });

  console.log(
    `[retention-worker] processed=${result.processed} succeeded=${result.succeeded} failed=${result.failed} dryRun=${result.dryRun}`
  );

  for (const item of result.results) {
    if (item.ok) {
      console.log(
        `[retention-worker] ok projectId=${item.projectId} userId=${item.userId} classes=${Object.keys(item.summary || {}).join(",") || "none"}`
      );
    } else {
      console.error(
        `[retention-worker] failed projectId=${item.projectId} userId=${item.userId} error=${item.error}`
      );
    }
  }

  if (result.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[retention-worker] fatal error=${message}`);
  process.exit(1);
});
