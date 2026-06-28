/**
 * Provider Health Service
 *
 * Monitors health and availability of all integrated providers:
 * GitNexus, Context7, Beads, PAL, OpenAI API, Anthropic API,
 * PostgreSQL, and Redis.
 *
 * Runs checks in parallel, caches results for 30 seconds, and
 * supports periodic background polling.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { logger } from "../lib/monitoring.js";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProviderStatus = "healthy" | "degraded" | "unavailable" | "unconfigured";

export interface ProviderHealth {
  name: string;
  status: ProviderStatus;
  latencyMs: number;
  version?: string;
  error?: string;
  lastChecked: string;
}

export interface HealthReport {
  overall: ProviderStatus;
  providers: ProviderHealth[];
  checkedAt: string;
}

// ---------------------------------------------------------------------------
// Internal configuration
// ---------------------------------------------------------------------------

const CHECK_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 30_000;

// GitNexus, Context7, and PAL are now in-process / bundled first-party engines —
// no external URLs. GitNexus → gitNexusService.isAvailable(); Context7 → CONTEXT7_API_KEY;
// PAL → palEngine.health().
const BEADS_BIN =
  process.env.BEADS_BINARY ??
  path.join(__dirname, "../../../../beads/bd");

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

let cachedReport: HealthReport | null = null;
let cacheTimestamp = 0;
let periodicTimer: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Per-provider check helpers
// ---------------------------------------------------------------------------

function makeResult(
  name: string,
  status: ProviderStatus,
  latencyMs: number,
  opts: { version?: string; error?: string } = {}
): ProviderHealth {
  return {
    name,
    status,
    latencyMs,
    ...opts,
    lastChecked: new Date().toISOString(),
  };
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timer = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timer]);
}

async function checkGitNexus(): Promise<ProviderHealth> {
  // In-process: the gitnexus library is bundled, no external HTTP port.
  const start = Date.now();
  try {
    const { isAvailable } = await import("./gitNexusService.js");
    const available = await withTimeout(isAvailable(), CHECK_TIMEOUT_MS);
    const latencyMs = Date.now() - start;
    return makeResult(
      "GitNexus",
      available ? "healthy" : "unavailable",
      latencyMs,
      available ? undefined : { error: "in-process backend not responding" }
    );
  } catch (err) {
    return makeResult("GitNexus", "unavailable", Date.now() - start, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function checkContext7(): Promise<ProviderHealth> {
  // In-process: @upstash/context7-sdk client. Configured by API key, not a URL.
  if (!process.env.CONTEXT7_API_KEY) {
    return makeResult("Context7", "unconfigured", 0, {
      error: "CONTEXT7_API_KEY not set",
    });
  }
  return makeResult("Context7", "healthy", 0);
}

async function checkBeads(): Promise<ProviderHealth> {
  const start = Date.now();
  try {
    const { stdout } = await withTimeout(
      execFileAsync(BEADS_BIN, ["--version"]),
      CHECK_TIMEOUT_MS
    );
    const latencyMs = Date.now() - start;
    const version = stdout.trim() || undefined;
    return makeResult("Beads", "healthy", latencyMs, { version });
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    // Binary not found → unconfigured; other errors → unavailable
    const status: ProviderStatus = message.includes("ENOENT")
      ? "unconfigured"
      : "unavailable";
    return makeResult("Beads", status, latencyMs, { error: message });
  }
}

async function checkPal(): Promise<ProviderHealth> {
  // First-party: AITM-managed Python subprocess (stdio MCP), not an external URL.
  const start = Date.now();
  try {
    const { palEngine } = await import("../engines/palEngine.js");
    const h = await withTimeout(palEngine.health(), CHECK_TIMEOUT_MS);
    const latencyMs = Date.now() - start;
    const status: ProviderStatus =
      h.status === "ok" ? "healthy" : h.status === "starting" ? "degraded" : "unavailable";
    return makeResult("PAL", status, latencyMs, h.detail ? { error: h.detail } : undefined);
  } catch (err) {
    return makeResult("PAL", "unavailable", Date.now() - start, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function checkOpenAI(): Promise<ProviderHealth> {
  const start = Date.now();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return makeResult("OpenAI", "unconfigured", 0, {
      error: "OPENAI_API_KEY not set",
    });
  }
  try {
    const res = await withTimeout(
      fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
      CHECK_TIMEOUT_MS
    );
    const latencyMs = Date.now() - start;
    if (res.status === 401) {
      return makeResult("OpenAI", "unconfigured", latencyMs, {
        error: "Invalid API key",
      });
    }
    if (!res.ok) {
      return makeResult("OpenAI", "degraded", latencyMs, {
        error: `HTTP ${res.status}`,
      });
    }
    return makeResult("OpenAI", "healthy", latencyMs);
  } catch (err) {
    return makeResult("OpenAI", "unavailable", Date.now() - start, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function checkAnthropic(): Promise<ProviderHealth> {
  const start = Date.now();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return makeResult("Anthropic", "unconfigured", 0, {
      error: "ANTHROPIC_API_KEY not set",
    });
  }
  try {
    const res = await withTimeout(
      fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      }),
      CHECK_TIMEOUT_MS
    );
    const latencyMs = Date.now() - start;
    if (res.status === 401) {
      return makeResult("Anthropic", "unconfigured", latencyMs, {
        error: "Invalid API key",
      });
    }
    if (!res.ok) {
      return makeResult("Anthropic", "degraded", latencyMs, {
        error: `HTTP ${res.status}`,
      });
    }
    return makeResult("Anthropic", "healthy", latencyMs);
  } catch (err) {
    return makeResult("Anthropic", "unavailable", Date.now() - start, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function checkPostgres(): Promise<ProviderHealth> {
  const start = Date.now();
  try {
    await withTimeout(
      db.execute(sql`SELECT 1`),
      CHECK_TIMEOUT_MS
    );
    return makeResult("PostgreSQL", "healthy", Date.now() - start);
  } catch (err) {
    return makeResult("PostgreSQL", "unavailable", Date.now() - start, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function checkRedis(): Promise<ProviderHealth> {
  const start = Date.now();
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return makeResult("Redis", "unconfigured", 0, {
      error: "REDIS_URL not set",
    });
  }
  try {
    // Dynamic import to avoid hard dependency — mirrors the pattern in rateLimit.ts.
    // Use the named `Redis` export: ioredis's hybrid default export is typed as
    // the module namespace under NodeNext and is not constructable.
    const { Redis } = await import("ioredis");
    const client = new Redis(redisUrl, {
      connectTimeout: CHECK_TIMEOUT_MS,
      lazyConnect: true,
      maxRetriesPerRequest: 0,
    });
    await withTimeout(client.connect(), CHECK_TIMEOUT_MS);
    await withTimeout(client.ping(), CHECK_TIMEOUT_MS);
    const latencyMs = Date.now() - start;
    client.disconnect();
    return makeResult("Redis", "healthy", latencyMs);
  } catch (err) {
    return makeResult("Redis", "unavailable", Date.now() - start, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------

const PROVIDER_CHECKS: Record<string, () => Promise<ProviderHealth>> = {
  GitNexus: checkGitNexus,
  Context7: checkContext7,
  Beads: checkBeads,
  PAL: checkPal,
  OpenAI: checkOpenAI,
  Anthropic: checkAnthropic,
  PostgreSQL: checkPostgres,
  Redis: checkRedis,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check a single provider by name.
 * Returns a ProviderHealth result with status and latency.
 */
export async function checkProvider(name: string): Promise<ProviderHealth> {
  const check = PROVIDER_CHECKS[name];
  if (!check) {
    return makeResult(name, "unavailable", 0, {
      error: `Unknown provider: ${name}`,
    });
  }
  return check();
}

/**
 * Run all provider checks in parallel and return a full HealthReport.
 * - overall = 'healthy'    — all providers are healthy
 * - overall = 'degraded'   — at least one is degraded/unconfigured
 * - overall = 'unavailable'— no providers are healthy
 */
export async function checkAllProviders(): Promise<HealthReport> {
  const results = await Promise.all(
    Object.values(PROVIDER_CHECKS).map((fn) => fn())
  );

  const healthyCount = results.filter((r) => r.status === "healthy").length;
  let overall: ProviderStatus;
  if (healthyCount === results.length) {
    overall = "healthy";
  } else if (healthyCount === 0) {
    overall = "unavailable";
  } else {
    overall = "degraded";
  }

  const report: HealthReport = {
    overall,
    providers: results,
    checkedAt: new Date().toISOString(),
  };

  // Update cache
  cachedReport = report;
  cacheTimestamp = Date.now();

  return report;
}

/**
 * Returns the last HealthReport if it is within the 30-second TTL,
 * otherwise returns null.
 */
export function getCachedHealth(): HealthReport | null {
  if (!cachedReport) return null;
  if (Date.now() - cacheTimestamp > CACHE_TTL_MS) return null;
  return cachedReport;
}

/**
 * Start a background interval that calls checkAllProviders() every intervalMs.
 * Calling this a second time replaces the existing interval.
 */
export function startPeriodicChecks(intervalMs: number): void {
  if (periodicTimer !== null) {
    clearInterval(periodicTimer);
  }

  // Run once immediately, then on the interval
  checkAllProviders().catch((err) =>
    logger.error("providerHealthService: initial check failed", err instanceof Error ? err : undefined, { details: String(err) })
  );

  periodicTimer = setInterval(() => {
    checkAllProviders().catch((err) =>
      logger.error("providerHealthService: periodic check failed", err instanceof Error ? err : undefined, { details: String(err) })
    );
  }, intervalMs);
}
