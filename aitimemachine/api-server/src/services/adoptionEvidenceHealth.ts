import { desc, eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";

const DEFAULT_MAX_AGE_HOURS = 168;

export type CoverageFreshness = {
  status: "fresh" | "stale" | "unmeasured";
  checkedAt: string;
  latestWindowEndedAt: string | null;
  latestBatchCompletedAt: string | null;
  ageHours: number | null;
  maxAgeHours: number;
};

export function coverageMaxAgeHours(): number {
  const configured = Number(process.env.OSS_COVERAGE_MAX_AGE_HOURS || DEFAULT_MAX_AGE_HOURS);
  return Number.isInteger(configured) && configured >= 1 && configured <= 8_760
    ? configured
    : DEFAULT_MAX_AGE_HOURS;
}

export function evaluateCoverageFreshness(
  batch: { windowEndedAt: Date; completedAt: Date | null } | undefined,
  checkedAt = new Date()
): CoverageFreshness {
  const maxAgeHours = coverageMaxAgeHours();
  if (!batch) {
    return {
      status: "unmeasured",
      checkedAt: checkedAt.toISOString(),
      latestWindowEndedAt: null,
      latestBatchCompletedAt: null,
      ageHours: null,
      maxAgeHours,
    };
  }

  const ageHours = Math.max(
    0,
    Math.round(((checkedAt.getTime() - batch.windowEndedAt.getTime()) / (60 * 60 * 1000)) * 10) / 10
  );
  return {
    status: ageHours <= maxAgeHours ? "fresh" : "stale",
    checkedAt: checkedAt.toISOString(),
    latestWindowEndedAt: batch.windowEndedAt.toISOString(),
    latestBatchCompletedAt: batch.completedAt?.toISOString() ?? null,
    ageHours,
    maxAgeHours,
  };
}

export async function getCoverageFreshness(checkedAt = new Date()): Promise<CoverageFreshness> {
  const [latest] = await db
    .select({
      windowEndedAt: schema.ossCoverageBatches.windowEndedAt,
      completedAt: schema.ossCoverageBatches.completedAt,
    })
    .from(schema.ossCoverageBatches)
    .where(eq(schema.ossCoverageBatches.status, "completed"))
    .orderBy(
      desc(schema.ossCoverageBatches.windowEndedAt),
      desc(schema.ossCoverageBatches.completedAt)
    )
    .limit(1);
  return evaluateCoverageFreshness(latest, checkedAt);
}
