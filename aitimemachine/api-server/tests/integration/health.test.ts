/**
 * Integration Tests: Health Routes
 *
 * Tests the health check endpoints including:
 * - GET /health - Basic health check (no auth)
 * - GET /health/live - Liveness check (no auth)
 * - GET /health/ready - Readiness check with DB and memory checks (no auth)
 * - GET /health/ready - Returns 503 when DB check fails
 * - Health endpoints don't require authentication
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
  // Reset db.execute mock to default successful behavior before each test
  vi.mocked(db.execute).mockResolvedValue([{ health_check: 1 }]);
});

describe("Health Routes", () => {
  // ==========================================================================
  // GET /health - Basic health check
  // ==========================================================================
  describe("GET /health", () => {
    it("should return 200 with status healthy, version, and uptime", async () => {
      const res = await request(app).get("/health");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
      expect(res.body).toHaveProperty("version");
      expect(res.body).toHaveProperty("uptime");
      expect(typeof res.body.uptime).toBe("number");
      expect(res.body.uptime).toBeGreaterThanOrEqual(0);
      expect(res.body).toHaveProperty("uptimeFormatted");
      expect(typeof res.body.uptimeFormatted).toBe("string");
      expect(res.body).toHaveProperty("timestamp");
    });
  });

  // ==========================================================================
  // GET /health/live - Liveness check
  // ==========================================================================
  describe("GET /health/live", () => {
    it("should return 200 with checks.process.status pass", async () => {
      const res = await request(app).get("/health/live");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
      expect(res.body).toHaveProperty("checks");
      expect(res.body.checks).toHaveProperty("process");
      expect(res.body.checks.process.status).toBe("pass");
      expect(res.body.checks.process).toHaveProperty("message");
    });
  });

  // ==========================================================================
  // GET /health/ready - Readiness check (success)
  // ==========================================================================
  describe("GET /health/ready", () => {
    it("should return 200 with checks.database and checks.memory when DB is healthy", async () => {
      const res = await request(app).get("/health/ready");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
      expect(res.body).toHaveProperty("checks");

      // Database check
      expect(res.body.checks).toHaveProperty("database");
      expect(res.body.checks.database.status).toBe("pass");
      expect(res.body.checks.database).toHaveProperty("message");
      expect(res.body.checks.database).toHaveProperty("duration_ms");
      expect(typeof res.body.checks.database.duration_ms).toBe("number");

      // Memory check
      expect(res.body.checks).toHaveProperty("memory");
      expect(res.body.checks.memory.status).toBe("pass");
      expect(res.body.checks.memory).toHaveProperty("message");
    });

    it("should return 503 when DB check fails", async () => {
      // Make db.execute throw to simulate a database failure
      vi.mocked(db.execute).mockRejectedValueOnce(new Error("Connection refused"));

      const res = await request(app).get("/health/ready");

      expect(res.status).toBe(503);
      expect(res.body.status).toBe("unhealthy");
      expect(res.body.checks.database.status).toBe("fail");
      expect(res.body.checks.database.message).toContain("Connection refused");
    });
  });

  // ==========================================================================
  // No authentication required
  // ==========================================================================
  describe("Health endpoints do not require authentication", () => {
    it("should allow access to /health without an API key", async () => {
      const res = await request(app).get("/health");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
    });

    it("should allow access to /health/live without an API key", async () => {
      const res = await request(app).get("/health/live");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
    });

    it("should allow access to /health/ready without an API key", async () => {
      const res = await request(app).get("/health/ready");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
    });
  });
});
