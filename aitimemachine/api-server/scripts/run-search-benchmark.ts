#!/usr/bin/env npx tsx
/**
 * Search Relevance Benchmark Runner
 *
 * CLI tool to run the semantic search benchmark suite, produce a JSON report
 * and a human-readable summary, and optionally compare against a previous run
 * for regression detection.
 *
 * Usage:
 *   npx tsx scripts/run-search-benchmark.ts
 *
 * Environment variables:
 *   BENCH_BASE_URL       - API server URL (default: http://localhost:3001/v1)
 *   BENCH_API_KEY        - API key for authentication (required)
 *   BENCH_OUTPUT_JSON    - Path to write JSON report (default: benchmark-report.json)
 *   BENCH_PREVIOUS_JSON  - Path to previous run for regression comparison
 *   BENCH_CATEGORIES     - Comma-separated category filter (code,checkpoint,conversation,multi)
 *   BENCH_DIFFICULTIES   - Comma-separated difficulty filter (easy,medium,hard)
 *   BENCH_TIMEOUT        - Request timeout in ms (default: 10000)
 *   BENCH_DEGRADE_THRESHOLD - Regression detection threshold (default: 0.1)
 *
 * Threshold overrides (set as env vars):
 *   BENCH_MIN_PRECISION_5   - Minimum Precision@5 (default: 0.6)
 *   BENCH_MIN_PRECISION_10  - Minimum Precision@10 (default: 0.5)
 *   BENCH_MIN_PRECISION_20  - Minimum Precision@20 (default: 0.4)
 *   BENCH_MIN_RECALL_10     - Minimum Recall@10 (default: 0.7)
 *   BENCH_MIN_NDCG          - Minimum NDCG (default: 0.65)
 *   BENCH_MIN_MRR           - Minimum MRR (default: 0.5)
 *   BENCH_MAX_P95_LATENCY   - Maximum P95 latency in ms (default: 500)
 *
 * Exit codes:
 *   0 - All thresholds passed
 *   1 - One or more thresholds failed
 *   2 - Configuration error
 */

import fs from "fs";
import path from "path";
import process from "process";

import {
  runBenchmark,
  detectRegressions,
  formatReport,
  formatRegressions,
  DEFAULT_THRESHOLDS,
  type BenchmarkConfig,
  type BenchmarkReport,
  type BenchmarkThresholds,
} from "../tests/benchmarks/search-benchmark.js";
import type { BenchmarkCategory, BenchmarkDifficulty } from "../tests/benchmarks/search-benchmark-data.js";

// ---------------------------------------------------------------------------
// Parse CLI / Env
// ---------------------------------------------------------------------------

function envFloat(key: string): number | undefined {
  const val = process.env[key];
  if (val === undefined) return undefined;
  const num = parseFloat(val);
  return Number.isFinite(num) ? num : undefined;
}

function envInt(key: string): number | undefined {
  const val = process.env[key];
  if (val === undefined) return undefined;
  const num = parseInt(val, 10);
  return Number.isFinite(num) ? num : undefined;
}

function envList(key: string): string[] | undefined {
  const val = process.env[key];
  if (!val) return undefined;
  return val.split(",").map((s) => s.trim()).filter(Boolean);
}

async function main() {
  const baseUrl = process.env.BENCH_BASE_URL || "http://localhost:3001/v1";
  const apiKey = process.env.BENCH_API_KEY;
  const outputJson = process.env.BENCH_OUTPUT_JSON || "benchmark-report.json";
  const previousJson = process.env.BENCH_PREVIOUS_JSON;
  const degradeThreshold = envFloat("BENCH_DEGRADE_THRESHOLD") ?? 0.1;
  const requestTimeout = envInt("BENCH_TIMEOUT") ?? 10000;

  if (!apiKey) {
    console.error("Error: BENCH_API_KEY environment variable is required.");
    console.error("");
    console.error("Usage:");
    console.error("  BENCH_API_KEY=your-key npx tsx scripts/run-search-benchmark.ts");
    process.exit(2);
  }

  // Build thresholds from env or defaults
  const thresholds: BenchmarkThresholds = {
    precision_at_5: envFloat("BENCH_MIN_PRECISION_5") ?? DEFAULT_THRESHOLDS.precision_at_5,
    precision_at_10: envFloat("BENCH_MIN_PRECISION_10") ?? DEFAULT_THRESHOLDS.precision_at_10,
    precision_at_20: envFloat("BENCH_MIN_PRECISION_20") ?? DEFAULT_THRESHOLDS.precision_at_20,
    recall_at_10: envFloat("BENCH_MIN_RECALL_10") ?? DEFAULT_THRESHOLDS.recall_at_10,
    ndcg: envFloat("BENCH_MIN_NDCG") ?? DEFAULT_THRESHOLDS.ndcg,
    mrr: envFloat("BENCH_MIN_MRR") ?? DEFAULT_THRESHOLDS.mrr,
    p95_latency_ms: envFloat("BENCH_MAX_P95_LATENCY") ?? DEFAULT_THRESHOLDS.p95_latency_ms,
  };

  // Parse optional filters
  const categories = envList("BENCH_CATEGORIES") as BenchmarkCategory[] | undefined;
  const difficulties = envList("BENCH_DIFFICULTIES") as BenchmarkDifficulty[] | undefined;

  // Validate category values
  const validCategories = new Set<string>(["code", "checkpoint", "conversation", "multi"]);
  if (categories) {
    for (const c of categories) {
      if (!validCategories.has(c)) {
        console.error(`Error: Invalid category "${c}". Valid: ${[...validCategories].join(", ")}`);
        process.exit(2);
      }
    }
  }

  const validDifficulties = new Set<string>(["easy", "medium", "hard"]);
  if (difficulties) {
    for (const d of difficulties) {
      if (!validDifficulties.has(d)) {
        console.error(`Error: Invalid difficulty "${d}". Valid: ${[...validDifficulties].join(", ")}`);
        process.exit(2);
      }
    }
  }

  // Print header
  console.log("Search Relevance Benchmark");
  console.log("==========================");
  console.log(`Base URL:    ${baseUrl}`);
  console.log(`Output:      ${outputJson}`);
  if (categories) console.log(`Categories:  ${categories.join(", ")}`);
  if (difficulties) console.log(`Difficulties: ${difficulties.join(", ")}`);
  console.log(`Timeout:     ${requestTimeout}ms`);
  console.log("");

  // Build config
  const config: BenchmarkConfig = {
    baseUrl,
    apiKey,
    thresholds,
    categories,
    difficulties,
    requestTimeout,
  };

  // Run benchmark
  console.log("Running benchmark...");
  console.log("");

  const report = await runBenchmark(config);

  // Print human-readable report
  console.log(formatReport(report));

  // Write JSON report
  const outputPath = path.resolve(process.cwd(), outputJson);
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`JSON report written to: ${outputPath}`);

  // Regression detection
  if (previousJson) {
    const prevPath = path.resolve(process.cwd(), previousJson);
    if (fs.existsSync(prevPath)) {
      console.log("");
      console.log(`Comparing against previous run: ${prevPath}`);
      const previousReport = JSON.parse(
        fs.readFileSync(prevPath, "utf-8")
      ) as BenchmarkReport;

      const regressions = detectRegressions(report, previousReport, degradeThreshold);

      if (regressions.length > 0) {
        console.log("");
        console.log(formatRegressions(regressions));
        console.log("");
        console.log(`${regressions.length} regression(s) detected (threshold: ${degradeThreshold})`);
      } else {
        console.log("No regressions detected.");
      }

      // Also include regression info in the report
      const enrichedReport = {
        ...report,
        regression_comparison: {
          previous_timestamp: previousReport.timestamp,
          degrade_threshold: degradeThreshold,
          regressions,
        },
      };
      fs.writeFileSync(outputPath, JSON.stringify(enrichedReport, null, 2));
    } else {
      console.warn(`Warning: Previous report not found at ${prevPath}, skipping regression check.`);
    }
  }

  // Exit code based on pass/fail
  if (!report.passed) {
    console.log("");
    console.error("BENCHMARK FAILED - one or more thresholds not met.");
    const failedMetrics = report.metrics.filter((m) => !m.passed);
    for (const fm of failedMetrics) {
      const direction = fm.name.includes("Latency") ? "<=" : ">=";
      console.error(`  ${fm.name}: ${fm.value} (threshold ${direction} ${fm.threshold})`);
    }
    process.exit(1);
  }

  console.log("");
  console.log("BENCHMARK PASSED - all thresholds met.");
}

main().catch((error) => {
  console.error("Benchmark runner failed:", error);
  process.exit(2);
});
