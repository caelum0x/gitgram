import { findCheckpointsForQuery, parseTimeQuery } from "../cli/natural-language.js";

export interface SearchRelevanceThresholds {
  minTop1Accuracy: number;
  minMrr: number;
  minRecallAt3: number;
}

export interface SearchRelevanceScenario {
  id: string;
  query: string;
  expectedCheckpointIds: string[];
}

export interface SearchRelevanceCaseResult {
  id: string;
  query: string;
  expectedCheckpointIds: string[];
  topResultCheckpointId?: string;
  reciprocalRank: number;
  hitAt1: boolean;
  hitAt3: boolean;
}

export interface SearchRelevanceMetrics {
  totalCases: number;
  top1Accuracy: number;
  mrr: number;
  recallAt3: number;
}

export interface SearchRelevanceReport {
  evaluatedAt: string;
  thresholds: SearchRelevanceThresholds;
  metrics: SearchRelevanceMetrics;
  passed: boolean;
  cases: SearchRelevanceCaseResult[];
}

type BenchmarkCheckpoint = {
  checkpointId: string;
  name: string;
  createdAt: string;
};

const DEFAULT_CHECKPOINTS: BenchmarkCheckpoint[] = [
  { checkpointId: "cp_01", name: "Tests passed after auth fix", createdAt: "2026-02-15T10:00:00.000Z" },
  { checkpointId: "cp_02", name: "Build failed on CI docker image", createdAt: "2026-02-15T09:00:00.000Z" },
  { checkpointId: "cp_03", name: "Deploy production hotfix", createdAt: "2026-02-15T08:00:00.000Z" },
  { checkpointId: "cp_04", name: "Refactor auth middleware", createdAt: "2026-02-15T07:00:00.000Z" },
  { checkpointId: "cp_05", name: "Build passed with cache optimization", createdAt: "2026-02-15T06:00:00.000Z" },
  { checkpointId: "cp_06", name: "Tests failing in checkout flow", createdAt: "2026-02-15T05:00:00.000Z" },
  { checkpointId: "cp_07", name: "Add benchmark dashboard", createdAt: "2026-02-15T04:00:00.000Z" },
  { checkpointId: "cp_08", name: "Fix checkout payment parser", createdAt: "2026-02-15T03:00:00.000Z" },
];

const DEFAULT_SCENARIOS: SearchRelevanceScenario[] = [
  { id: "tests-green", query: "last time tests passed", expectedCheckpointIds: ["cp_01"] },
  { id: "build-red", query: "when build failed", expectedCheckpointIds: ["cp_02"] },
  { id: "auth-keyword", query: "auth middleware", expectedCheckpointIds: ["cp_04", "cp_01"] },
  { id: "checkout-failing", query: "tests failing checkout", expectedCheckpointIds: ["cp_06", "cp_08"] },
  { id: "deploy", query: "deploy production", expectedCheckpointIds: ["cp_03"] },
  { id: "build-green", query: "build passed", expectedCheckpointIds: ["cp_05"] },
];

const DEFAULT_THRESHOLDS: SearchRelevanceThresholds = {
  minTop1Accuracy: 0.65,
  minMrr: 0.78,
  minRecallAt3: 0.95,
};

function parseEnvFloat(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getSearchRelevanceThresholds(env: NodeJS.ProcessEnv = process.env): SearchRelevanceThresholds {
  return {
    minTop1Accuracy: parseEnvFloat(env.AITM_SEARCH_RELEVANCE_MIN_TOP1, DEFAULT_THRESHOLDS.minTop1Accuracy),
    minMrr: parseEnvFloat(env.AITM_SEARCH_RELEVANCE_MIN_MRR, DEFAULT_THRESHOLDS.minMrr),
    minRecallAt3: parseEnvFloat(env.AITM_SEARCH_RELEVANCE_MIN_RECALL_AT3, DEFAULT_THRESHOLDS.minRecallAt3),
  };
}

function runSearch(query: string, checkpoints: BenchmarkCheckpoint[], limit = 10) {
  const parsed = parseTimeQuery(query);
  const fakeRepo = {
    listCheckpointsNewestFirst: () => checkpoints,
  };
  return findCheckpointsForQuery(fakeRepo as any, "bench_project", parsed, limit);
}

function firstRelevantRank(results: Array<{ checkpointId: string }>, expectedCheckpointIds: string[]): number {
  const expected = new Set(expectedCheckpointIds);
  for (let i = 0; i < results.length; i++) {
    if (expected.has(results[i].checkpointId)) return i + 1;
  }
  return 0;
}

export function runSearchRelevanceBenchmark(params: {
  scenarios?: SearchRelevanceScenario[];
  checkpoints?: BenchmarkCheckpoint[];
  thresholds?: SearchRelevanceThresholds;
} = {}): SearchRelevanceReport {
  const scenarios = params.scenarios ?? DEFAULT_SCENARIOS;
  const checkpoints = params.checkpoints ?? DEFAULT_CHECKPOINTS;
  const thresholds = params.thresholds ?? getSearchRelevanceThresholds();

  const cases: SearchRelevanceCaseResult[] = scenarios.map((scenario) => {
    const results = runSearch(scenario.query, checkpoints, 10);
    const rank = firstRelevantRank(results, scenario.expectedCheckpointIds);
    return {
      id: scenario.id,
      query: scenario.query,
      expectedCheckpointIds: scenario.expectedCheckpointIds,
      topResultCheckpointId: results[0]?.checkpointId,
      reciprocalRank: rank > 0 ? 1 / rank : 0,
      hitAt1: rank === 1,
      hitAt3: rank > 0 && rank <= 3,
    };
  });

  const totalCases = cases.length;
  const top1Hits = cases.filter((c) => c.hitAt1).length;
  const hitAt3 = cases.filter((c) => c.hitAt3).length;
  const mrrSum = cases.reduce((sum, c) => sum + c.reciprocalRank, 0);

  const metrics: SearchRelevanceMetrics = {
    totalCases,
    top1Accuracy: totalCases > 0 ? top1Hits / totalCases : 0,
    mrr: totalCases > 0 ? mrrSum / totalCases : 0,
    recallAt3: totalCases > 0 ? hitAt3 / totalCases : 0,
  };

  const passed =
    metrics.top1Accuracy >= thresholds.minTop1Accuracy &&
    metrics.mrr >= thresholds.minMrr &&
    metrics.recallAt3 >= thresholds.minRecallAt3;

  return {
    evaluatedAt: new Date().toISOString(),
    thresholds,
    metrics,
    passed,
    cases,
  };
}
