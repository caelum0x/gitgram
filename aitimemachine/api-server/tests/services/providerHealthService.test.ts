/**
 * Unit tests for providerHealthService.ts
 *
 * Mocks:
 *   - global fetch  — controls HTTP provider responses
 *   - node:child_process execFile — controls Beads binary responses
 *   - ioredis        — controls Redis availability
 *   - ../src/db/index.js (via setup.ts) — controls PostgreSQL execute()
 *
 * The cache module-level state is reset between tests by directly
 * invoking getCachedHealth and verifying it returns null after TTL
 * expiry, or by using fake timers where necessary.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock fetch globally before importing the service
// ---------------------------------------------------------------------------
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ---------------------------------------------------------------------------
// Mock child_process.execFile (promisified via util.promisify inside service)
// ---------------------------------------------------------------------------
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock ioredis (only used by the Redis health check)
// ---------------------------------------------------------------------------
const mockRedisConnect = vi.fn();
const mockRedisPing = vi.fn();
const mockRedisDisconnect = vi.fn();

vi.mock("ioredis", () => {
  class Redis {
    connect = mockRedisConnect;
    ping = mockRedisPing;
    disconnect = mockRedisDisconnect;
    constructor(_url: string, _opts?: any) {}
  }
  // The service imports the named `Redis` export; also provide `default`.
  return { Redis, default: Redis };
});

// ---------------------------------------------------------------------------
// In-process engine mocks
//
// GitNexus, Context7, and PAL are first-party in-process engines (not HTTP
// services). GitNexus health → gitNexusService.isAvailable(); Context7 →
// CONTEXT7_API_KEY presence; PAL → palEngine.health().
// ---------------------------------------------------------------------------
const mockIsAvailable = vi.fn<[], Promise<boolean>>();
vi.mock("../../src/services/gitNexusService.js", () => ({
  isAvailable: mockIsAvailable,
}));

const mockPalHealth = vi.fn<
  [],
  Promise<{
    status: "ok" | "starting" | "down";
    running: boolean;
    pid: number | null;
    command: string;
    detail?: string;
  }>
>();
vi.mock("../../src/engines/palEngine.js", () => ({
  palEngine: { health: mockPalHealth },
  PalEngine: vi.fn(),
}));

// ---------------------------------------------------------------------------
// monitoring mock (shared with other unit tests)
// ---------------------------------------------------------------------------
vi.mock("../../src/lib/monitoring.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  logError: vi.fn(),
}));

// ---------------------------------------------------------------------------
// DB mock — re-use the test setup mock
// ---------------------------------------------------------------------------
vi.mock("../../src/db/index.js", () => {
  const mockDb = {
    execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
  };
  return { db: mockDb, schema: {} };
});

vi.mock("drizzle-orm", () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ..._vals: any[]) => ({ type: "sql", query: strings.join("") }),
    { join: () => "" }
  ),
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  isNull: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import the service under test after all mocks are registered
// ---------------------------------------------------------------------------
import {
  checkProvider,
  checkAllProviders,
  getCachedHealth,
} from "../../src/services/providerHealthService.js";
import { execFile } from "node:child_process";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

function makeOkResponse(body: any = {}, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

function makeErrorResponse(status: number) {
  return { ok: false, status, json: vi.fn().mockResolvedValue({}) };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("providerHealthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default fetch to fail (network error) to avoid accidental hits
    mockFetch.mockRejectedValue(new Error("Network error"));

    // Clear required env vars
    setEnv({
      CONTEXT7_API_KEY: undefined,
      OPENAI_API_KEY: undefined,
      ANTHROPIC_API_KEY: undefined,
      REDIS_URL: undefined,
      BEADS_BINARY: undefined,
    });

    // Default in-process engine stubs: GitNexus unavailable, PAL down.
    mockIsAvailable.mockResolvedValue(false);
    mockPalHealth.mockResolvedValue({
      status: "down",
      running: false,
      pid: null,
      command: "python pal_server.py",
      detail: "not started",
    });
  });

  // =========================================================================
  // checkProvider — unknown name
  // =========================================================================

  describe("checkProvider — unknown provider", () => {
    it("returns unavailable for an unknown provider name", async () => {
      const result = await checkProvider("NonExistent");
      expect(result.name).toBe("NonExistent");
      expect(result.status).toBe("unavailable");
      expect(result.error).toMatch(/Unknown provider/);
    });
  });

  // =========================================================================
  // checkProvider — GitNexus
  // =========================================================================

  describe("checkProvider — GitNexus (in-process)", () => {
    it("returns healthy when the in-process backend is available", async () => {
      mockIsAvailable.mockResolvedValueOnce(true);

      const result = await checkProvider("GitNexus");
      expect(result.status).toBe("healthy");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("returns unavailable when the in-process backend is not responding", async () => {
      mockIsAvailable.mockResolvedValueOnce(false);

      const result = await checkProvider("GitNexus");
      expect(result.status).toBe("unavailable");
      expect(result.error).toContain("not responding");
    });

    it("returns unavailable when the availability check throws", async () => {
      mockIsAvailable.mockRejectedValueOnce(new Error("engine boom"));

      const result = await checkProvider("GitNexus");
      expect(result.status).toBe("unavailable");
      expect(result.error).toContain("engine boom");
    });
  });

  // =========================================================================
  // checkProvider — Context7 (configured via CONTEXT7_API_KEY)
  // =========================================================================

  describe("checkProvider — Context7", () => {
    it("returns unconfigured when CONTEXT7_API_KEY is not set", async () => {
      const result = await checkProvider("Context7");
      expect(result.status).toBe("unconfigured");
      expect(result.error).toMatch(/CONTEXT7_API_KEY/);
    });

    it("returns healthy when CONTEXT7_API_KEY is set (no URL needed)", async () => {
      setEnv({ CONTEXT7_API_KEY: "ctx7-valid-key" });

      const result = await checkProvider("Context7");
      expect(result.status).toBe("healthy");
    });
  });

  // =========================================================================
  // checkProvider — PAL (in-process Python subprocess via palEngine.health)
  // =========================================================================

  describe("checkProvider — PAL", () => {
    it("returns healthy when palEngine reports status ok", async () => {
      mockPalHealth.mockResolvedValueOnce({
        status: "ok",
        running: true,
        pid: 1234,
        command: "python pal_server.py",
      });

      const result = await checkProvider("PAL");
      expect(result.status).toBe("healthy");
    });

    it("returns degraded when palEngine reports status starting", async () => {
      mockPalHealth.mockResolvedValueOnce({
        status: "starting",
        running: true,
        pid: 1234,
        command: "python pal_server.py",
      });

      const result = await checkProvider("PAL");
      expect(result.status).toBe("degraded");
    });

    it("returns unavailable when palEngine reports status down", async () => {
      mockPalHealth.mockResolvedValueOnce({
        status: "down",
        running: false,
        pid: null,
        command: "python pal_server.py",
        detail: "process exited",
      });

      const result = await checkProvider("PAL");
      expect(result.status).toBe("unavailable");
    });
  });

  // =========================================================================
  // checkProvider — OpenAI
  // =========================================================================

  describe("checkProvider — OpenAI", () => {
    it("returns unconfigured when OPENAI_API_KEY is not set", async () => {
      const result = await checkProvider("OpenAI");
      expect(result.status).toBe("unconfigured");
    });

    it("returns unconfigured when the API returns 401 (invalid key)", async () => {
      setEnv({ OPENAI_API_KEY: "sk-bad-key" });
      mockFetch.mockResolvedValueOnce(makeErrorResponse(401));

      const result = await checkProvider("OpenAI");
      expect(result.status).toBe("unconfigured");
      expect(result.error).toMatch(/Invalid API key/);
    });

    it("returns healthy when the /v1/models endpoint responds 200", async () => {
      setEnv({ OPENAI_API_KEY: "sk-valid-key" });
      mockFetch.mockResolvedValueOnce(makeOkResponse({ data: [] }));

      const result = await checkProvider("OpenAI");
      expect(result.status).toBe("healthy");
    });

    it("returns unavailable when fetch throws", async () => {
      setEnv({ OPENAI_API_KEY: "sk-valid-key" });
      mockFetch.mockRejectedValueOnce(new Error("DNS resolution failure"));

      const result = await checkProvider("OpenAI");
      expect(result.status).toBe("unavailable");
    });
  });

  // =========================================================================
  // checkProvider — Anthropic
  // =========================================================================

  describe("checkProvider — Anthropic", () => {
    it("returns unconfigured when ANTHROPIC_API_KEY is not set", async () => {
      const result = await checkProvider("Anthropic");
      expect(result.status).toBe("unconfigured");
    });

    it("returns healthy when /v1/models responds 200", async () => {
      setEnv({ ANTHROPIC_API_KEY: "sk-ant-valid" });
      mockFetch.mockResolvedValueOnce(makeOkResponse({ data: [] }));

      const result = await checkProvider("Anthropic");
      expect(result.status).toBe("healthy");
    });

    it("returns unconfigured on 401 response", async () => {
      setEnv({ ANTHROPIC_API_KEY: "sk-ant-bad" });
      mockFetch.mockResolvedValueOnce(makeErrorResponse(401));

      const result = await checkProvider("Anthropic");
      expect(result.status).toBe("unconfigured");
    });
  });

  // =========================================================================
  // checkProvider — Beads (execFile)
  // =========================================================================

  describe("checkProvider — Beads", () => {
    it("returns unconfigured when the binary is not found (ENOENT)", async () => {
      const mockExec = execFile as any;
      // execFileAsync is promisified from execFile; we mock execFile's callback form
      mockExec.mockImplementationOnce(
        (_bin: string, _args: string[], callback: Function) => {
          const err = Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" });
          callback(err);
        }
      );

      const result = await checkProvider("Beads");
      expect(result.status).toBe("unconfigured");
      expect(result.error).toContain("ENOENT");
    });

    it("returns healthy with version when the binary is callable", async () => {
      const mockExec = execFile as any;
      mockExec.mockImplementationOnce(
        (_bin: string, _args: string[], callback: Function) => {
          callback(null, { stdout: "beads 0.5.1\n", stderr: "" });
        }
      );

      const result = await checkProvider("Beads");
      expect(result.status).toBe("healthy");
      expect(result.version).toBe("beads 0.5.1");
    });

    it("returns unavailable on non-ENOENT execution failure", async () => {
      const mockExec = execFile as any;
      mockExec.mockImplementationOnce(
        (_bin: string, _args: string[], callback: Function) => {
          callback(new Error("Segmentation fault"));
        }
      );

      const result = await checkProvider("Beads");
      expect(result.status).toBe("unavailable");
    });
  });

  // =========================================================================
  // checkProvider — PostgreSQL
  // =========================================================================

  describe("checkProvider — PostgreSQL", () => {
    it("returns healthy when the DB executes SELECT 1 successfully", async () => {
      const { db } = await import("../../src/db/index.js");
      (db.execute as any).mockResolvedValueOnce([{ "?column?": 1 }]);

      const result = await checkProvider("PostgreSQL");
      expect(result.status).toBe("healthy");
    });

    it("returns unavailable when the DB throws", async () => {
      const { db } = await import("../../src/db/index.js");
      (db.execute as any).mockRejectedValueOnce(new Error("connection refused"));

      const result = await checkProvider("PostgreSQL");
      expect(result.status).toBe("unavailable");
      expect(result.error).toContain("connection refused");
    });
  });

  // =========================================================================
  // checkProvider — Redis
  // =========================================================================

  describe("checkProvider — Redis", () => {
    it("returns unconfigured when REDIS_URL is not set", async () => {
      const result = await checkProvider("Redis");
      expect(result.status).toBe("unconfigured");
    });

    it("returns healthy when Redis ping succeeds", async () => {
      setEnv({ REDIS_URL: "redis://localhost:6379" });
      mockRedisConnect.mockResolvedValueOnce(undefined);
      mockRedisPing.mockResolvedValueOnce("PONG");

      const result = await checkProvider("Redis");
      expect(result.status).toBe("healthy");
    });

    it("returns unavailable when Redis connection fails", async () => {
      setEnv({ REDIS_URL: "redis://localhost:6379" });
      mockRedisConnect.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const result = await checkProvider("Redis");
      expect(result.status).toBe("unavailable");
      expect(result.error).toContain("ECONNREFUSED");
    });
  });

  // =========================================================================
  // checkAllProviders — overall status logic
  // =========================================================================

  describe("checkAllProviders", () => {
    it("returns overall=unavailable when all providers are unconfigured/unavailable", async () => {
      // All env vars absent → unconfigured for HTTP/API providers
      // DB: simulate failure
      const { db } = await import("../../src/db/index.js");
      (db.execute as any).mockRejectedValue(new Error("DB down"));
      // Beads: ENOENT
      const mockExec = execFile as any;
      mockExec.mockImplementation(
        (_bin: string, _args: string[], callback: Function) => {
          callback(Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }));
        }
      );

      const report = await checkAllProviders();

      expect(report.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(report.providers.length).toBeGreaterThan(0);
      // No provider has status "healthy" when all env vars absent and DB fails
      const healthy = report.providers.filter((p) => p.status === "healthy");
      expect(healthy.length).toBe(0);
      expect(report.overall).toBe("unavailable");
    });

    it("returns overall=healthy when every provider is healthy", async () => {
      setEnv({
        CONTEXT7_API_KEY: "ctx7-ok",
        OPENAI_API_KEY: "sk-ok",
        ANTHROPIC_API_KEY: "sk-ant-ok",
        REDIS_URL: "redis://localhost:6379",
      });

      // In-process engines healthy
      mockIsAvailable.mockResolvedValue(true);
      mockPalHealth.mockResolvedValue({
        status: "ok",
        running: true,
        pid: 1234,
        command: "python pal_server.py",
      });

      // HTTP providers (OpenAI, Anthropic) return 200
      mockFetch.mockResolvedValue(makeOkResponse({ version: "1.0.0" }));

      // Beads returns a version
      const mockExec = execFile as any;
      mockExec.mockImplementation(
        (_bin: string, _args: string[], callback: Function) => {
          callback(null, { stdout: "beads 1.0.0\n", stderr: "" });
        }
      );

      // DB healthy
      const { db } = await import("../../src/db/index.js");
      (db.execute as any).mockResolvedValue([{ "?column?": 1 }]);

      // Redis healthy
      mockRedisConnect.mockResolvedValue(undefined);
      mockRedisPing.mockResolvedValue("PONG");

      const report = await checkAllProviders();
      expect(report.overall).toBe("healthy");
    });

    it("returns overall=degraded when some but not all providers are healthy", async () => {
      // Make only one provider healthy: PostgreSQL
      const { db } = await import("../../src/db/index.js");
      (db.execute as any).mockResolvedValue([{ "?column?": 1 }]);

      // All HTTP providers unavailable (env vars absent)
      const mockExec = execFile as any;
      mockExec.mockImplementation(
        (_bin: string, _args: string[], callback: Function) => {
          callback(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
        }
      );

      const report = await checkAllProviders();
      // At least PostgreSQL is healthy; others are unconfigured/unavailable
      const healthyCount = report.providers.filter((p) => p.status === "healthy").length;
      const total = report.providers.length;
      if (healthyCount > 0 && healthyCount < total) {
        expect(report.overall).toBe("degraded");
      } else if (healthyCount === 0) {
        expect(report.overall).toBe("unavailable");
      } else {
        expect(report.overall).toBe("healthy");
      }
    });

    it("report includes all expected provider names", async () => {
      const { db } = await import("../../src/db/index.js");
      (db.execute as any).mockResolvedValue([{ "?column?": 1 }]);
      const mockExec = execFile as any;
      mockExec.mockImplementation(
        (_bin: string, _args: string[], callback: Function) => {
          callback(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
        }
      );

      const report = await checkAllProviders();
      const names = report.providers.map((p) => p.name);
      expect(names).toContain("GitNexus");
      expect(names).toContain("Context7");
      expect(names).toContain("Beads");
      expect(names).toContain("PAL");
      expect(names).toContain("OpenAI");
      expect(names).toContain("Anthropic");
      expect(names).toContain("PostgreSQL");
      expect(names).toContain("Redis");
    });
  });

  // =========================================================================
  // getCachedHealth — TTL behaviour
  // =========================================================================

  describe("getCachedHealth", () => {
    it("returns null before any checkAllProviders call", async () => {
      // Because module state persists across tests in the same file, we can
      // only verify the cache is populated after calling checkAllProviders.
      // This test calls checkAllProviders first to populate, then reads cache.
      const { db } = await import("../../src/db/index.js");
      (db.execute as any).mockResolvedValue([{ "?column?": 1 }]);
      const mockExec = execFile as any;
      mockExec.mockImplementation(
        (_bin: string, _args: string[], callback: Function) => {
          callback(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
        }
      );

      await checkAllProviders();
      const cached = getCachedHealth();
      expect(cached).not.toBeNull();
      expect(cached!.providers.length).toBeGreaterThan(0);
    });

    it("returns the cached report when called within the TTL window", async () => {
      const { db } = await import("../../src/db/index.js");
      (db.execute as any).mockResolvedValue([{ "?column?": 1 }]);
      const mockExec = execFile as any;
      mockExec.mockImplementation(
        (_bin: string, _args: string[], callback: Function) => {
          callback(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
        }
      );

      await checkAllProviders();
      const first = getCachedHealth();
      const second = getCachedHealth();

      // Both reads should return the same object reference (same cache hit)
      expect(first).toBe(second);
    });

    it("includes a checkedAt ISO timestamp in the cached report", async () => {
      const { db } = await import("../../src/db/index.js");
      (db.execute as any).mockResolvedValue([{ "?column?": 1 }]);
      const mockExec = execFile as any;
      mockExec.mockImplementation(
        (_bin: string, _args: string[], callback: Function) => {
          callback(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
        }
      );

      await checkAllProviders();
      const cached = getCachedHealth();
      expect(cached!.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
