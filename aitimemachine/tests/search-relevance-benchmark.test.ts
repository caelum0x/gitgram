import { describe, expect, it } from "vitest";

import {
  getSearchRelevanceThresholds,
  runSearchRelevanceBenchmark,
  type SearchRelevanceScenario,
} from "../src/core/search-relevance-benchmark.js";

describe("search relevance benchmark", () => {
  it("returns benchmark metrics and case-level results", () => {
    const report = runSearchRelevanceBenchmark();

    expect(report.metrics.totalCases).toBeGreaterThan(0);
    expect(report.cases).toHaveLength(report.metrics.totalCases);
    expect(report.metrics.top1Accuracy).toBeGreaterThanOrEqual(0);
    expect(report.metrics.top1Accuracy).toBeLessThanOrEqual(1);
    expect(report.metrics.mrr).toBeGreaterThanOrEqual(0);
    expect(report.metrics.mrr).toBeLessThanOrEqual(1);
    expect(report.metrics.recallAt3).toBeGreaterThanOrEqual(0);
    expect(report.metrics.recallAt3).toBeLessThanOrEqual(1);
  });

  it("supports env-based threshold overrides", () => {
    const thresholds = getSearchRelevanceThresholds({
      AITM_SEARCH_RELEVANCE_MIN_TOP1: "0.71",
      AITM_SEARCH_RELEVANCE_MIN_MRR: "0.8",
      AITM_SEARCH_RELEVANCE_MIN_RECALL_AT3: "0.99",
    } as NodeJS.ProcessEnv);

    expect(thresholds.minTop1Accuracy).toBe(0.71);
    expect(thresholds.minMrr).toBe(0.8);
    expect(thresholds.minRecallAt3).toBe(0.99);
  });
});

describe("search relevance edge cases", () => {
  it("handles empty corpus (no checkpoints) gracefully", () => {
    const scenarios: SearchRelevanceScenario[] = [
      { id: "empty-test", query: "tests passed", expectedCheckpointIds: ["cp_01"] },
    ];

    const report = runSearchRelevanceBenchmark({
      scenarios,
      checkpoints: [], // empty corpus
      thresholds: { minTop1Accuracy: 0, minMrr: 0, minRecallAt3: 0 },
    });

    expect(report.metrics.totalCases).toBe(1);
    // No checkpoints means no results, all metrics should be 0
    expect(report.metrics.top1Accuracy).toBe(0);
    expect(report.metrics.mrr).toBe(0);
    expect(report.metrics.recallAt3).toBe(0);

    // Case-level: no top result, reciprocal rank 0
    expect(report.cases[0].topResultCheckpointId).toBeUndefined();
    expect(report.cases[0].reciprocalRank).toBe(0);
    expect(report.cases[0].hitAt1).toBe(false);
    expect(report.cases[0].hitAt3).toBe(false);

    // With 0 thresholds, the report should still pass
    expect(report.passed).toBe(true);
  });

  it("handles single result in corpus", () => {
    const checkpoints = [
      { checkpointId: "cp_only", name: "Tests passed after fix", createdAt: "2026-02-15T10:00:00.000Z" },
    ];
    const scenarios: SearchRelevanceScenario[] = [
      { id: "single-match", query: "last time tests passed", expectedCheckpointIds: ["cp_only"] },
    ];

    const report = runSearchRelevanceBenchmark({
      scenarios,
      checkpoints,
      thresholds: { minTop1Accuracy: 1.0, minMrr: 1.0, minRecallAt3: 1.0 },
    });

    expect(report.metrics.totalCases).toBe(1);
    // The single checkpoint should match
    expect(report.cases[0].topResultCheckpointId).toBe("cp_only");
    expect(report.cases[0].hitAt1).toBe(true);
    expect(report.cases[0].hitAt3).toBe(true);
    expect(report.cases[0].reciprocalRank).toBe(1);
    expect(report.metrics.top1Accuracy).toBe(1);
    expect(report.metrics.mrr).toBe(1);
    expect(report.metrics.recallAt3).toBe(1);
    expect(report.passed).toBe(true);
  });

  it("handles no matches (query does not match any checkpoint)", () => {
    const checkpoints = [
      { checkpointId: "cp_unrelated", name: "Deploy production hotfix", createdAt: "2026-02-15T10:00:00.000Z" },
      { checkpointId: "cp_unrelated2", name: "Refactor auth middleware", createdAt: "2026-02-15T09:00:00.000Z" },
    ];
    const scenarios: SearchRelevanceScenario[] = [
      {
        id: "no-match",
        query: "zebra unicorn nonexistent",
        expectedCheckpointIds: ["cp_phantom"],
      },
    ];

    const report = runSearchRelevanceBenchmark({
      scenarios,
      checkpoints,
      thresholds: { minTop1Accuracy: 0, minMrr: 0, minRecallAt3: 0 },
    });

    expect(report.metrics.totalCases).toBe(1);
    // Expected checkpoint does not exist in results
    expect(report.cases[0].reciprocalRank).toBe(0);
    expect(report.cases[0].hitAt1).toBe(false);
    expect(report.cases[0].hitAt3).toBe(false);
    expect(report.metrics.top1Accuracy).toBe(0);
    expect(report.metrics.mrr).toBe(0);
    expect(report.metrics.recallAt3).toBe(0);
  });

  it("handles scenario with multiple expected IDs where only later results match", () => {
    const checkpoints = [
      { checkpointId: "cp_a", name: "Fix login page CSS", createdAt: "2026-02-15T10:00:00.000Z" },
      { checkpointId: "cp_b", name: "Add checkout flow", createdAt: "2026-02-15T09:00:00.000Z" },
      { checkpointId: "cp_c", name: "Checkout payment parser fix", createdAt: "2026-02-15T08:00:00.000Z" },
    ];
    const scenarios: SearchRelevanceScenario[] = [
      {
        id: "later-match",
        query: "checkout",
        expectedCheckpointIds: ["cp_b", "cp_c"],
      },
    ];

    const report = runSearchRelevanceBenchmark({
      scenarios,
      checkpoints,
      thresholds: { minTop1Accuracy: 0, minMrr: 0, minRecallAt3: 0 },
    });

    expect(report.metrics.totalCases).toBe(1);
    // At least one of the expected IDs should be found
    const caseResult = report.cases[0];
    expect(caseResult.reciprocalRank).toBeGreaterThan(0);
    // Both cp_b and cp_c contain "checkout" so first relevant rank should be 1
    expect(caseResult.hitAt3).toBe(true);
  });
});

describe("search relevance threshold enforcement", () => {
  it("fails when top1Accuracy is below threshold", () => {
    const checkpoints = [
      { checkpointId: "cp_wrong", name: "Deploy something", createdAt: "2026-02-15T10:00:00.000Z" },
    ];
    const scenarios: SearchRelevanceScenario[] = [
      { id: "miss", query: "deploy something", expectedCheckpointIds: ["cp_not_in_corpus"] },
    ];

    const report = runSearchRelevanceBenchmark({
      scenarios,
      checkpoints,
      thresholds: { minTop1Accuracy: 0.5, minMrr: 0, minRecallAt3: 0 },
    });

    // top1Accuracy is 0 (expected ID not in results), threshold requires 0.5
    expect(report.passed).toBe(false);
    expect(report.metrics.top1Accuracy).toBe(0);
  });

  it("fails when MRR is below threshold", () => {
    const checkpoints = [
      { checkpointId: "cp_01", name: "Tests passed", createdAt: "2026-02-15T10:00:00.000Z" },
    ];
    const scenarios: SearchRelevanceScenario[] = [
      { id: "match", query: "tests passed", expectedCheckpointIds: ["cp_01"] },
      { id: "miss", query: "build failed", expectedCheckpointIds: ["cp_nonexistent"] },
    ];

    const report = runSearchRelevanceBenchmark({
      scenarios,
      checkpoints,
      thresholds: { minTop1Accuracy: 0, minMrr: 0.9, minRecallAt3: 0 },
    });

    // MRR = (1 + 0) / 2 = 0.5, threshold requires 0.9
    expect(report.passed).toBe(false);
    expect(report.metrics.mrr).toBeCloseTo(0.5, 2);
  });

  it("fails when recallAt3 is below threshold", () => {
    const checkpoints = [
      { checkpointId: "cp_01", name: "Tests passed", createdAt: "2026-02-15T10:00:00.000Z" },
    ];
    const scenarios: SearchRelevanceScenario[] = [
      { id: "match", query: "tests passed", expectedCheckpointIds: ["cp_01"] },
      { id: "miss1", query: "build failed", expectedCheckpointIds: ["cp_x"] },
      { id: "miss2", query: "deploy prod", expectedCheckpointIds: ["cp_y"] },
    ];

    const report = runSearchRelevanceBenchmark({
      scenarios,
      checkpoints,
      thresholds: { minTop1Accuracy: 0, minMrr: 0, minRecallAt3: 0.9 },
    });

    // recallAt3 = 1/3 = 0.333, threshold requires 0.9
    expect(report.passed).toBe(false);
    expect(report.metrics.recallAt3).toBeCloseTo(1 / 3, 2);
  });

  it("passes when all metrics meet or exceed thresholds", () => {
    const checkpoints = [
      { checkpointId: "cp_01", name: "Tests passed after auth fix", createdAt: "2026-02-15T10:00:00.000Z" },
      { checkpointId: "cp_02", name: "Build failed on CI", createdAt: "2026-02-15T09:00:00.000Z" },
    ];
    const scenarios: SearchRelevanceScenario[] = [
      { id: "tests", query: "last time tests passed", expectedCheckpointIds: ["cp_01"] },
      { id: "build", query: "when build failed", expectedCheckpointIds: ["cp_02"] },
    ];

    const report = runSearchRelevanceBenchmark({
      scenarios,
      checkpoints,
      thresholds: { minTop1Accuracy: 0.5, minMrr: 0.5, minRecallAt3: 0.5 },
    });

    expect(report.passed).toBe(true);
    expect(report.metrics.top1Accuracy).toBeGreaterThanOrEqual(0.5);
    expect(report.metrics.mrr).toBeGreaterThanOrEqual(0.5);
    expect(report.metrics.recallAt3).toBeGreaterThanOrEqual(0.5);
  });

  it("passes with exact threshold boundary values", () => {
    const checkpoints = [
      { checkpointId: "cp_01", name: "Tests passed", createdAt: "2026-02-15T10:00:00.000Z" },
      { checkpointId: "cp_02", name: "Build work done", createdAt: "2026-02-15T09:00:00.000Z" },
    ];
    const scenarios: SearchRelevanceScenario[] = [
      { id: "match", query: "tests passed", expectedCheckpointIds: ["cp_01"] },
      { id: "miss", query: "deploy prod", expectedCheckpointIds: ["cp_nonexistent"] },
    ];

    const report = runSearchRelevanceBenchmark({
      scenarios,
      checkpoints,
      // Set thresholds to exactly match what we expect:
      // top1 = 0.5 (1 hit / 2 cases), mrr = 0.5 (1+0)/2, recall@3 = 0.5 (1/2)
      thresholds: { minTop1Accuracy: 0.5, minMrr: 0.5, minRecallAt3: 0.5 },
    });

    expect(report.passed).toBe(true);
  });
});
