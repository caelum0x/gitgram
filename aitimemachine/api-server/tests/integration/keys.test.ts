/**
 * Integration Tests: Keys Routes
 *
 * Tests the API key management endpoints:
 * - GET /v1/keys - List all API keys
 * - GET /v1/keys/:id - Get specific key details
 * - POST /v1/keys - Create a new API key
 * - DELETE /v1/keys/:id - Revoke an API key
 * - PATCH /v1/keys/:id/scopes - Update key scopes
 * - PATCH /v1/keys/:id - Update key metadata
 * - GET /v1/keys/scopes/available - List available scopes
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  seedTestData,
  createTestApp,
  TEST_API_KEY,
  mockApiKeys,
} from "../setup.js";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
});

describe("Keys Routes", () => {
  // ==========================================================================
  // GET /v1/keys - List API keys
  // ==========================================================================
  describe("GET /v1/keys", () => {
    it("should list all API keys for authenticated user", async () => {
      const res = await request(app)
        .get("/v1/keys")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("keys");
      expect(res.body).toHaveProperty("total");
      expect(Array.isArray(res.body.keys)).toBe(true);
      expect(res.body.total).toBeGreaterThanOrEqual(1);
    });

    it("should include status field on each key", async () => {
      const res = await request(app)
        .get("/v1/keys")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      for (const key of res.body.keys) {
        expect(["active", "revoked", "expired"]).toContain(key.status);
      }
    });

    it("should return 401 without authentication", async () => {
      const res = await request(app).get("/v1/keys");

      expect(res.status).toBe(401);
    });
  });

  // ==========================================================================
  // GET /v1/keys/:id - Get single key
  // ==========================================================================
  describe("GET /v1/keys/:id", () => {
    it("should return details for an existing key", async () => {
      const res = await request(app)
        .get("/v1/keys/key_test_001")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe("key_test_001");
      expect(res.body).toHaveProperty("status");
    });

    it("should return 404 for non-existent key", async () => {
      const res = await request(app)
        .get("/v1/keys/key_nonexistent")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // POST /v1/keys - Create API key
  // ==========================================================================
  describe("POST /v1/keys", () => {
    it("should create a new API key with default scopes", async () => {
      const res = await request(app)
        .post("/v1/keys")
        .set("X-API-Key", TEST_API_KEY)
        .send({ name: "My New Key" });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body).toHaveProperty("key");
      expect(res.body.key).toMatch(/^aitm_/);
      expect(res.body.name).toBe("My New Key");
      expect(res.body).toHaveProperty("message");
    });

    it("should create a key with custom scopes", async () => {
      const res = await request(app)
        .post("/v1/keys")
        .set("X-API-Key", TEST_API_KEY)
        .send({ name: "Read Only Key", scopes: ["read"] });

      expect(res.status).toBe(201);
      expect(res.body.scopes).toEqual(["read"]);
    });

    it("should reject invalid scopes", async () => {
      const res = await request(app)
        .post("/v1/keys")
        .set("X-API-Key", TEST_API_KEY)
        .send({ name: "Bad Key", scopes: ["invalid_scope"] });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("should return 401 without authentication", async () => {
      const res = await request(app)
        .post("/v1/keys")
        .send({ name: "Unauthed Key" });

      expect(res.status).toBe(401);
    });
  });

  // ==========================================================================
  // DELETE /v1/keys/:id - Revoke key
  // ==========================================================================
  describe("DELETE /v1/keys/:id", () => {
    it("should revoke an existing key", async () => {
      // Add a second key that can be revoked (can't revoke current key)
      mockApiKeys.push({
        id: "key_to_revoke",
        userId: "user_test_001",
        keyHash: "somehash",
        keyPrefix: "aitm_revoke",
        name: "Key to Revoke",
        scopes: ["read", "write"],
        expiresAt: null,
        allowedIps: null,
        lastUsedAt: null,
        createdAt: new Date(),
        revokedAt: null,
      });

      const res = await request(app)
        .delete("/v1/keys/key_to_revoke")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("revoked");
    });

    it("should return 404 for non-existent key", async () => {
      const res = await request(app)
        .delete("/v1/keys/key_nonexistent")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(404);
    });

    it("should prevent revoking the current key", async () => {
      const res = await request(app)
        .delete("/v1/keys/key_test_001")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("Cannot revoke current key");
    });

    it("should reject revoking an already revoked key", async () => {
      mockApiKeys.push({
        id: "key_already_revoked",
        userId: "user_test_001",
        keyHash: "somehash2",
        keyPrefix: "aitm_revd",
        name: "Already Revoked",
        scopes: ["read"],
        expiresAt: null,
        allowedIps: null,
        lastUsedAt: null,
        createdAt: new Date(),
        revokedAt: new Date(),
      });

      const res = await request(app)
        .delete("/v1/keys/key_already_revoked")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("already revoked");
    });
  });

  // ==========================================================================
  // PATCH /v1/keys/:id/scopes - Update scopes
  // ==========================================================================
  describe("PATCH /v1/keys/:id/scopes", () => {
    it("should update scopes for a key", async () => {
      mockApiKeys.push({
        id: "key_scope_update",
        userId: "user_test_001",
        keyHash: "scopehash",
        keyPrefix: "aitm_scope",
        name: "Scope Key",
        scopes: ["read"],
        expiresAt: null,
        allowedIps: null,
        lastUsedAt: null,
        createdAt: new Date(),
        revokedAt: null,
      });

      const res = await request(app)
        .patch("/v1/keys/key_scope_update/scopes")
        .set("X-API-Key", TEST_API_KEY)
        .send({ scopes: ["read", "write", "admin"] });

      expect(res.status).toBe(200);
      expect(res.body.scopes).toEqual(["read", "write", "admin"]);
    });

    it("should reject non-array scopes", async () => {
      const res = await request(app)
        .patch("/v1/keys/key_test_001/scopes")
        .set("X-API-Key", TEST_API_KEY)
        .send({ scopes: "read" });

      expect(res.status).toBe(400);
    });

    it("should return 404 for non-existent key", async () => {
      const res = await request(app)
        .patch("/v1/keys/key_nonexistent/scopes")
        .set("X-API-Key", TEST_API_KEY)
        .send({ scopes: ["read"] });

      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // PATCH /v1/keys/:id - Update metadata
  // ==========================================================================
  describe("PATCH /v1/keys/:id", () => {
    it("should update key name", async () => {
      mockApiKeys.push({
        id: "key_meta_update",
        userId: "user_test_001",
        keyHash: "metahash",
        keyPrefix: "aitm_meta",
        name: "Old Name",
        scopes: ["read", "write"],
        expiresAt: null,
        allowedIps: null,
        lastUsedAt: null,
        createdAt: new Date(),
        revokedAt: null,
      });

      const res = await request(app)
        .patch("/v1/keys/key_meta_update")
        .set("X-API-Key", TEST_API_KEY)
        .send({ name: "New Name" });

      expect(res.status).toBe(200);
    });

    it("should return 400 with no updates provided", async () => {
      mockApiKeys.push({
        id: "key_no_update",
        userId: "user_test_001",
        keyHash: "noupdatehash",
        keyPrefix: "aitm_noup",
        name: "No Update",
        scopes: ["read"],
        expiresAt: null,
        allowedIps: null,
        lastUsedAt: null,
        createdAt: new Date(),
        revokedAt: null,
      });

      const res = await request(app)
        .patch("/v1/keys/key_no_update")
        .set("X-API-Key", TEST_API_KEY)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("No updates");
    });

    it("should return 404 for non-existent key", async () => {
      const res = await request(app)
        .patch("/v1/keys/key_nonexistent")
        .set("X-API-Key", TEST_API_KEY)
        .send({ name: "whatever" });

      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // GET /v1/keys/scopes/available
  // ==========================================================================
  describe("GET /v1/keys/scopes/available", () => {
    it("should return available scopes", async () => {
      const res = await request(app)
        .get("/v1/keys/scopes/available")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("scopes");
      expect(res.body).toHaveProperty("descriptions");
      expect(res.body).toHaveProperty("default");
      expect(Array.isArray(res.body.scopes)).toBe(true);
    });
  });
});
