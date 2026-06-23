/**
 * Universal Search Evaluation Harness
 * Tests search quality against known fixtures
 * 
 * Usage:
 *   npx ts-node tests/eval/search-eval.ts
 *   npm run test:eval
 */

import { describe, it, expect, beforeAll } from "vitest";

// Test fixtures representing real search scenarios
interface SearchFixture {
  id: string;
  query: string;
  expectedResults: {
    source: string;
    mustContain?: string[];   // At least one of these should appear in top results
    mustNotContain?: string[]; // These should NOT appear in top results
    minScore?: number;
  };
  category: "code" | "kb" | "artifact" | "context" | "mixed";
}

const FIXTURES: SearchFixture[] = [
  // Code search
  {
    id: "code-function-name",
    query: "createCheckpoint",
    expectedResults: {
      source: "code",
      mustContain: ["checkpoint", "create"],
    },
    category: "code",
  },
  {
    id: "code-snake-case",
    query: "create_checkpoint",
    expectedResults: {
      source: "code",
      mustContain: ["checkpoint", "createCheckpoint", "create_checkpoint"],
    },
    category: "code",
  },
  {
    id: "code-camel-case",
    query: "getUserById",
    expectedResults: {
      source: "code",
      mustContain: ["user", "get", "getUser"],
    },
    category: "code",
  },
  
  // Knowledge base search
  {
    id: "kb-concept",
    query: "time travel restore",
    expectedResults: {
      source: "knowledge_base",
      mustContain: ["restore", "checkpoint", "time"],
    },
    category: "kb",
  },
  {
    id: "kb-error-handling",
    query: "error handling API",
    expectedResults: {
      source: "knowledge_base",
      mustContain: ["error", "API", "handling"],
    },
    category: "kb",
  },
  
  // Artifact search
  {
    id: "artifact-export",
    query: "session export JSON",
    expectedResults: {
      source: "artifact",
      mustContain: ["export", "session", "JSON"],
    },
    category: "artifact",
  },
  
  // Context search
  {
    id: "context-conversation",
    query: "implement feature",
    expectedResults: {
      source: "context",
      mustContain: ["implement", "feature"],
    },
    category: "context",
  },
  
  // Mixed source queries
  {
    id: "mixed-restore",
    query: "restore previous state",
    expectedResults: {
      source: "mixed",
      mustContain: ["restore", "state", "previous", "checkpoint"],
    },
    category: "mixed",
  },
  {
    id: "mixed-search",
    query: "search embeddings semantic",
    expectedResults: {
      source: "mixed",
      mustContain: ["search", "embedding", "semantic"],
    },
    category: "mixed",
  },
];

// Evaluation metrics
interface EvalMetrics {
  precision: number;      // Relevant results / Retrieved results
  recall: number;         // Relevant results / Total relevant
  mrr: number;            // Mean Reciprocal Rank
  ndcg: number;           // Normalized Discounted Cumulative Gain
}

interface EvalResult {
  fixtureId: string;
  passed: boolean;
  metrics: Partial<EvalMetrics>;
  topResults: Array<{ title: string; score: number; source: string }>;
  errors?: string[];
}

// Threshold for CI pass/fail
const THRESHOLDS = {
  minPrecision: 0.8,
  minRecall: 0.6,
  minMRR: 0.5,
  minPassRate: 0.8,
};

/**
 * Mock search function - replace with actual API call in integration tests
 */
async function mockSearch(query: string): Promise<any[]> {
  // This would be replaced with actual HTTP call to universal-search endpoint
  return [];
}

/**
 * Calculate precision for a single query
 */
function calculatePrecision(
  results: any[],
  fixture: SearchFixture,
  k: number = 10
): number {
  const topK = results.slice(0, k);
  if (topK.length === 0) return 0;
  
  const mustContain = fixture.expectedResults.mustContain || [];
  let relevant = 0;
  
  for (const result of topK) {
    const text = `${result.title || ""} ${result.snippet || ""}`.toLowerCase();
    const isRelevant = mustContain.some(term => text.includes(term.toLowerCase()));
    if (isRelevant) relevant++;
  }
  
  return relevant / topK.length;
}

/**
 * Calculate Mean Reciprocal Rank
 */
function calculateMRR(results: any[], fixture: SearchFixture): number {
  const mustContain = fixture.expectedResults.mustContain || [];
  
  for (let i = 0; i < results.length; i++) {
    const text = `${results[i].title || ""} ${results[i].snippet || ""}`.toLowerCase();
    const isRelevant = mustContain.some(term => text.includes(term.toLowerCase()));
    if (isRelevant) {
      return 1 / (i + 1);
    }
  }
  
  return 0;
}

/**
 * Run evaluation for a single fixture
 */
async function evaluateFixture(
  fixture: SearchFixture,
  searchFn: (query: string) => Promise<any[]>
): Promise<EvalResult> {
  const errors: string[] = [];
  
  try {
    const results = await searchFn(fixture.query);
    
    // Check for required terms
    const mustContain = fixture.expectedResults.mustContain || [];
    const topResults = results.slice(0, 5).map(r => ({
      title: r.title,
      score: r.score,
      source: r.source,
    }));
    
    let foundTerms = 0;
    for (const term of mustContain) {
      const found = results.slice(0, 10).some(r => {
        const text = `${r.title || ""} ${r.snippet || ""}`.toLowerCase();
        return text.includes(term.toLowerCase());
      });
      if (found) foundTerms++;
    }
    
    const precision = calculatePrecision(results, fixture);
    const mrr = calculateMRR(results, fixture);
    
    // Check must not contain
    const mustNotContain = fixture.expectedResults.mustNotContain || [];
    for (const term of mustNotContain) {
      const found = results.slice(0, 5).some(r => {
        const text = `${r.title || ""} ${r.snippet || ""}`.toLowerCase();
        return text.includes(term.toLowerCase());
      });
      if (found) {
        errors.push(`Unwanted term "${term}" found in top results`);
      }
    }
    
    const passed = 
      precision >= THRESHOLDS.minPrecision &&
      mrr >= THRESHOLDS.minMRR &&
      errors.length === 0;
    
    return {
      fixtureId: fixture.id,
      passed,
      metrics: { precision, mrr },
      topResults,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    return {
      fixtureId: fixture.id,
      passed: false,
      metrics: {},
      topResults: [],
      errors: [`Evaluation failed: ${(error as Error).message}`],
    };
  }
}

/**
 * Run full evaluation suite
 */
export async function runEvaluation(
  searchFn: (query: string) => Promise<any[]>,
  fixtures: SearchFixture[] = FIXTURES
): Promise<{
  passed: boolean;
  passRate: number;
  results: EvalResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    avgPrecision: number;
    avgMRR: number;
  };
}> {
  const results: EvalResult[] = [];
  
  for (const fixture of fixtures) {
    const result = await evaluateFixture(fixture, searchFn);
    results.push(result);
  }
  
  const passed = results.filter(r => r.passed).length;
  const passRate = passed / results.length;
  
  const avgPrecision = results
    .filter(r => r.metrics.precision !== undefined)
    .reduce((sum, r) => sum + (r.metrics.precision || 0), 0) / results.length;
  
  const avgMRR = results
    .filter(r => r.metrics.mrr !== undefined)
    .reduce((sum, r) => sum + (r.metrics.mrr || 0), 0) / results.length;
  
  return {
    passed: passRate >= THRESHOLDS.minPassRate,
    passRate,
    results,
    summary: {
      total: results.length,
      passed,
      failed: results.length - passed,
      avgPrecision,
      avgMRR,
    },
  };
}

// Export for use in tests
export { FIXTURES, THRESHOLDS, SearchFixture, EvalResult };

// CLI runner
if (process.argv[1]?.includes("search-eval")) {
  console.log("Search Evaluation Harness");
  console.log("=========================");
  console.log(`Fixtures: ${FIXTURES.length}`);
  console.log(`Thresholds: Precision >= ${THRESHOLDS.minPrecision}, MRR >= ${THRESHOLDS.minMRR}`);
  console.log("\nNote: Run with actual API for real evaluation");
}
