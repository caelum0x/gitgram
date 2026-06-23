/**
 * Integration Tests: Schema Verification Logic
 *
 * Tests the schema verification and migration drift detection logic
 * from the health/db-health module. These tests exercise the full
 * probe chain through the Express routes and verify the response
 * structure for production monitoring tools.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { seedTestData, createTestApp } from "../setup.js";
import { db } from "../../src/db/index.js";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
  vi.mocked(db.execute).mockResolvedValue([{ health_check: 1 }]);
});

describe("Schema Verification via /health/schema", () => {
  it("should return valid JSON with expected structure for monitoring tools", async () => {
    vi.mocked(db.execute).mockResolvedValue([]);

    const res = await request(app).get("/health/schema");

    // Must be valid JSON
    expect(res.headers["content-type"]).toMatch(/json/);

    // Top-level structure
    expect(res.body).toHaveProperty("status");
    expect(["healthy", "degraded", "unhealthy"]).toContain(res.body.status);
    expect(res.body).toHaveProperty("timestamp");
    expect(res.body).toHaveProperty("summary");
    expect(res.body).toHaveProperty("tables");
    expect(res.body).toHaveProperty("migrationDrift");
  });

  it("should report correct total table count from EXPECTED_TABLES", async () => {
    vi.mocked(db.execute).mockResolvedValue([]);

    const res = await request(app).get("/health/schema");

    // Should have entries for known tables (users, projects, checkpoints, etc.)
    expect(res.body.summary.totalTables).toBeGreaterThan(20);
    expect(res.body.tables.length).toBe(res.body.summary.totalTables);
  });

  it("should show unhealthy status when all tables are missing (empty DB)", async () => {
    // All column queries return empty = tables don't exist
    vi.mocked(db.execute).mockResolvedValue([]);

    const res = await request(app).get("/health/schema");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("unhealthy");
    expect(res.body.summary.failingTables).toBeGreaterThan(0);
  });

  it("should include table name in each result", async () => {
    vi.mocked(db.execute).mockResolvedValue([]);

    const res = await request(app).get("/health/schema");

    const tableNames = res.body.tables.map((t: any) => t.table);
    expect(tableNames).toContain("users");
    expect(tableNames).toContain("projects");
    expect(tableNames).toContain("checkpoints");
    expect(tableNames).toContain("posts");
  });
});

describe("Database Health via /health/db", () => {
  it("should return connection duration in response", async () => {
    vi.mocked(db.execute)
      .mockResolvedValueOnce([{ ping: 1 }])
      .mockResolvedValueOnce([{ server_time: new Date() }])
      .mockResolvedValueOnce([{ lag_seconds: 0 }]);

    const res = await request(app).get("/health/db");

    expect(res.body.checks.connection).toHaveProperty("duration_ms");
    expect(res.body.checks.connection.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("should handle replication check gracefully when not available", async () => {
    vi.mocked(db.execute)
      .mockResolvedValueOnce([{ ping: 1 }])
      .mockResolvedValueOnce([{ server_time: new Date() }])
      .mockRejectedValueOnce(new Error("function pg_is_in_recovery() does not exist"));

    const res = await request(app).get("/health/db");

    // Should still return 200 -- replication not available is treated as pass
    expect(res.status).toBe(200);
    expect(res.body.checks.replication.status).toBe("pass");
    expect(res.body.checks.replication.message).toContain("not available");
  });

  it("should return valid response even if all probes fail", async () => {
    vi.mocked(db.execute).mockRejectedValue(new Error("Database is down"));

    const res = await request(app).get("/health/db");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("unhealthy");
    expect(res.body).toHaveProperty("checks");
    expect(res.body).toHaveProperty("timestamp");
  });
});

describe("EXPECTED_TABLES constant", () => {
  it("should cover all core Drizzle schema tables", async () => {
    const { EXPECTED_TABLES } = await import("../../src/health/db-health.js");

    const requiredTables = [
      "users",
      "api_keys",
      "sessions",
      "subscriptions",
      "organizations",
      "projects",
      "checkpoints",
      "checkpoint_files",
      "blobs",
      "trees",
      "chat_sessions",
      "chat_messages",
      "tool_calls",
      "events",
      "webhooks",
      "repositories",
      "audit_logs",
      "posts",
      "comments",
      "reactions",
      "follows",
      "trend_scores",
    ];

    for (const table of requiredTables) {
      expect(EXPECTED_TABLES).toHaveProperty(table);
      expect(EXPECTED_TABLES[table]).toHaveProperty("columns");
      expect(EXPECTED_TABLES[table]).toHaveProperty("indexes");
      expect(EXPECTED_TABLES[table].columns.length).toBeGreaterThan(0);
    }
  });

  it("should include primary key index for every table", async () => {
    const { EXPECTED_TABLES } = await import("../../src/health/db-health.js");

    for (const [tableName, def] of Object.entries(EXPECTED_TABLES)) {
      const hasPkeyIndex = def.indexes.some(
        (idx) => idx.endsWith("_pkey")
      );
      expect(hasPkeyIndex).toBe(true);
    }
  });
});

describe("EXPECTED_MIGRATIONS constant", () => {
  it("should list all known migration tags", async () => {
    const { EXPECTED_MIGRATIONS } = await import("../../src/health/db-health.js");

    expect(EXPECTED_MIGRATIONS).toContain("0001_add_storage_used_bytes");
    expect(EXPECTED_MIGRATIONS).toContain("0002_add_knowledge_base_tables");
    expect(EXPECTED_MIGRATIONS).toContain("0003_add_canonical_time_context_governance");
    expect(EXPECTED_MIGRATIONS).toContain("0004_add_gitgram_social_layer");
    expect(EXPECTED_MIGRATIONS.length).toBe(4);
  });

  it("should be in chronological order", async () => {
    const { EXPECTED_MIGRATIONS } = await import("../../src/health/db-health.js");

    for (let i = 1; i < EXPECTED_MIGRATIONS.length; i++) {
      const prev = EXPECTED_MIGRATIONS[i - 1];
      const curr = EXPECTED_MIGRATIONS[i];
      expect(prev < curr).toBe(true);
    }
  });
});
