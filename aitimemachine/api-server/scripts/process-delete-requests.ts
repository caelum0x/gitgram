import { processDeleteRequestsWorker } from "../src/services/deleteRequestsWorker.js";

function parseBoolean(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

async function main() {
  const limit = Math.min(Math.max(Number(process.env.DELETE_WORKER_LIMIT || 50), 1), 500);
  const dryRun = parseBoolean(process.env.DELETE_WORKER_DRY_RUN, false);
  const userIdFilter = process.env.DELETE_WORKER_USER_ID;
  const result = await processDeleteRequestsWorker({
    limit,
    dryRun,
    userId: userIdFilter,
  });

  console.log(
    `[delete-worker] processed=${result.processed} succeeded=${result.succeeded} failed=${result.failed} dryRun=${result.dryRun} userFilter=${userIdFilter || "none"}`
  );

  for (const item of result.results) {
    if (item.ok) {
      console.log(`[delete-worker] ok requestId=${item.requestId} userId=${item.userId}`);
    } else {
      console.error(
        `[delete-worker] failed requestId=${item.requestId} userId=${item.userId} error=${item.error}`
      );
    }
  }

  if (result.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[delete-worker] fatal error=${message}`);
  process.exit(1);
});
