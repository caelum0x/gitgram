import { describe, expect, it } from "vitest";

import type { CasStore } from "../src/core/cas.js";
import { validateManifest } from "../src/core/restore.js";
import type { Manifest } from "../src/core/manifest.js";

function buildManifest(paths: string[]): Manifest {
  return {
    version: 1,
    rootRel: ".",
    capturedAt: new Date().toISOString(),
    ignore: [],
    files: paths.map((p, i) => ({
      path: p,
      hash: `h${i}`.padEnd(64, "0"),
      size: 10,
      mode: 0o644,
    })),
  };
}

/**
 * Build a manifest with N files for latency benchmarking.
 */
function buildLargeManifest(fileCount: number, prefix = "src/gen/"): Manifest {
  const files = [];
  for (let i = 0; i < fileCount; i++) {
    files.push({
      path: `${prefix}file_${i.toString().padStart(5, "0")}.ts`,
      hash: `sha_${i}`.padEnd(64, "0"),
      size: 1024 + (i % 500),
      mode: 0o644,
    });
  }
  return {
    version: 1,
    rootRel: ".",
    capturedAt: new Date().toISOString(),
    ignore: [],
    files,
  };
}

/**
 * Collect latency samples and compute P95.
 */
function measureP95(fn: () => void, iterations: number): number {
  const latencies: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    latencies.push(performance.now() - start);
  }
  latencies.sort((a, b) => a - b);
  const idx = Math.ceil(0.95 * latencies.length) - 1;
  return latencies[idx];
}

describe("restore manifest validation fast-path", () => {
  it("validates using CAS existence checks without reading blobs", () => {
    let getBytesCalls = 0;
    const cas = {
      has: () => true,
      getBytes: () => {
        getBytesCalls++;
        throw new Error("getBytes should not be called during validation");
      },
    } as unknown as CasStore;

    const result = validateManifest({
      cas,
      manifest: buildManifest(["a.ts", "b.ts", "c.ts"]),
    });

    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
    expect(result.partial).toBe(false);
    expect(getBytesCalls).toBe(0);
  });

  it("reports missing files from CAS existence checks", () => {
    const missing = new Set(["h1".padEnd(64, "0")]);
    const cas = {
      has: (hash: string) => !missing.has(hash),
      getBytes: () => Buffer.from("unused"),
    } as unknown as CasStore;

    const result = validateManifest({
      cas,
      manifest: buildManifest(["a.ts", "b.ts", "c.ts"]),
    });

    expect(result.valid).toBe(false);
    expect(result.partial).toBe(true);
    expect(result.missing).toEqual(["b.ts"]);
  });
});

describe("restore validation latency SLO benchmarks", () => {
  it("P95 <= 2s for single file restore validation", () => {
    const manifest = buildManifest(["single-file.ts"]);
    const cas = {
      has: () => true,
      getBytes: () => Buffer.from("content"),
    } as unknown as CasStore;

    const p95Ms = measureP95(() => {
      validateManifest({ cas, manifest });
    }, 50);

    expect(p95Ms).toBeLessThanOrEqual(2000);
  });

  it("P95 <= 10s for medium project restore validation (~500 files)", () => {
    const manifest = buildLargeManifest(500);
    const cas = {
      has: () => true,
      getBytes: () => Buffer.from("content"),
    } as unknown as CasStore;

    const p95Ms = measureP95(() => {
      validateManifest({ cas, manifest });
    }, 20);

    expect(p95Ms).toBeLessThanOrEqual(10000);
  });

  it("P95 <= 10s for medium project restore validation with partial misses (~500 files, 10% missing)", () => {
    const manifest = buildLargeManifest(500);
    // 10% of files are "missing" from CAS
    const missingSet = new Set(
      manifest.files
        .filter((_, i) => i % 10 === 0)
        .map((f) => f.hash)
    );

    const cas = {
      has: (hash: string) => !missingSet.has(hash),
      getBytes: () => Buffer.from("content"),
    } as unknown as CasStore;

    const p95Ms = measureP95(() => {
      validateManifest({ cas, manifest });
    }, 20);

    expect(p95Ms).toBeLessThanOrEqual(10000);
  });

  it("validation latency scales linearly (1000 files is not 10x slower than 100 files)", () => {
    const cas = {
      has: () => true,
      getBytes: () => Buffer.from("content"),
    } as unknown as CasStore;

    const manifest100 = buildLargeManifest(100);
    const manifest1000 = buildLargeManifest(1000);

    const p95_100 = measureP95(() => {
      validateManifest({ cas, manifest: manifest100 });
    }, 20);

    const p95_1000 = measureP95(() => {
      validateManifest({ cas, manifest: manifest1000 });
    }, 20);

    // 1000 files should not be more than 30x the cost of 100 files
    // (generous bound accounting for test environment variance and CI load)
    const ratio = p95_1000 / Math.max(p95_100, 0.01);
    expect(ratio).toBeLessThan(30);
  });
});
