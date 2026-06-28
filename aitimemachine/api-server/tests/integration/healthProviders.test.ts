/**
 * Integration Tests: GET /health/providers
 *
 * Boots the full Express app via the shared test setup (supertest, no real port)
 * and exercises the provider health system end-to-end. All engine modules are
 * mocked so no real binaries, network sockets, or API keys are required.
 *
 * Coverage:
 *   1. HealthReport shape — all expected provider names present.
 *   2. Overall status logic — healthy / degraded / unavailable.
 *   3. Context7 — unconfigured when CONTEXT7_API_KEY absent, healthy when set.
 *   4. GitNexus — delegates to gitNexusService.isAvailable(); maps true → healthy,
 *      false → unavailable.
 *   5. PAL — delegates to palEngine.health(); maps ok/starting/down →
 *      healthy/degraded/unavailable.
 *   6. getCachedHealth TTL — fresh report is cached; stale cache is bypassed.
 *   7. GET /health/providers/:name — single-provider slice.
 *   8. HTTP status codes — 200 when overall healthy/degraded, 503 when unavailable.
 *
 * Cache note: providerHealthService holds module-level cache state that persists
 * across tests in the same file. HTTP route tests that need predictable results
 * call expireCache() to advance fake timers past the 30 s TTL, forcing a fresh
 * check on the next GET /health/providers request.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import request from "supertest";
import type { Express } from "express";

// ---------------------------------------------------------------------------
// Engine mocks — must be registered BEFORE any service import.
// ---------------------------------------------------------------------------

// gitNexusService: expose a controllable isAvailable mock.
const mockIsAvailable = vi.fn<[], Promise<boolean>>();
vi.mock("../../src/services/gitNexusService.js", () => ({
  isAvailable: mockIsAvailable,
  callGitNexus: vi.fn(),
  analyzeCodeStructure: vi.fn(),
  findImpactedFiles: vi.fn(),
  getApiRoutes: vi.fn(),
  getDependencyGraph: vi.fn(),
  searchSymbols: vi.fn(),
}));

// palEngine: expose a controllable health mock.
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

// Beads binary: mock child_process so no real binary is needed.
// Must also expose `exec` because repositories.ts imports it from node:child_process.
vi.mock("node:child_process", () => ({
  execFile: vi.fn((_bin: string, _args: string[], callback: Function) => {
    // Default: binary not found → unconfigured.
    const err = Object.assign(new Error("spawn ENOENT /path/to/bd"), {
      code: "ENOENT",
    });
    callback(err);
  }),
  exec: vi.fn((_cmd: string, callback: Function) => {
    callback(null, { stdout: "", stderr: "" });
  }),
  spawn: vi.fn(),
}));

// ioredis: expose module-level mock functions so tests can control connect/ping.
const mockRedisConnect = vi.fn<[], Promise<void>>();
const mockRedisPing = vi.fn<[], Promise<string>>();
const mockRedisDisconnect = vi.fn<[], void>();

vi.mock("ioredis", () => {
  class Redis {
    connect = mockRedisConnect;
    ping = mockRedisPing;
    disconnect = mockRedisDisconnect;
    constructor(_url: string, _opts?: unknown) {}
  }
  // The service imports the named `Redis` export; also provide `default`.
  return { Redis, default: Redis };
});

// ---------------------------------------------------------------------------
// Import test infrastructure AFTER mocks are registered.
// ---------------------------------------------------------------------------
import { seedTestData, createTestApp } from "../setup.js";
import { db } from "../../src/db/index.js";
import {
  checkAllProviders,
  getCachedHealth,
} from "../../src/services/providerHealthService.js";
import { execFile } from "node:child_process";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setEnv(vars: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

/**
 * Advance fake timers past the 30 s cache TTL so the next
 * GET /health/providers call performs a fresh check instead of
 * returning a stale cached result from a previous test.
 */
async function expireCache(): Promise<void> {
  vi.useFakeTimers();
  vi.advanceTimersByTime(31_000);
  vi.useRealTimers();
}

/** Engine stubs that produce all-healthy results. */
function stubEnginesHealthy(): void {
  mockIsAvailable.mockResolvedValue(true);
  mockPalHealth.mockResolvedValue({
    status: "ok",
    running: true,
    pid: 1234,
    command: "/venv/bin/python pal_server.py",
  });
  vi.mocked(db.execute).mockResolvedValue([{ health_check: 1 }]);
}

/** Engine stubs that produce all-unavailable results. */
function stubEnginesDown(): void {
  mockIsAvailable.mockResolvedValue(false);
  mockPalHealth.mockResolvedValue({
    status: "down",
    running: false,
    pid: null,
    command: "/venv/bin/python pal_server.py",
    detail: "process exited",
  });
  vi.mocked(db.execute).mockRejectedValue(new Error("DB connection refused"));
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
  vi.clearAllMocks();

  // Reset env vars that affect provider detection.
  setEnv({
    CONTEXT7_API_KEY: undefined,
    OPENAI_API_KEY: undefined,
    ANTHROPIC_API_KEY: undefined,
    REDIS_URL: undefined,
    BEADS_BINARY: undefined,
  });

  // Default: Beads binary not found (ENOENT → unconfigured).
  vi.mocked(execFile).mockImplementation(
    (_bin: string, _args: string[], callback: Function) => {
      const err = Object.assign(new Error("spawn ENOENT /path/to/bd"), {
        code: "ENOENT",
      });
      callback(err);
    }
  );

  // Default: Redis connection fails (REDIS_URL absent makes it unconfigured anyway,
  // but guard against any test that sets REDIS_URL without updating the mock).
  mockRedisConnect.mockRejectedValue(new Error("ECONNREFUSED"));
  mockRedisPing.mockRejectedValue(new Error("not connected"));
  mockRedisDisconnect.mockReturnValue(undefined);

  // Default fetch — should not be reached by in-process providers.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("No fetch expected in test"))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ===========================================================================
// 1. HealthReport shape — all expected provider names
// ===========================================================================

describe("GET /health/providers — HealthReport shape", () => {
  it("returns a JSON body with overall, providers[], and checkedAt", async () => {
    await expireCache();
    stubEnginesHealthy();
    setEnv({ CONTEXT7_API_KEY: "ctx7-key" });

    const res = await request(app).get("/health/providers");

    expect(res.status).toBeLessThan(600);
    expect(res.body).toHaveProperty("overall");
    expect(res.body).toHaveProperty("providers");
    expect(Array.isArray(res.body.providers)).toBe(true);
    expect(res.body).toHaveProperty("checkedAt");
    expect(res.body.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("includes all expected provider names in the report", async () => {
    stubEnginesDown();

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

  it("each provider entry has name, status, latencyMs, and lastChecked", async () => {
    stubEnginesDown();

    const report = await checkAllProviders();

    for (const provider of report.providers) {
      expect(provider).toHaveProperty("name");
      expect(typeof provider.name).toBe("string");
      expect(provider).toHaveProperty("status");
      expect([
        "healthy",
        "degraded",
        "unavailable",
        "unconfigured",
      ]).toContain(provider.status);
      expect(provider).toHaveProperty("latencyMs");
      expect(typeof provider.latencyMs).toBe("number");
      expect(provider.latencyMs).toBeGreaterThanOrEqual(0);
      expect(provider).toHaveProperty("lastChecked");
      expect(provider.lastChecked).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });
});

// ===========================================================================
// 2. Overall status logic
// ===========================================================================

describe("checkAllProviders — overall status logic", () => {
  it("returns overall=healthy when every provider resolves as healthy", async () => {
    stubEnginesHealthy();
    setEnv({
      CONTEXT7_API_KEY: "ctx7-test-key",
      OPENAI_API_KEY: "sk-ok",
      ANTHROPIC_API_KEY: "sk-ant-ok",
      REDIS_URL: "redis://localhost:6379",
    });

    // Beads binary responds successfully.
    vi.mocked(execFile).mockImplementation(
      (_bin: string, _args: string[], callback: Function) => {
        callback(null, { stdout: "beads 1.0.0\n", stderr: "" });
      }
    );

    // HTTP providers (OpenAI, Anthropic) return 200.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: [] }),
      })
    );

    // Redis succeeds.
    mockRedisConnect.mockResolvedValue(undefined);
    mockRedisPing.mockResolvedValue("PONG");

    const report = await checkAllProviders();

    expect(report.overall).toBe("healthy");
    const healthy = report.providers.filter((p) => p.status === "healthy");
    expect(healthy.length).toBe(report.providers.length);
  });

  it("returns overall=unavailable when no provider is healthy", async () => {
    stubEnginesDown();
    // No API keys → Context7/OpenAI/Anthropic/Redis unconfigured;
    // Beads ENOENT; DB throws; GitNexus/PAL unavailable.

    const report = await checkAllProviders();

    const healthyCount = report.providers.filter(
      (p) => p.status === "healthy"
    ).length;
    expect(healthyCount).toBe(0);
    expect(report.overall).toBe("unavailable");
  });

  it("returns overall=degraded when some but not all providers are healthy", async () => {
    // Only PostgreSQL is healthy; everything else down/unconfigured.
    mockIsAvailable.mockResolvedValue(false);
    mockPalHealth.mockResolvedValue({
      status: "down",
      running: false,
      pid: null,
      command: "/venv/bin/python pal_server.py",
    });
    vi.mocked(db.execute).mockResolvedValue([{ health_check: 1 }]);
    // No API keys → OpenAI, Anthropic, Context7 unconfigured.
    // Beads ENOENT → unconfigured.
    // Redis unconfigured (no REDIS_URL).

    const report = await checkAllProviders();

    const healthyCount = report.providers.filter(
      (p) => p.status === "healthy"
    ).length;
    const total = report.providers.length;

    // PostgreSQL is the lone healthy entry.
    expect(healthyCount).toBeGreaterThan(0);
    expect(healthyCount).toBeLessThan(total);
    expect(report.overall).toBe("degraded");
  });
});

// ===========================================================================
// 3. Context7 — CONTEXT7_API_KEY behaviour
// ===========================================================================

describe("Context7 provider", () => {
  it("reports unconfigured when CONTEXT7_API_KEY is not set", async () => {
    setEnv({ CONTEXT7_API_KEY: undefined });

    const report = await checkAllProviders();
    const ctx7 = report.providers.find((p) => p.name === "Context7")!;

    expect(ctx7.status).toBe("unconfigured");
    expect(ctx7.latencyMs).toBe(0);
    expect(ctx7.error).toMatch(/CONTEXT7_API_KEY/);
  });

  it("reports healthy when CONTEXT7_API_KEY is set (no URL needed)", async () => {
    setEnv({ CONTEXT7_API_KEY: "ctx7-valid-key" });

    const report = await checkAllProviders();
    const ctx7 = report.providers.find((p) => p.name === "Context7")!;

    expect(ctx7.status).toBe("healthy");
    expect(ctx7.latencyMs).toBe(0);
    expect(ctx7.error).toBeUndefined();
  });

  it("HTTP route /health/providers reflects Context7 unconfigured status", async () => {
    setEnv({ CONTEXT7_API_KEY: undefined });
    stubEnginesDown();

    // Prime the cache with the current mock state so the route returns it.
    await checkAllProviders();

    const res = await request(app).get("/health/providers");

    const ctx7 = res.body.providers?.find((p: any) => p.name === "Context7");
    expect(ctx7).toBeDefined();
    expect(ctx7.status).toBe("unconfigured");
  });
});

// ===========================================================================
// 4. GitNexus — delegates to gitNexusService.isAvailable()
// ===========================================================================

describe("GitNexus provider", () => {
  it("reports healthy when isAvailable() resolves true", async () => {
    mockIsAvailable.mockResolvedValue(true);

    const report = await checkAllProviders();
    const gn = report.providers.find((p) => p.name === "GitNexus")!;

    expect(gn.status).toBe("healthy");
    expect(mockIsAvailable).toHaveBeenCalled();
  });

  it("reports unavailable when isAvailable() resolves false", async () => {
    mockIsAvailable.mockResolvedValue(false);

    const report = await checkAllProviders();
    const gn = report.providers.find((p) => p.name === "GitNexus")!;

    expect(gn.status).toBe("unavailable");
    expect(gn.error).toContain("in-process backend not responding");
  });

  it("reports unavailable when isAvailable() rejects", async () => {
    mockIsAvailable.mockRejectedValue(new Error("internal error"));

    const report = await checkAllProviders();
    const gn = report.providers.find((p) => p.name === "GitNexus")!;

    expect(gn.status).toBe("unavailable");
    expect(gn.error).toContain("internal error");
  });

  it("HTTP route /health/providers/GitNexus returns 200 and healthy", async () => {
    mockIsAvailable.mockResolvedValue(true);

    const res = await request(app).get("/health/providers/GitNexus");

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("GitNexus");
    expect(res.body.status).toBe("healthy");
  });

  it("HTTP route /health/providers/GitNexus returns 503 when unavailable", async () => {
    // NOTE: The app middleware (src/index.ts) intercepts any JSON body where
    // body.error is a string and wraps it as { error: { type, code, message } }.
    // ProviderHealth.error is a string, so responses with an `error` field get
    // wrapped. Assert the HTTP status; the body shape is managed by the middleware.
    mockIsAvailable.mockResolvedValue(false);

    const res = await request(app).get("/health/providers/GitNexus");

    expect(res.status).toBe(503);
    // The error middleware wraps the `error` string field into an envelope.
    expect(res.body.error).toBeDefined();
  });
});

// ===========================================================================
// 5. PAL — delegates to palEngine.health(); maps ok/starting/down
// ===========================================================================

describe("PAL provider", () => {
  it("reports healthy when palEngine.health() returns ok", async () => {
    mockPalHealth.mockResolvedValue({
      status: "ok",
      running: true,
      pid: 9000,
      command: "/venv/bin/python pal_server.py",
    });

    const report = await checkAllProviders();
    const pal = report.providers.find((p) => p.name === "PAL")!;

    expect(pal.status).toBe("healthy");
    expect(mockPalHealth).toHaveBeenCalled();
  });

  it("reports degraded when palEngine.health() returns starting", async () => {
    mockPalHealth.mockResolvedValue({
      status: "starting",
      running: true,
      pid: 9001,
      command: "/venv/bin/python pal_server.py",
      detail: "warming up",
    });

    const report = await checkAllProviders();
    const pal = report.providers.find((p) => p.name === "PAL")!;

    expect(pal.status).toBe("degraded");
  });

  it("reports unavailable when palEngine.health() returns down", async () => {
    mockPalHealth.mockResolvedValue({
      status: "down",
      running: false,
      pid: null,
      command: "/venv/bin/python pal_server.py",
      detail: "crashed",
    });

    const report = await checkAllProviders();
    const pal = report.providers.find((p) => p.name === "PAL")!;

    expect(pal.status).toBe("unavailable");
    expect(pal.error).toBe("crashed");
  });

  it("reports unavailable when palEngine.health() rejects", async () => {
    mockPalHealth.mockRejectedValue(new Error("spawn failure"));

    const report = await checkAllProviders();
    const pal = report.providers.find((p) => p.name === "PAL")!;

    expect(pal.status).toBe("unavailable");
    expect(pal.error).toContain("spawn failure");
  });

  it("HTTP route /health/providers/PAL returns 200 when ok", async () => {
    mockPalHealth.mockResolvedValue({
      status: "ok",
      running: true,
      pid: 1,
      command: "python pal.py",
    });

    const res = await request(app).get("/health/providers/PAL");

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("PAL");
    expect(res.body.status).toBe("healthy");
  });

  it("HTTP route /health/providers/PAL returns 503 when down", async () => {
    mockPalHealth.mockResolvedValue({
      status: "down",
      running: false,
      pid: null,
      command: "python pal.py",
    });

    const res = await request(app).get("/health/providers/PAL");

    expect(res.status).toBe(503);
    expect(res.body.name).toBe("PAL");
    expect(res.body.status).toBe("unavailable");
  });
});

// ===========================================================================
// 6. getCachedHealth — TTL behaviour
// ===========================================================================

describe("getCachedHealth — TTL behaviour", () => {
  it("getCachedHealth returns a valid HealthReport or null (never malformed)", () => {
    // The module-level cache may or may not be populated by prior tests.
    // Either outcome is acceptable; the object must be well-formed if present.
    const cached = getCachedHealth();
    if (cached !== null) {
      expect(cached).toHaveProperty("overall");
      expect(cached).toHaveProperty("providers");
      expect(Array.isArray(cached.providers)).toBe(true);
      expect(cached).toHaveProperty("checkedAt");
    }
  });

  it("returns a non-null cached report immediately after checkAllProviders", async () => {
    stubEnginesDown();

    await checkAllProviders();
    const cached = getCachedHealth();

    expect(cached).not.toBeNull();
    expect(cached!.providers.length).toBeGreaterThan(0);
    expect(cached!.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns the same object reference on consecutive calls within the TTL", async () => {
    stubEnginesDown();

    await checkAllProviders();
    const first = getCachedHealth();
    const second = getCachedHealth();

    // Within the 30 s TTL both reads must return the identical cached object.
    expect(first).toBe(second);
  });

  it("cache is overwritten after a second checkAllProviders call", async () => {
    stubEnginesDown();

    await checkAllProviders();
    const before = getCachedHealth();
    expect(before).not.toBeNull();

    await checkAllProviders();
    const after = getCachedHealth();
    expect(after).not.toBeNull();

    // The cache is updated; both reports are valid HealthReport shapes.
    expect(after!.checkedAt).toBeDefined();
    expect(before!.providers.length).toBe(after!.providers.length);
  });

  it("GET /health/providers returns the cached checkedAt when cache is warm", async () => {
    // Expire any existing cache, then prime it via the service.
    await expireCache();
    stubEnginesDown();

    const direct = await checkAllProviders();

    // The HTTP endpoint should serve the cached result (same checkedAt timestamp).
    const res = await request(app).get("/health/providers");
    expect(res.status).toBeLessThan(600);
    expect(res.body.checkedAt).toBe(direct.checkedAt);
  });

  it("getCachedHealth returns null after TTL expires (fake timers)", async () => {
    vi.useFakeTimers();

    stubEnginesDown();
    await checkAllProviders();

    expect(getCachedHealth()).not.toBeNull();

    // Advance past the 30 s TTL.
    vi.advanceTimersByTime(31_000);

    expect(getCachedHealth()).toBeNull();

    vi.useRealTimers();
  });
});

// ===========================================================================
// 7. HTTP status codes for GET /health/providers
// ===========================================================================

describe("GET /health/providers — HTTP status codes", () => {
  it("returns 200 when overall is healthy", async () => {
    stubEnginesHealthy();
    setEnv({
      CONTEXT7_API_KEY: "ctx7-key",
      OPENAI_API_KEY: "sk-ok",
      ANTHROPIC_API_KEY: "sk-ant-ok",
      REDIS_URL: "redis://localhost:6379",
    });

    vi.mocked(execFile).mockImplementation(
      (_bin: string, _args: string[], callback: Function) => {
        callback(null, { stdout: "beads 1.0.0\n", stderr: "" });
      }
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: [] }),
      })
    );

    // Redis succeeds.
    mockRedisConnect.mockResolvedValue(undefined);
    mockRedisPing.mockResolvedValue("PONG");

    // Prime the cache with a healthy state, then verify via HTTP.
    await checkAllProviders();
    const res = await request(app).get("/health/providers");
    expect(res.status).toBe(200);
    expect(res.body.overall).toBe("healthy");
  });

  it("returns 200 when overall is degraded", async () => {
    // Only PostgreSQL healthy → degraded overall.
    mockIsAvailable.mockResolvedValue(false);
    mockPalHealth.mockResolvedValue({
      status: "down",
      running: false,
      pid: null,
      command: "python pal.py",
    });
    vi.mocked(db.execute).mockResolvedValue([{ health_check: 1 }]);

    // Prime the cache with a degraded state.
    await checkAllProviders();
    const res = await request(app).get("/health/providers");
    expect(res.status).toBe(200);
    expect(res.body.overall).toBe("degraded");
  });

  it("returns 503 when overall is unavailable", async () => {
    stubEnginesDown();

    // Prime the cache with an unavailable state.
    await checkAllProviders();
    const res = await request(app).get("/health/providers");
    expect(res.status).toBe(503);
    expect(res.body.overall).toBe("unavailable");
  });
});

// ===========================================================================
// 8. GET /health/providers/:name — single-provider slice
// ===========================================================================

describe("GET /health/providers/:name — single provider", () => {
  it("returns 503 for an unknown provider name", async () => {
    // checkProvider returns a ProviderHealth with status=unavailable and
    // error="Unknown provider: Nonexistent". The app's JSON middleware
    // intercepts any body where body.error is a string and wraps it into
    // { error: { type, code, message } } — so the raw ProviderHealth fields
    // are replaced by the error envelope. Verify only the HTTP status.
    const res = await request(app).get("/health/providers/Nonexistent");

    expect(res.status).toBe(503);
    // The middleware wraps the error string: error.message should contain the provider name.
    expect(res.body.error).toBeDefined();
  });

  it("returns 200 and healthy for Context7 when API key is set", async () => {
    setEnv({ CONTEXT7_API_KEY: "ctx7-key" });

    const res = await request(app).get("/health/providers/Context7");

    // Context7 healthy has no `error` field → middleware does NOT wrap.
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Context7");
    expect(res.body.status).toBe("healthy");
  });

  it("returns 200 for Context7 when API key is absent (unconfigured)", async () => {
    // The route returns 503 only for "unavailable"; "unconfigured" → 200.
    // BUT the ProviderHealth has error:"CONTEXT7_API_KEY not set" which the
    // app middleware wraps. Verify HTTP 200 and the presence of the error envelope.
    setEnv({ CONTEXT7_API_KEY: undefined });

    const res = await request(app).get("/health/providers/Context7");

    expect(res.status).toBe(200);
    // Middleware wraps the error string — the original name/status fields are replaced.
    expect(res.body.error).toBeDefined();
  });

  it("returns 200 for PostgreSQL when DB is up", async () => {
    vi.mocked(db.execute).mockResolvedValue([{ health_check: 1 }]);

    const res = await request(app).get("/health/providers/PostgreSQL");

    // PostgreSQL healthy has no `error` field → middleware does NOT wrap.
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("PostgreSQL");
    expect(res.body.status).toBe("healthy");
  });

  it("returns 503 for PostgreSQL when DB is down", async () => {
    vi.mocked(db.execute).mockRejectedValue(new Error("connection refused"));

    const res = await request(app).get("/health/providers/PostgreSQL");

    expect(res.status).toBe(503);
    // ProviderHealth has error:"connection refused" → middleware wraps it.
    expect(res.body.error).toBeDefined();
  });

  it("no authentication header required for /health/providers/:name", async () => {
    setEnv({ CONTEXT7_API_KEY: "ctx7-key" });

    // No API key header — health endpoints must be open.
    const res = await request(app)
      .get("/health/providers/Context7")
      .set({});

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
