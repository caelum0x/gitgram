/**
 * Integration Tests: Usage Routes
 *
 * Tests the /v1/usage endpoints:
 * - GET /v1/usage            - Current period usage summary
 * - GET /v1/usage/history    - Historical usage data
 * - GET /v1/usage/breakdown  - Breakdown by resource type
 * - GET /v1/usage/limits     - Plan limits and percentages
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { seedTestData, createTestApp, TEST_API_KEY } from "../setup.js";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
});

describe("Usage API - /v1/usage", () => {
  // ==========================================================================
  // GET /v1/usage - Current period summary
  // ==========================================================================
  describe("GET /v1/usage", () => {
    it("should return usage summary with correct structure", async () => {
      const res = await request(app)
        .get("/v1/usage")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("period");
      expect(res.body).toHaveProperty("checkpoints");
      expect(res.body).toHaveProperty("repositories");
      expect(res.body).toHaveProperty("contexts");
      expect(res.body).toHaveProperty("api_calls");
      expect(res.body).toHaveProperty("limits");
    });

    it("should require authentication", async () => {
      const res = await request(app).get("/v1/usage");

      expect(res.status).toBe(401);
    });

    it("should include period, checkpoints, repositories, contexts, api_calls, and limits with expected fields", async () => {
      const res = await request(app)
        .get("/v1/usage")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);

      // Period fields
      expect(res.body.period).toHaveProperty("start");
      expect(res.body.period).toHaveProperty("end");

      // Checkpoints fields
      expect(res.body.checkpoints).toHaveProperty("count");
      expect(res.body.checkpoints).toHaveProperty("storage_bytes");
      expect(res.body.checkpoints).toHaveProperty("storage_formatted");

      // Repositories fields
      expect(res.body.repositories).toHaveProperty("count");
      expect(res.body.repositories).toHaveProperty("indexed_files");

      // Contexts fields
      expect(res.body.contexts).toHaveProperty("count");

      // API calls fields
      expect(res.body.api_calls).toHaveProperty("count");

      // Limits fields
      expect(res.body.limits).toHaveProperty("checkpoints");
      expect(res.body.limits).toHaveProperty("storage_bytes");
      expect(res.body.limits).toHaveProperty("storage_formatted");
      expect(res.body.limits).toHaveProperty("repositories");
      expect(res.body.limits).toHaveProperty("indexed_files");
      expect(res.body.limits).toHaveProperty("contexts");
      expect(res.body.limits).toHaveProperty("api_calls_per_day");
    });
  });

  // ==========================================================================
  // GET /v1/usage/history - Historical usage data
  // ==========================================================================
  describe("GET /v1/usage/history", () => {
    it("should return history with data array", async () => {
      const res = await request(app)
        .get("/v1/usage/history")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("start_date");
      expect(res.body).toHaveProperty("end_date");
      expect(res.body).toHaveProperty("granularity");
      expect(res.body).toHaveProperty("data");
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("should return 400 for invalid granularity", async () => {
      const res = await request(app)
        .get("/v1/usage/history")
        .query({ granularity: "hourly" })
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error).toHaveProperty("type", "invalid_request_error");
    });

    it("should accept valid granularity param (weekly)", async () => {
      const res = await request(app)
        .get("/v1/usage/history")
        .query({ granularity: "weekly" })
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.granularity).toBe("weekly");
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ==========================================================================
  // GET /v1/usage/breakdown - Breakdown by resource type
  // ==========================================================================
  describe("GET /v1/usage/breakdown", () => {
    it("should return repositories, checkpoints, contexts, and storage", async () => {
      const res = await request(app)
        .get("/v1/usage/breakdown")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("repositories");
      expect(res.body).toHaveProperty("checkpoints");
      expect(res.body).toHaveProperty("contexts");
      expect(res.body).toHaveProperty("storage");
      expect(Array.isArray(res.body.repositories)).toBe(true);
      expect(Array.isArray(res.body.checkpoints)).toBe(true);
      expect(Array.isArray(res.body.contexts)).toBe(true);
      expect(res.body.storage).toHaveProperty("breakdown");
      expect(Array.isArray(res.body.storage.breakdown)).toBe(true);
    });
  });

  // ==========================================================================
  // GET /v1/usage/limits - Plan limits
  // ==========================================================================
  describe("GET /v1/usage/limits", () => {
    it("should return plan, limits, current, and percentage", async () => {
      const res = await request(app)
        .get("/v1/usage/limits")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("plan");
      expect(res.body).toHaveProperty("limits");
      expect(res.body).toHaveProperty("current");
      expect(res.body).toHaveProperty("percentage");

      // The seeded user has a "free" plan
      expect(res.body.plan).toBe("free");

      // Limits should contain all expected keys
      expect(res.body.limits).toHaveProperty("checkpoints");
      expect(res.body.limits).toHaveProperty("storage_bytes");
      expect(res.body.limits).toHaveProperty("storage_formatted");
      expect(res.body.limits).toHaveProperty("repositories");
      expect(res.body.limits).toHaveProperty("indexed_files");
      expect(res.body.limits).toHaveProperty("contexts");
      expect(res.body.limits).toHaveProperty("api_calls_per_day");

      // Current should contain all expected keys
      expect(res.body.current).toHaveProperty("checkpoints");
      expect(res.body.current).toHaveProperty("storage_bytes");
      expect(res.body.current).toHaveProperty("storage_formatted");
      expect(res.body.current).toHaveProperty("repositories");
      expect(res.body.current).toHaveProperty("indexed_files");
      expect(res.body.current).toHaveProperty("contexts");
      expect(res.body.current).toHaveProperty("api_calls_today");

      // Percentage should contain all expected keys
      expect(res.body.percentage).toHaveProperty("checkpoints");
      expect(res.body.percentage).toHaveProperty("storage");
      expect(res.body.percentage).toHaveProperty("repositories");
      expect(res.body.percentage).toHaveProperty("indexed_files");
      expect(res.body.percentage).toHaveProperty("contexts");
      expect(res.body.percentage).toHaveProperty("api_calls");
    });
  });
});
