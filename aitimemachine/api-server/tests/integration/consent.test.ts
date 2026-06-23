/**
 * Integration Tests: Consent Routes
 *
 * Tests the /v1/consent endpoints:
 * - POST /v1/consent         - Create/update a consent record
 * - GET  /v1/consent         - List active consents
 * - GET  /v1/consent/history - Full consent history
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  seedTestData,
  createTestApp,
  TEST_API_KEY,
  mockConsents,
} from "../setup.js";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
});

describe("Consent Routes - /v1/consent", () => {
  // ========================================================================
  // POST /v1/consent - Create consent
  // ========================================================================
  describe("POST /v1/consent", () => {
    it("should require authentication", async () => {
      const res = await request(app)
        .post("/v1/consent")
        .send({
          consentType: "operational_capture",
          granted: true,
          projectId: "proj_test_001",
        });

      expect(res.status).toBe(401);
    });

    it("should create a consent record for a project", async () => {
      const res = await request(app)
        .post("/v1/consent")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          consentType: "operational_capture",
          granted: true,
          projectId: "proj_test_001",
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("success", true);
      expect(res.body).toHaveProperty("consent");
      expect(res.body.consent).toHaveProperty("consentType", "operational_capture");
      expect(res.body.consent).toHaveProperty("granted", true);
      expect(res.body.consent).toHaveProperty("projectId", "proj_test_001");
    });

    it("should create a training_export consent", async () => {
      const res = await request(app)
        .post("/v1/consent")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          consentType: "training_export",
          granted: false,
          projectId: "proj_test_001",
        });

      expect(res.status).toBe(201);
      expect(res.body.consent.consentType).toBe("training_export");
      expect(res.body.consent.granted).toBe(false);
    });

    it("should return 400 when neither projectId nor organizationId is provided", async () => {
      const res = await request(app)
        .post("/v1/consent")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          consentType: "operational_capture",
          granted: true,
        });

      expect(res.status).toBe(400);
    });

    it("should return 400 when both projectId and organizationId are provided", async () => {
      const res = await request(app)
        .post("/v1/consent")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          consentType: "operational_capture",
          granted: true,
          projectId: "proj_test_001",
          organizationId: "org_test_001",
        });

      expect(res.status).toBe(400);
    });

    it("should return 400 for invalid consentType", async () => {
      const res = await request(app)
        .post("/v1/consent")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          consentType: "invalid_type",
          granted: true,
          projectId: "proj_test_001",
        });

      expect(res.status).toBe(400);
    });
  });

  // ========================================================================
  // GET /v1/consent - List active consents
  // ========================================================================
  describe("GET /v1/consent", () => {
    it("should require authentication", async () => {
      const res = await request(app).get("/v1/consent");

      expect(res.status).toBe(401);
    });

    it("should return a list of consents", async () => {
      const res = await request(app)
        .get("/v1/consent")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("success", true);
      expect(res.body).toHaveProperty("consents");
      expect(Array.isArray(res.body.consents)).toBe(true);
      expect(res.body).toHaveProperty("pagination");
      expect(res.body.pagination).toHaveProperty("limit");
      expect(res.body.pagination).toHaveProperty("offset");
    });

    it("should filter by projectId", async () => {
      const res = await request(app)
        .get("/v1/consent")
        .query({ projectId: "proj_test_001" })
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("consents");
    });
  });

  // ========================================================================
  // GET /v1/consent/history - Full consent history
  // ========================================================================
  describe("GET /v1/consent/history", () => {
    it("should require authentication", async () => {
      const res = await request(app).get("/v1/consent/history");

      expect(res.status).toBe(401);
    });

    it("should return consent history", async () => {
      const res = await request(app)
        .get("/v1/consent/history")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("success", true);
      expect(res.body).toHaveProperty("history");
      expect(Array.isArray(res.body.history)).toBe(true);
      expect(res.body).toHaveProperty("pagination");
    });

    it("should filter history by projectId", async () => {
      const res = await request(app)
        .get("/v1/consent/history")
        .query({ projectId: "proj_test_001" })
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("history");
    });
  });
});
