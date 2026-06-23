/**
 * Semantic Search Relevance Benchmark Harness
 *
 * Runs each benchmark query against the search API, measures relevance
 * metrics (Precision@K, Recall@K, NDCG, MRR) and latency (p50, p95, p99),
 * then generates a report with pass/fail per metric.
 *
 * Usage:
 *   import { runBenchmark } from "./search-benchmark.js";
 *   const report = await runBenchmark({ baseUrl, apiKey });
 */

import {
  BENCHMARK_QUERIES,
  type BenchmarkQuery,
  type BenchmarkCategory,
  type BenchmarkDifficulty,
  type ExpectedResult,
} from "./search-benchmark-data.js";

// ---------------------------------------------------------------------------
// Configuration & Acceptance Thresholds
// ---------------------------------------------------------------------------

export interface BenchmarkThresholds {
  /** Minimum acceptable Precision@5 */
  precision_at_5: number;
  /** Minimum acceptable Precision@10 */
  precision_at_10: number;
  /** Minimum acceptable Precision@20 */
  precision_at_20: number;
  /** Minimum acceptable Recall@10 */
  recall_at_10: number;
  /** Minimum acceptable NDCG */
  ndcg: number;
  /** Minimum acceptable MRR */
  mrr: number;
  /** Maximum acceptable p95 latency in milliseconds */
  p95_latency_ms: number;
}

export const DEFAULT_THRESHOLDS: BenchmarkThresholds = {
  precision_at_5: 0.6,
  precision_at_10: 0.5,
  precision_at_20: 0.4,
  recall_at_10: 0.7,
  ndcg: 0.65,
  mrr: 0.5,
  p95_latency_ms: 500,
};

export interface BenchmarkConfig {
  /** Base URL for the API server (e.g. http://localhost:3001/v1) */
  baseUrl: string;
  /** API key for authentication */
  apiKey: string;
  /** Acceptance thresholds (uses defaults if not provided) */
  thresholds?: Partial<BenchmarkThresholds>;
  /** Only run queries matching these categories */
  categories?: BenchmarkCategory[];
  /** Only run queries matching these difficulties */
  difficulties?: BenchmarkDifficulty[];
  /** Override query list */
  queries?: BenchmarkQuery[];
  /** Maximum concurrent requests (default 1 for stable latency measurement) */
  concurrency?: number;
  /** Request timeout in ms (default 10000) */
  requestTimeout?: number;
}

// ---------------------------------------------------------------------------
// Result Types
// ---------------------------------------------------------------------------

export interface SearchResultItem {
  id: string;
  source: string;
  score: number;
  title: string;
  snippet: string;
  match_offsets?: Array<{ field: string; start: number; end: number }>;
  metadata?: Record<string, unknown>;
}

export interface QueryBenchmarkResult {
  query_id: string;
  query_name: string;
  query_text: string;
  category: BenchmarkCategory;
  difficulty: BenchmarkDifficulty;
  /** Number of results returned */
  result_count: number;
  /** How long the request took in ms */
  latency_ms: number;
  /** Precision at various K values */
  precision_at_5: number;
  precision_at_10: number;
  precision_at_20: number;
  /** Recall at various K values */
  recall_at_5: number;
  recall_at_10: number;
  recall_at_20: number;
  /** Normalized Discounted Cumulative Gain */
  ndcg: number;
  /** Mean Reciprocal Rank (for this single query, it's just RR) */
  reciprocal_rank: number;
  /** Top 5 returned results for inspection */
  top_results: Array<{ id: string; source: string; title: string; score: number }>;
  /** Whether any expected results were found */
  any_hit: boolean;
  /** Error message if the query failed */
  error?: string;
}

export interface MetricSummary {
  name: string;
  value: number;
  threshold: number;
  passed: boolean;
}

export interface CategoryBreakdown {
  category: BenchmarkCategory;
  count: number;
  avg_precision_at_5: number;
  avg_recall_at_10: number;
  avg_ndcg: number;
  avg_mrr: number;
  avg_latency_ms: number;
}

export interface DifficultyBreakdown {
  difficulty: BenchmarkDifficulty;
  count: number;
  avg_precision_at_5: number;
  avg_recall_at_10: number;
  avg_ndcg: number;
  avg_mrr: number;
}

export interface LatencySummary {
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  mean_ms: number;
  min_ms: number;
  max_ms: number;
}

export interface BenchmarkReport {
  /** Timestamp of when the benchmark was run */
  timestamp: string;
  /** Configuration used */
  config: {
    base_url: string;
    query_count: number;
    thresholds: BenchmarkThresholds;
  };
  /** Overall pass/fail */
  passed: boolean;
  /** Individual metric summaries with pass/fail */
  metrics: MetricSummary[];
  /** Latency summary */
  latency: LatencySummary;
  /** Per-category breakdown */
  by_category: CategoryBreakdown[];
  /** Per-difficulty breakdown */
  by_difficulty: DifficultyBreakdown[];
  /** Per-query results */
  query_results: QueryBenchmarkResult[];
  /** Queries that had zero relevant results (degraded) */
  degraded_queries: string[];
  /** Total execution time in ms */
  total_duration_ms: number;
}

// ---------------------------------------------------------------------------
// Metric Calculations
// ---------------------------------------------------------------------------

/**
 * Determine if a returned search result matches an expected result.
 */
function resultMatchesExpected(
  result: SearchResultItem,
  expected: ExpectedResult
): boolean {
  // Source must match
  if (expected.source !== result.source) return false;

  const title = (result.title || "").toLowerCase();
  const snippet = (result.snippet || "").toLowerCase();
  const filePath = ((result.metadata?.file_path as string) || "").toLowerCase();
  const symbol = ((result.metadata?.symbol as string) || "").toLowerCase();
  const symbolType = ((result.metadata?.symbol_type as string) || "").toLowerCase();

  if (expected.title_contains && !title.includes(expected.title_contains.toLowerCase())) {
    return false;
  }
  if (expected.snippet_contains && !snippet.includes(expected.snippet_contains.toLowerCase())) {
    return false;
  }
  if (expected.file_path_contains && !filePath.includes(expected.file_path_contains.toLowerCase())) {
    return false;
  }
  if (expected.symbol_contains && !symbol.includes(expected.symbol_contains.toLowerCase())) {
    return false;
  }
  if (expected.symbol_type && symbolType !== expected.symbol_type.toLowerCase()) {
    return false;
  }

  return true;
}

/**
 * For a list of returned results and a list of expected results,
 * produce a binary relevance vector: 1 if the result at position i
 * matches any expected result, 0 otherwise.
 */
function binaryRelevanceVector(
  results: SearchResultItem[],
  expected: ExpectedResult[],
  k: number
): number[] {
  const topK = results.slice(0, k);
  return topK.map((r) =>
    expected.some((e) => resultMatchesExpected(r, e)) ? 1 : 0
  );
}

/**
 * For a list of returned results and a list of expected results,
 * produce a graded relevance vector using the relevance_grade field.
 * If a result matches multiple expected results, take the highest grade.
 */
function gradedRelevanceVector(
  results: SearchResultItem[],
  expected: ExpectedResult[],
  k: number
): number[] {
  const topK = results.slice(0, k);
  return topK.map((r) => {
    let maxGrade = 0;
    for (const e of expected) {
      if (resultMatchesExpected(r, e)) {
        maxGrade = Math.max(maxGrade, e.relevance_grade);
      }
    }
    return maxGrade;
  });
}

/**
 * Precision@K: fraction of top-K results that are relevant
 */
function precisionAtK(
  results: SearchResultItem[],
  expected: ExpectedResult[],
  k: number
): number {
  const rel = binaryRelevanceVector(results, expected, k);
  if (rel.length === 0) return 0;
  const relevant = rel.reduce((sum, v) => sum + v, 0);
  return relevant / rel.length;
}

/**
 * Recall@K: fraction of expected results found in top-K
 */
function recallAtK(
  results: SearchResultItem[],
  expected: ExpectedResult[],
  k: number
): number {
  if (expected.length === 0) return 1;
  const topK = results.slice(0, k);
  let found = 0;
  for (const e of expected) {
    if (topK.some((r) => resultMatchesExpected(r, e))) {
      found++;
    }
  }
  return found / expected.length;
}

/**
 * DCG (Discounted Cumulative Gain) with graded relevance
 */
function dcg(relevanceVector: number[]): number {
  let sum = 0;
  for (let i = 0; i < relevanceVector.length; i++) {
    sum += (Math.pow(2, relevanceVector[i]) - 1) / Math.log2(i + 2);
  }
  return sum;
}

/**
 * NDCG (Normalized DCG): DCG / ideal DCG
 */
function ndcg(
  results: SearchResultItem[],
  expected: ExpectedResult[],
  k: number = 20
): number {
  const graded = gradedRelevanceVector(results, expected, k);
  const actualDCG = dcg(graded);

  // Ideal: sort expected relevance grades descending
  const idealGrades = expected
    .map((e) => e.relevance_grade)
    .sort((a, b) => b - a)
    .slice(0, k);
  // Pad to k if fewer expected
  while (idealGrades.length < k) idealGrades.push(0);
  const idealDCG = dcg(idealGrades);

  if (idealDCG === 0) return 0;
  return actualDCG / idealDCG;
}

/**
 * Reciprocal Rank: 1 / position of first relevant result
 */
function reciprocalRank(
  results: SearchResultItem[],
  expected: ExpectedResult[]
): number {
  for (let i = 0; i < results.length; i++) {
    if (expected.some((e) => resultMatchesExpected(results[i], e))) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Latency percentiles
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function computeLatencySummary(latencies: number[]): LatencySummary {
  if (latencies.length === 0) {
    return { p50_ms: 0, p95_ms: 0, p99_ms: 0, mean_ms: 0, min_ms: 0, max_ms: 0 };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    p50_ms: percentile(sorted, 50),
    p95_ms: percentile(sorted, 95),
    p99_ms: percentile(sorted, 99),
    mean_ms: sorted.reduce((s, v) => s + v, 0) / sorted.length,
    min_ms: sorted[0],
    max_ms: sorted[sorted.length - 1],
  };
}

// ---------------------------------------------------------------------------
// HTTP Client
// ---------------------------------------------------------------------------

async function fetchSearch(
  baseUrl: string,
  apiKey: string,
  benchmarkQuery: BenchmarkQuery,
  timeout: number
): Promise<{ results: SearchResultItem[]; latency_ms: number }> {
  const endpoint =
    benchmarkQuery.endpoint === "query"
      ? "/universal-search/query"
      : "/universal-search";
  const url = `${baseUrl}${endpoint}`;

  const body: Record<string, unknown> =
    benchmarkQuery.endpoint === "query"
      ? {
          query: benchmarkQuery.query,
          context: [],
          repositories: benchmarkQuery.repositories || [],
          include_sources: true,
          search_mode: benchmarkQuery.search_mode || "hybrid",
          limit: 20,
        }
      : {
          query: benchmarkQuery.query,
          repositories: benchmarkQuery.repositories || [],
          search_mode: benchmarkQuery.search_mode || "hybrid",
          sources: benchmarkQuery.sources || undefined,
          limit: 20,
        };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const start = performance.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const elapsed = performance.now() - start;

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    }

    const json = (await response.json()) as { data?: SearchResultItem[] };
    return {
      results: json.data || [],
      latency_ms: Math.round(elapsed * 100) / 100,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Main Benchmark Runner
// ---------------------------------------------------------------------------

export async function runBenchmark(config: BenchmarkConfig): Promise<BenchmarkReport> {
  const thresholds: BenchmarkThresholds = {
    ...DEFAULT_THRESHOLDS,
    ...config.thresholds,
  };
  const timeout = config.requestTimeout ?? 10000;
  const startTime = performance.now();

  // Determine query set
  let queries = config.queries || BENCHMARK_QUERIES;
  if (config.categories && config.categories.length > 0) {
    queries = queries.filter((q) => config.categories!.includes(q.category));
  }
  if (config.difficulties && config.difficulties.length > 0) {
    queries = queries.filter((q) => config.difficulties!.includes(q.difficulty));
  }

  // Run each query
  const queryResults: QueryBenchmarkResult[] = [];
  const latencies: number[] = [];

  for (const bq of queries) {
    let result: QueryBenchmarkResult;

    try {
      const { results, latency_ms } = await fetchSearch(
        config.baseUrl,
        config.apiKey,
        bq,
        timeout
      );

      latencies.push(latency_ms);

      const p5 = precisionAtK(results, bq.expected_results, 5);
      const p10 = precisionAtK(results, bq.expected_results, 10);
      const p20 = precisionAtK(results, bq.expected_results, 20);
      const r5 = recallAtK(results, bq.expected_results, 5);
      const r10 = recallAtK(results, bq.expected_results, 10);
      const r20 = recallAtK(results, bq.expected_results, 20);
      const ndcgScore = ndcg(results, bq.expected_results, 20);
      const rr = reciprocalRank(results, bq.expected_results);

      result = {
        query_id: bq.id,
        query_name: bq.name,
        query_text: bq.query,
        category: bq.category,
        difficulty: bq.difficulty,
        result_count: results.length,
        latency_ms,
        precision_at_5: p5,
        precision_at_10: p10,
        precision_at_20: p20,
        recall_at_5: r5,
        recall_at_10: r10,
        recall_at_20: r20,
        ndcg: ndcgScore,
        reciprocal_rank: rr,
        top_results: results.slice(0, 5).map((r) => ({
          id: r.id,
          source: r.source,
          title: r.title,
          score: r.score,
        })),
        any_hit: rr > 0,
      };
    } catch (error) {
      result = {
        query_id: bq.id,
        query_name: bq.name,
        query_text: bq.query,
        category: bq.category,
        difficulty: bq.difficulty,
        result_count: 0,
        latency_ms: 0,
        precision_at_5: 0,
        precision_at_10: 0,
        precision_at_20: 0,
        recall_at_5: 0,
        recall_at_10: 0,
        recall_at_20: 0,
        ndcg: 0,
        reciprocal_rank: 0,
        top_results: [],
        any_hit: false,
        error: (error as Error).message,
      };
    }

    queryResults.push(result);
  }

  // Aggregate metrics (weighted by query weight)
  const weights = queries.map((q) => q.weight ?? 1);
  const totalWeight = weights.reduce((s, w) => s + w, 0);

  function weightedAvg(extractor: (r: QueryBenchmarkResult) => number): number {
    let sum = 0;
    for (let i = 0; i < queryResults.length; i++) {
      sum += extractor(queryResults[i]) * weights[i];
    }
    return totalWeight > 0 ? sum / totalWeight : 0;
  }

  const avgP5 = weightedAvg((r) => r.precision_at_5);
  const avgP10 = weightedAvg((r) => r.precision_at_10);
  const avgP20 = weightedAvg((r) => r.precision_at_20);
  const avgR10 = weightedAvg((r) => r.recall_at_10);
  const avgNDCG = weightedAvg((r) => r.ndcg);
  const avgMRR = weightedAvg((r) => r.reciprocal_rank);

  const latencySummary = computeLatencySummary(latencies);

  // Build metric summaries
  const metrics: MetricSummary[] = [
    {
      name: "Precision@5",
      value: round(avgP5),
      threshold: thresholds.precision_at_5,
      passed: avgP5 >= thresholds.precision_at_5,
    },
    {
      name: "Precision@10",
      value: round(avgP10),
      threshold: thresholds.precision_at_10,
      passed: avgP10 >= thresholds.precision_at_10,
    },
    {
      name: "Precision@20",
      value: round(avgP20),
      threshold: thresholds.precision_at_20,
      passed: avgP20 >= thresholds.precision_at_20,
    },
    {
      name: "Recall@10",
      value: round(avgR10),
      threshold: thresholds.recall_at_10,
      passed: avgR10 >= thresholds.recall_at_10,
    },
    {
      name: "NDCG",
      value: round(avgNDCG),
      threshold: thresholds.ndcg,
      passed: avgNDCG >= thresholds.ndcg,
    },
    {
      name: "MRR",
      value: round(avgMRR),
      threshold: thresholds.mrr,
      passed: avgMRR >= thresholds.mrr,
    },
    {
      name: "P95 Latency (ms)",
      value: round(latencySummary.p95_ms),
      threshold: thresholds.p95_latency_ms,
      passed: latencySummary.p95_ms <= thresholds.p95_latency_ms,
    },
  ];

  // Category breakdown
  const categories: BenchmarkCategory[] = ["code", "checkpoint", "conversation", "multi"];
  const byCategory: CategoryBreakdown[] = categories
    .map((cat) => {
      const catResults = queryResults.filter((r) => r.category === cat);
      if (catResults.length === 0) return null;
      return {
        category: cat,
        count: catResults.length,
        avg_precision_at_5: round(avg(catResults.map((r) => r.precision_at_5))),
        avg_recall_at_10: round(avg(catResults.map((r) => r.recall_at_10))),
        avg_ndcg: round(avg(catResults.map((r) => r.ndcg))),
        avg_mrr: round(avg(catResults.map((r) => r.reciprocal_rank))),
        avg_latency_ms: round(avg(catResults.map((r) => r.latency_ms))),
      };
    })
    .filter(Boolean) as CategoryBreakdown[];

  // Difficulty breakdown
  const difficulties: BenchmarkDifficulty[] = ["easy", "medium", "hard"];
  const byDifficulty: DifficultyBreakdown[] = difficulties
    .map((diff) => {
      const diffResults = queryResults.filter((r) => r.difficulty === diff);
      if (diffResults.length === 0) return null;
      return {
        difficulty: diff,
        count: diffResults.length,
        avg_precision_at_5: round(avg(diffResults.map((r) => r.precision_at_5))),
        avg_recall_at_10: round(avg(diffResults.map((r) => r.recall_at_10))),
        avg_ndcg: round(avg(diffResults.map((r) => r.ndcg))),
        avg_mrr: round(avg(diffResults.map((r) => r.reciprocal_rank))),
      };
    })
    .filter(Boolean) as DifficultyBreakdown[];

  // Degraded queries: those with zero hits
  const degradedQueries = queryResults
    .filter((r) => !r.any_hit && !r.error)
    .map((r) => r.query_id);

  const totalDuration = performance.now() - startTime;

  return {
    timestamp: new Date().toISOString(),
    config: {
      base_url: config.baseUrl,
      query_count: queries.length,
      thresholds,
    },
    passed: metrics.every((m) => m.passed),
    metrics,
    latency: latencySummary,
    by_category: byCategory,
    by_difficulty: byDifficulty,
    query_results: queryResults,
    degraded_queries: degradedQueries,
    total_duration_ms: Math.round(totalDuration),
  };
}

// ---------------------------------------------------------------------------
// Regression Detection
// ---------------------------------------------------------------------------

export interface RegressionResult {
  query_id: string;
  metric: string;
  previous_value: number;
  current_value: number;
  delta: number;
  /** True if the metric degraded beyond the threshold */
  degraded: boolean;
}

/**
 * Compare current benchmark report against a previous one.
 * Flag queries where key metrics degraded by more than `degradeThreshold` (default 0.1).
 */
export function detectRegressions(
  current: BenchmarkReport,
  previous: BenchmarkReport,
  degradeThreshold: number = 0.1
): RegressionResult[] {
  const regressions: RegressionResult[] = [];

  const prevMap = new Map(
    previous.query_results.map((r) => [r.query_id, r])
  );

  for (const cur of current.query_results) {
    const prev = prevMap.get(cur.query_id);
    if (!prev) continue;

    const metricsToCheck: Array<{ name: string; cur: number; prev: number }> = [
      { name: "precision_at_5", cur: cur.precision_at_5, prev: prev.precision_at_5 },
      { name: "recall_at_10", cur: cur.recall_at_10, prev: prev.recall_at_10 },
      { name: "ndcg", cur: cur.ndcg, prev: prev.ndcg },
      { name: "reciprocal_rank", cur: cur.reciprocal_rank, prev: prev.reciprocal_rank },
    ];

    for (const m of metricsToCheck) {
      const delta = m.cur - m.prev;
      if (delta < -degradeThreshold) {
        regressions.push({
          query_id: cur.query_id,
          metric: m.name,
          previous_value: round(m.prev),
          current_value: round(m.cur),
          delta: round(delta),
          degraded: true,
        });
      }
    }
  }

  return regressions;
}

// ---------------------------------------------------------------------------
// Report Formatting
// ---------------------------------------------------------------------------

/**
 * Generate a human-readable summary of the benchmark report.
 */
export function formatReport(report: BenchmarkReport): string {
  const lines: string[] = [];
  const divider = "=".repeat(70);
  const thinDivider = "-".repeat(70);

  lines.push(divider);
  lines.push("  SEARCH RELEVANCE BENCHMARK REPORT");
  lines.push(`  ${report.timestamp}`);
  lines.push(divider);
  lines.push("");

  // Overall result
  const overall = report.passed ? "PASSED" : "FAILED";
  lines.push(`  Overall: ${overall}`);
  lines.push(`  Queries: ${report.config.query_count}`);
  lines.push(`  Duration: ${report.total_duration_ms}ms`);
  lines.push("");

  // Metrics table
  lines.push(thinDivider);
  lines.push("  METRICS");
  lines.push(thinDivider);
  lines.push(
    padRight("  Metric", 28) +
      padRight("Value", 10) +
      padRight("Threshold", 12) +
      "Status"
  );
  lines.push(thinDivider);

  for (const m of report.metrics) {
    const status = m.passed ? "PASS" : "FAIL";
    const valueStr = m.name.includes("Latency")
      ? `${m.value}ms`
      : m.value.toFixed(3);
    const threshStr = m.name.includes("Latency")
      ? `<= ${m.threshold}ms`
      : `>= ${m.threshold}`;
    lines.push(
      padRight(`  ${m.name}`, 28) +
        padRight(valueStr, 10) +
        padRight(threshStr, 12) +
        status
    );
  }
  lines.push("");

  // Latency
  lines.push(thinDivider);
  lines.push("  LATENCY");
  lines.push(thinDivider);
  lines.push(`  P50:  ${report.latency.p50_ms}ms`);
  lines.push(`  P95:  ${report.latency.p95_ms}ms`);
  lines.push(`  P99:  ${report.latency.p99_ms}ms`);
  lines.push(`  Mean: ${report.latency.mean_ms.toFixed(1)}ms`);
  lines.push(`  Min:  ${report.latency.min_ms}ms`);
  lines.push(`  Max:  ${report.latency.max_ms}ms`);
  lines.push("");

  // By category
  lines.push(thinDivider);
  lines.push("  BY CATEGORY");
  lines.push(thinDivider);
  for (const cat of report.by_category) {
    lines.push(
      `  ${cat.category.padEnd(14)} ` +
        `P@5=${cat.avg_precision_at_5.toFixed(3)} ` +
        `R@10=${cat.avg_recall_at_10.toFixed(3)} ` +
        `NDCG=${cat.avg_ndcg.toFixed(3)} ` +
        `MRR=${cat.avg_mrr.toFixed(3)} ` +
        `Lat=${cat.avg_latency_ms.toFixed(0)}ms ` +
        `(n=${cat.count})`
    );
  }
  lines.push("");

  // By difficulty
  lines.push(thinDivider);
  lines.push("  BY DIFFICULTY");
  lines.push(thinDivider);
  for (const diff of report.by_difficulty) {
    lines.push(
      `  ${diff.difficulty.padEnd(8)} ` +
        `P@5=${diff.avg_precision_at_5.toFixed(3)} ` +
        `R@10=${diff.avg_recall_at_10.toFixed(3)} ` +
        `NDCG=${diff.avg_ndcg.toFixed(3)} ` +
        `MRR=${diff.avg_mrr.toFixed(3)} ` +
        `(n=${diff.count})`
    );
  }
  lines.push("");

  // Degraded queries
  if (report.degraded_queries.length > 0) {
    lines.push(thinDivider);
    lines.push("  DEGRADED QUERIES (zero relevant results)");
    lines.push(thinDivider);
    for (const qid of report.degraded_queries) {
      const qr = report.query_results.find((r) => r.query_id === qid);
      lines.push(`  ${qid}: "${qr?.query_text || "?"}" (${qr?.result_count || 0} results)`);
    }
    lines.push("");
  }

  // Failed queries (errors)
  const errorQueries = report.query_results.filter((r) => r.error);
  if (errorQueries.length > 0) {
    lines.push(thinDivider);
    lines.push("  ERROR QUERIES");
    lines.push(thinDivider);
    for (const qr of errorQueries) {
      lines.push(`  ${qr.query_id}: ${qr.error}`);
    }
    lines.push("");
  }

  lines.push(divider);
  return lines.join("\n");
}

/**
 * Format regression results as human-readable text.
 */
export function formatRegressions(regressions: RegressionResult[]): string {
  if (regressions.length === 0) {
    return "No regressions detected.";
  }

  const lines: string[] = [];
  lines.push("REGRESSIONS DETECTED:");
  lines.push("-".repeat(70));

  for (const r of regressions) {
    lines.push(
      `  ${r.query_id} | ${r.metric}: ${r.previous_value.toFixed(3)} -> ${r.current_value.toFixed(3)} (${r.delta.toFixed(3)})`
    );
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function round(n: number, digits: number = 4): number {
  const factor = Math.pow(10, digits);
  return Math.round(n * factor) / factor;
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}
