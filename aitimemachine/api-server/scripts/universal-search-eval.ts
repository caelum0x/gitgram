import fs from "fs";
import path from "path";
import process from "process";

import {
  BENCHMARK_QUERIES,
  getCategorySummary,
  getDifficultySummary,
  type BenchmarkQuery,
  type ExpectedResult,
} from "../tests/benchmarks/search-benchmark-data.js";

type EvalExpected = {
  source?: string;
  id?: string;
  title_contains?: string;
  snippet_contains?: string;
  file_path_contains?: string;
  metadata_contains?: Record<string, unknown>;
  weight?: number;
};

type EvalCase = {
  name: string;
  query: string;
  endpoint?: "search" | "query";
  search_mode?: "unified" | "hybrid" | "semantic";
  sources?: string[];
  repositories?: string[];
  context?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  expected: EvalExpected[];
};

type EvalFile = {
  description?: string;
  cases: EvalCase[];
};

type SearchResult = {
  id: string;
  source: string;
  title: string;
  snippet: string;
  score?: number;
  metadata?: Record<string, unknown>;
};

type SearchResponse = {
  data?: SearchResult[];
  query?: string;
};

const DEFAULT_FIXTURE = path.resolve(
  process.cwd(),
  "tests/fixtures/universal-search-eval.json"
);

function parseKList(value?: string): number[] {
  if (!value) return [1, 3, 5, 10];
  return value
    .split(",")
    .map((v) => Number.parseInt(v.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function contains(text: string | undefined, needle?: string): boolean {
  if (!needle) return true;
  if (!text) return false;
  return text.toLowerCase().includes(needle.toLowerCase());
}

function matchExpected(result: SearchResult, expected: EvalExpected): boolean {
  if (expected.source && result.source !== expected.source) return false;
  if (expected.id && result.id !== expected.id) return false;
  if (expected.title_contains && !contains(result.title, expected.title_contains)) return false;
  if (expected.snippet_contains && !contains(result.snippet, expected.snippet_contains)) return false;
  if (expected.file_path_contains) {
    const filePath = (result.metadata?.file_path as string | undefined) || "";
    if (!contains(filePath, expected.file_path_contains)) return false;
  }
  if (expected.metadata_contains) {
    for (const [key, value] of Object.entries(expected.metadata_contains)) {
      if ((result.metadata as any)?.[key] !== value) return false;
    }
  }
  return true;
}

function findRank(results: SearchResult[], expected: EvalExpected): number | null {
  for (let i = 0; i < results.length; i++) {
    if (matchExpected(results[i], expected)) {
      return i + 1;
    }
  }
  return null;
}

async function fetchSearch(
  baseUrl: string,
  apiKey: string,
  evalCase: EvalCase
): Promise<SearchResponse> {
  const endpoint = evalCase.endpoint === "query" ? "/universal-search/query" : "/universal-search";
  const url = `${baseUrl}${endpoint}`;

  const body =
    evalCase.endpoint === "query"
      ? {
          query: evalCase.query,
          context: evalCase.context || [],
          repositories: evalCase.repositories || [],
          include_sources: true,
          search_mode: evalCase.search_mode || "hybrid",
        }
      : {
          query: evalCase.query,
          repositories: evalCase.repositories || [],
          search_mode: evalCase.search_mode || "hybrid",
          sources: evalCase.sources || undefined,
        };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed (${response.status}): ${text}`);
  }

  return (await response.json()) as SearchResponse;
}

async function main() {
  const fixturePath = process.env.EVAL_FIXTURE || DEFAULT_FIXTURE;
  const baseUrl = process.env.EVAL_BASE_URL || "http://localhost:3001/v1";
  const apiKey = process.env.EVAL_API_KEY;
  const kList = parseKList(process.env.EVAL_K);
  const minMrr = process.env.EVAL_MIN_MRR ? Number.parseFloat(process.env.EVAL_MIN_MRR) : null;
  const minRecall = process.env.EVAL_MIN_RECALL ? Number.parseFloat(process.env.EVAL_MIN_RECALL) : null;
  const minWeightedMrr = process.env.EVAL_MIN_WEIGHTED_MRR
    ? Number.parseFloat(process.env.EVAL_MIN_WEIGHTED_MRR)
    : null;
  const minWeightedRecall = process.env.EVAL_MIN_WEIGHTED_RECALL
    ? Number.parseFloat(process.env.EVAL_MIN_WEIGHTED_RECALL)
    : null;

  if (!apiKey) {
    console.error("Missing EVAL_API_KEY env var");
    process.exit(1);
  }

  const fixtureRaw = fs.readFileSync(fixturePath, "utf8");
  const fixture = JSON.parse(fixtureRaw) as EvalFile;

  if (!fixture.cases || fixture.cases.length === 0) {
    console.error("No cases found in fixture:", fixturePath);
    process.exit(1);
  }

  let totalCases = 0;
  let mrrSum = 0;
  const recallHits: Record<number, number> = {};
  const recallTotals: Record<number, number> = {};

  const sourceStats: Record<
    string,
    {
      cases: number;
      mrrSum: number;
      recallHits: Record<number, number>;
      recallTotals: Record<number, number>;
    }
  > = {};

  const weightedStats: Record<
    string,
    {
      weightSum: number;
      mrrSum: number;
      recallHits: Record<number, number>;
      recallTotals: Record<number, number>;
    }
  > = {};

  const perCaseRows: Array<Record<string, unknown>> = [];
  const perCaseJson: Array<Record<string, unknown>> = [];

  for (const k of kList) {
    recallHits[k] = 0;
    recallTotals[k] = 0;
  }

  console.log(`Universal search eval: ${fixturePath}`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Cases: ${fixture.cases.length}`);
  console.log(`K values: ${kList.join(", ")}`);
  console.log("");

  for (const evalCase of fixture.cases) {
    totalCases += 1;
    const response = await fetchSearch(baseUrl, apiKey, evalCase);
    const results = response.data || [];

    let bestRank: number | null = null;
    let bestExpected: EvalExpected | null = null;
    for (const expected of evalCase.expected) {
      const rank = findRank(results, expected);
      if (rank && (!bestRank || rank < bestRank)) {
        bestRank = rank;
        bestExpected = expected;
      }
    }

    const mrr = bestRank ? 1 / bestRank : 0;
    mrrSum += mrr;

    const caseSource = bestExpected?.source || evalCase.sources?.[0] || "unknown";
    if (!sourceStats[caseSource]) {
      sourceStats[caseSource] = {
        cases: 0,
        mrrSum: 0,
        recallHits: {},
        recallTotals: {},
      };
      for (const k of kList) {
        sourceStats[caseSource].recallHits[k] = 0;
        sourceStats[caseSource].recallTotals[k] = 0;
      }
    }

    sourceStats[caseSource].cases += 1;
    sourceStats[caseSource].mrrSum += mrr;

    const weight = bestExpected?.weight ?? 1;
    if (!weightedStats[caseSource]) {
      weightedStats[caseSource] = {
        weightSum: 0,
        mrrSum: 0,
        recallHits: {},
        recallTotals: {},
      };
      for (const k of kList) {
        weightedStats[caseSource].recallHits[k] = 0;
        weightedStats[caseSource].recallTotals[k] = 0;
      }
    }

    weightedStats[caseSource].weightSum += weight;
    weightedStats[caseSource].mrrSum += mrr * weight;

    for (const k of kList) {
      recallTotals[k] += 1;
      if (bestRank && bestRank <= k) {
        recallHits[k] += 1;
      }
      sourceStats[caseSource].recallTotals[k] += 1;
      if (bestRank && bestRank <= k) {
        sourceStats[caseSource].recallHits[k] += 1;
      }

      weightedStats[caseSource].recallTotals[k] += weight;
      if (bestRank && bestRank <= k) {
        weightedStats[caseSource].recallHits[k] += weight;
      }
    }

    console.log(
      `${evalCase.name}: best_rank=${bestRank ?? "miss"} mrr=${mrr.toFixed(3)} results=${results.length}`
    );

    perCaseRows.push({
      name: evalCase.name,
      query: evalCase.query,
      source: caseSource,
      best_rank: bestRank ?? "miss",
      mrr: mrr.toFixed(3),
      results: results.length,
    });
    perCaseJson.push({
      name: evalCase.name,
      query: evalCase.query,
      source: caseSource,
      best_rank: bestRank,
      mrr,
      results: results.length,
    });
  }

  console.log("");
  const overallMrr = mrrSum / totalCases;
  console.log(`MRR: ${overallMrr.toFixed(3)}`);
  for (const k of kList) {
    const recall = recallHits[k] / recallTotals[k];
    console.log(`Recall@${k}: ${recall.toFixed(3)} (${recallHits[k]}/${recallTotals[k]})`);
  }

  console.log("");
  console.log("Per-source breakdown:");
  for (const [source, stats] of Object.entries(sourceStats)) {
    const mrr = stats.cases > 0 ? stats.mrrSum / stats.cases : 0;
    console.log(`- ${source}: MRR=${mrr.toFixed(3)} cases=${stats.cases}`);
    for (const k of kList) {
      const recall = stats.recallHits[k] / stats.recallTotals[k];
      console.log(`  Recall@${k}: ${recall.toFixed(3)} (${stats.recallHits[k]}/${stats.recallTotals[k]})`);
    }
  }

  console.log("");
  console.log("Weighted per-source breakdown:");
  for (const [source, stats] of Object.entries(weightedStats)) {
    const mrr = stats.weightSum > 0 ? stats.mrrSum / stats.weightSum : 0;
    console.log(`- ${source}: weighted_MRR=${mrr.toFixed(3)} weight=${stats.weightSum.toFixed(2)}`);
    for (const k of kList) {
      const recall = stats.recallHits[k] / stats.recallTotals[k];
      console.log(`  weighted_Recall@${k}: ${recall.toFixed(3)} (${stats.recallHits[k].toFixed(2)}/${stats.recallTotals[k].toFixed(2)})`);
    }
  }

  const primaryK = kList[0];
  const overallRecall = recallHits[primaryK] / recallTotals[primaryK];
  const weightedMrrOverall = Object.values(weightedStats).reduce(
    (sum, stats) => sum + stats.mrrSum,
    0
  );
  const weightedTotal = Object.values(weightedStats).reduce(
    (sum, stats) => sum + stats.weightSum,
    0
  );
  const weightedMrr = weightedTotal > 0 ? weightedMrrOverall / weightedTotal : 0;
  const weightedRecallTotal = Object.values(weightedStats).reduce(
    (sum, stats) => sum + (stats.recallHits[primaryK] || 0),
    0
  );
  const weightedRecallDen = Object.values(weightedStats).reduce(
    (sum, stats) => sum + (stats.recallTotals[primaryK] || 0),
    0
  );
  const weightedRecall = weightedRecallDen > 0 ? weightedRecallTotal / weightedRecallDen : 0;

  const failures: string[] = [];
  if (minMrr !== null && overallMrr < minMrr) {
    failures.push(`MRR ${overallMrr.toFixed(3)} < ${minMrr}`);
  }
  if (minRecall !== null && overallRecall < minRecall) {
    failures.push(`Recall@${primaryK} ${overallRecall.toFixed(3)} < ${minRecall}`);
  }
  if (minWeightedMrr !== null && weightedMrr < minWeightedMrr) {
    failures.push(`weighted MRR ${weightedMrr.toFixed(3)} < ${minWeightedMrr}`);
  }
  if (minWeightedRecall !== null && weightedRecall < minWeightedRecall) {
    failures.push(`weighted Recall@${primaryK} ${weightedRecall.toFixed(3)} < ${minWeightedRecall}`);
  }

  if (failures.length > 0) {
    console.error("Threshold failures:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(2);
  }

  if (process.env.EVAL_OUTPUT_JSON || process.env.EVAL_OUTPUT_CSV) {
    const output = {
      summary: {
        mrr: overallMrr,
        recall: Object.fromEntries(
          kList.map((k) => [k, recallHits[k] / recallTotals[k]])
        ),
        weighted_mrr: weightedMrr,
        weighted_recall: Object.fromEntries(
          kList.map((k) => {
            const hits = Object.values(weightedStats).reduce(
              (sum, stats) => sum + (stats.recallHits[k] || 0),
              0
            );
            const totals = Object.values(weightedStats).reduce(
              (sum, stats) => sum + (stats.recallTotals[k] || 0),
              0
            );
            return [k, totals > 0 ? hits / totals : 0];
          })
        ),
      },
      per_source: Object.fromEntries(
        Object.entries(sourceStats).map(([source, stats]) => [
          source,
          {
            mrr: stats.cases > 0 ? stats.mrrSum / stats.cases : 0,
            recall: Object.fromEntries(
              kList.map((k) => [k, stats.recallHits[k] / stats.recallTotals[k]])
            ),
          },
        ])
      ),
      weighted_per_source: Object.fromEntries(
        Object.entries(weightedStats).map(([source, stats]) => [
          source,
          {
            mrr: stats.weightSum > 0 ? stats.mrrSum / stats.weightSum : 0,
            recall: Object.fromEntries(
              kList.map((k) => [k, stats.recallHits[k] / stats.recallTotals[k]])
            ),
          },
        ])
      ),
      cases: perCaseJson,
    };

    if (process.env.EVAL_OUTPUT_JSON) {
      fs.writeFileSync(process.env.EVAL_OUTPUT_JSON, JSON.stringify(output, null, 2));
    }

    if (process.env.EVAL_OUTPUT_CSV) {
      const header = ["name", "query", "source", "best_rank", "mrr", "results"].join(",");
      const rows = perCaseRows.map((row) =>
        [row.name, row.query, row.source, row.best_rank, row.mrr, row.results]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(",")
      );
      fs.writeFileSync(process.env.EVAL_OUTPUT_CSV, [header, ...rows].join("\n"));
    }
  }
}

main().catch((error) => {
  console.error("Eval failed:", error);
  process.exit(1);
});
