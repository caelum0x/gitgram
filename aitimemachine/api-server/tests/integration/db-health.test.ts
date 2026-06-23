/**
 * Integration Tests: Database Health Probes
 *
 * Tests the database health endpoints and schema verification:
 *   - GET /health/db - Connection, latency, and replication probes
 *   - GET /health/schema - Schema verification and migration drift
 *   - Health probe functions return correct status/messages
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
  // Reset db.execute mock to default successful behavior
  vi.mocked(db.execute).mockResolvedValue([{ health_check: 1 }]);
});

describe("Database Health Endpoints", () => {
  // ==========================================================================
  // GET /health/db - Database health status
  // ==========================================================================
  describe("GET /health/db", () => {
    it("should return 200 with connection, latency, and replication checks", async () => {
      // Mock db.execute to handle different queries
      vi.mocked(db.execute)
        .mockResolvedValueOnce([{ ping: 1 }])       // connection probe
        .mockResolvedValueOnce([{ server_time: new Date() }]) // latency probe
        .mockResolvedValueOnce([{ lag_seconds: 0 }]); // replication probe

      const res = await request(app).get("/health/db");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body).toHaveProperty("timestamp");
      expect(res.body).toHaveProperty("checks");
      expect(res.body.checks).toHaveProperty("connection");
      expect(res.body.checks).toHaveProperty("latency");
      expect(res.body.checks).toHaveProperty("replication");
    });

    it("should return healthy when all probes pass", async () => {
      vi.mocked(db.execute)
        .mockResolvedValueOnce([{ ping: 1 }])
        .mockResolvedValueOnce([{ server_time: new Date() }])
        .mockResolvedValueOnce([{ lag_seconds: 0 }]);

      const res = await request(app).get("/health/db");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
      expect(res.body.checks.connection.status).toBe("pass");
      expect(res.body.checks.latency.status).toBe("pass");
    });

    it("should return 503 unhealthy when connection probe fails", async () => {
      vi.mocked(db.execute)
        .mockRejectedValueOnce(new Error("Connection refused"))  // connection
        .mockResolvedValueOnce([{ server_time: new Date() }])    // latency
        .mockResolvedValueOnce([{ lag_seconds: 0 }]);            // replication

      const res = await request(app).get("/health/db");

      expect(res.status).toBe(503);
      expect(res.body.status).toBe("unhealthy");
      expect(res.body.checks.connection.status).toBe("fail");
    });

    it("should include duration_ms in all probes", async () => {
      vi.mocked(db.execute)
        .mockResolvedValueOnce([{ ping: 1 }])
        .mockResolvedValueOnce([{ server_time: new Date() }])
        .mockResolvedValueOnce([{ lag_seconds: 0 }]);

      const res = await request(app).get("/health/db");

      expect(typeof res.body.checks.connection.duration_ms).toBe("number");
      expect(typeof res.body.checks.latency.duration_ms).toBe("number");
      expect(typeof res.body.checks.replication.duration_ms).toBe("number");
    });

    it("should not require authentication", async () => {
      vi.mocked(db.execute)
        .mockResolvedValueOnce([{ ping: 1 }])
        .mockResolvedValueOnce([{ server_time: new Date() }])
        .mockResolvedValueOnce([{ lag_seconds: 0 }]);

      const res = await request(app).get("/health/db");

      expect(res.status).toBe(200);
    });
  });

  // ==========================================================================
  // GET /health/schema - Schema verification
  // ==========================================================================
  describe("GET /health/schema", () => {
    it("should return schema verification results with summary", async () => {
      // The schema endpoint makes many db.execute calls for each table
      // Mock them all to return reasonable data
      vi.mocked(db.execute).mockResolvedValue([]);

      const res = await request(app).get("/health/schema");

      expect(res.body).toHaveProperty("status");
      expect(res.body).toHaveProperty("timestamp");
      expect(res.body).toHaveProperty("summary");
      expect(res.body.summary).toHaveProperty("totalTables");
      expect(res.body.summary).toHaveProperty("passingTables");
      expect(res.body.summary).toHaveProperty("failingTables");
      expect(res.body.summary).toHaveProperty("warningTables");
      expect(res.body).toHaveProperty("migrationDrift");
      expect(res.body).toHaveProperty("tables");
      expect(Array.isArray(res.body.tables)).toBe(true);
    });

    it("should report tables in results", async () => {
      vi.mocked(db.execute).mockResolvedValue([]);

      const res = await request(app).get("/health/schema");

      // Should have at least some tables in results
      expect(res.body.tables.length).toBeGreaterThan(0);

      // Each table result should have required fields
      for (const table of res.body.tables) {
        expect(table).toHaveProperty("status");
        expect(table).toHaveProperty("table");
        expect(table).toHaveProperty("checks");
        expect(table).toHaveProperty("message");
      }
    });

    it("should include migration drift status", async () => {
      vi.mocked(db.execute).mockResolvedValue([]);

      const res = await request(app).get("/health/schema");

      expect(res.body.migrationDrift).toHaveProperty("status");
      expect(res.body.migrationDrift).toHaveProperty("message");
    });

    it("should not require authentication", async () => {
      vi.mocked(db.execute).mockResolvedValue([]);

      const res = await request(app).get("/health/schema");

      // Even if schema checks fail, we should get a valid response, not 401/403
      expect([200, 503]).toContain(res.status);
    });
  });
});

describe("Health Probe Logic", () => {
  describe("Connection probe", () => {
    it("should return pass when SELECT 1 succeeds", async () => {
      vi.mocked(db.execute).mockResolvedValueOnce([{ ping: 1 }]);

      // Import the probeConnection function
      const { probeConnection } = await import("../../src/health/db-health.js");
      const result = await probeConnection();

      expect(result.status).toBe("pass");
      expect(result.message).toContain("successful");
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it("should return fail when database is unreachable", async () => {
      vi.mocked(db.execute).mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const { probeConnection } = await import("../../src/health/db-health.js");
      const result = await probeConnection();

      expect(result.status).toBe("fail");
      expect(result.message).toContain("ECONNREFUSED");
    });
  });

  describe("Latency probe", () => {
    it("should return pass for low latency", async () => {
      vi.mocked(db.execute).mockResolvedValueOnce([{ server_time: new Date() }]);

      const { probeLatency } = await import("../../src/health/db-health.js");
      const result = await probeLatency();

      expect(result.status).toBe("pass");
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Schema table probe", () => {
    it("should return fail when table does not exist", async () => {
      // Return empty result for column query (table not found)
      vi.mocked(db.execute).mockResolvedValueOnce([]);

      const { probeTableSchema } = await import("../../src/health/db-health.js");
      const result = await probeTableSchema("nonexistent_table", ["id"], ["nonexistent_table_pkey"]);

      expect(result.status).toBe("fail");
      expect(result.checks.exists).toBe(false);
      expect(result.message).toContain("does not exist");
    });

    it("should return pass when table has all expected columns and indexes", async () => {
      // Column query returns expected columns
      vi.mocked(db.execute)
        .mockResolvedValueOnce([
          { column_name: "id" },
          { column_name: "email" },
          { column_name: "name" },
        ])
        // Index query returns expected indexes
        .mockResolvedValueOnce([
          { indexname: "test_pkey" },
        ]);

      const { probeTableSchema } = await import("../../src/health/db-health.js");
      const result = await probeTableSchema(
        "test_table",
        ["id", "email", "name"],
        ["test_pkey"]
      );

      expect(result.status).toBe("pass");
      expect(result.checks.exists).toBe(true);
      expect(result.checks.columns?.missing).toEqual([]);
      expect(result.checks.indexes?.missing).toEqual([]);
    });

    it("should return fail when table is missing columns", async () => {
      vi.mocked(db.execute)
        .mockResolvedValueOnce([
          { column_name: "id" },
          // "email" is missing
        ])
        .mockResolvedValueOnce([
          { indexname: "test_pkey" },
        ]);

      const { probeTableSchema } = await import("../../src/health/db-health.js");
      const result = await probeTableSchema(
        "test_table",
        ["id", "email"],
        ["test_pkey"]
      );

      expect(result.status).toBe("fail");
      expect(result.checks.columns?.missing).toContain("email");
    });
  });

  describe("Migration drift probe", () => {
    it("should return warn when migrations table does not exist", async () => {
      vi.mocked(db.execute).mockResolvedValueOnce([{ exists: false }]);

      const { probeMigrationDrift } = await import("../../src/health/db-health.js");
      const result = await probeMigrationDrift();

      expect(result.status).toBe("warn");
      expect(result.message).toContain("not found");
    });

    it("should return pass when all expected migrations are applied", async () => {
      vi.mocked(db.execute)
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([
          { tag: "0001_add_storage_used_bytes" },
          { tag: "0002_add_knowledge_base_tables" },
          { tag: "0003_add_canonical_time_context_governance" },
          { tag: "0004_add_gitgram_social_layer" },
        ]);

      const { probeMigrationDrift } = await import("../../src/health/db-health.js");
      const result = await probeMigrationDrift();

      expect(result.status).toBe("pass");
      expect(result.missing).toEqual([]);
    });

    it("should return fail when migrations are missing", async () => {
      vi.mocked(db.execute)
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([
          { tag: "0001_add_storage_used_bytes" },
          // Missing 0002, 0003, 0004
        ]);

      const { probeMigrationDrift } = await import("../../src/health/db-health.js");
      const result = await probeMigrationDrift();

      expect(result.status).toBe("fail");
      expect(result.missing.length).toBeGreaterThan(0);
      expect(result.missing).toContain("0002_add_knowledge_base_tables");
    });

    it("should return warn when unexpected extra migrations exist", async () => {
      vi.mocked(db.execute)
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([
          { tag: "0001_add_storage_used_bytes" },
          { tag: "0002_add_knowledge_base_tables" },
          { tag: "0003_add_canonical_time_context_governance" },
          { tag: "0004_add_gitgram_social_layer" },
          { tag: "0005_unexpected_migration" },
        ]);

      const { probeMigrationDrift } = await import("../../src/health/db-health.js");
      const result = await probeMigrationDrift();

      expect(result.status).toBe("warn");
      expect(result.extra).toContain("0005_unexpected_migration");
    });
  });
});
