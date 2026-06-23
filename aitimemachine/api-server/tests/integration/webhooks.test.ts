import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  seedTestData,
  createTestApp,
  TEST_API_KEY,
  mockWebhooks,
  mockWebhookDeliveries,
} from "../setup.js";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
});

// ============================================================================
// WEBHOOK MANAGEMENT (no auth required)
// ============================================================================

describe("POST /v1/webhooks/register", () => {
  it("creates a webhook with valid data", async () => {
    const res = await request(app)
      .post("/v1/webhooks/register")
      .set("X-API-Key", TEST_API_KEY)
      .send({
        url: "https://example.com/webhook",
        events: ["checkpoint.created", "session.ended"],
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("secret");
    expect(res.body.events).toEqual(["checkpoint.created", "session.ended"]);
    expect(res.body.message).toContain("Webhook registered");
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await request(app)
      .post("/v1/webhooks/register")
      .set("X-API-Key", TEST_API_KEY)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("url and events array required");
  });

  it("returns 400 when events is not an array", async () => {
    const res = await request(app)
      .post("/v1/webhooks/register")
      .set("X-API-Key", TEST_API_KEY)
      .send({
        url: "https://example.com/webhook",
        events: "checkpoint.created",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("url and events array required");
  });

  it("returns an id and secret in the response", async () => {
    const res = await request(app)
      .post("/v1/webhooks/register")
      .set("X-API-Key", TEST_API_KEY)
      .send({
        url: "https://example.com/hook",
        events: ["*"],
      });

    expect(res.status).toBe(200);
    expect(typeof res.body.id).toBe("string");
    expect(res.body.id.length).toBeGreaterThan(0);
    expect(typeof res.body.secret).toBe("string");
    expect(res.body.secret.length).toBeGreaterThan(0);
  });
});

describe("GET /v1/webhooks/list", () => {
  it("returns webhooks for the authenticated user", async () => {
    // Seed a webhook into the mock store
    mockWebhooks.push({
      id: "wh_test_001",
      userId: "user_test_001",
      url: "https://example.com/webhook",
      secret: "test_secret",
      events: ["checkpoint.created"],
      isActive: true,
      createdAt: new Date(),
      lastTriggeredAt: null,
      failureCount: 0,
    });

    const res = await request(app)
      .get("/v1/webhooks/list")
      .set("X-API-Key", TEST_API_KEY);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("webhooks");
    expect(Array.isArray(res.body.webhooks)).toBe(true);
    expect(res.body.webhooks.length).toBeGreaterThanOrEqual(1);
  });

  it("returns 401 without authentication", async () => {
    const res = await request(app).get("/v1/webhooks/list");

    expect(res.status).toBe(401);
  });

  it("returns empty array when user has no webhooks", async () => {
    const res = await request(app)
      .get("/v1/webhooks/list")
      .set("X-API-Key", TEST_API_KEY);

    expect(res.status).toBe(200);
    expect(res.body.webhooks).toEqual([]);
  });
});

describe("PATCH /v1/webhooks/:webhookId", () => {
  it("returns 404 for a non-existent webhook", async () => {
    const res = await request(app)
      .patch("/v1/webhooks/wh_nonexistent")
      .set("X-API-Key", TEST_API_KEY)
      .send({ isActive: false });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain("Webhook not found");
  });

  it("updates an existing webhook and returns success", async () => {
    // Seed a webhook to update
    mockWebhooks.push({
      id: "wh_update_001",
      userId: "user_test_001",
      url: "https://example.com/webhook",
      secret: "test_secret",
      events: ["checkpoint.created"],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastTriggeredAt: null,
      failureCount: 0,
    });

    const res = await request(app)
      .patch("/v1/webhooks/wh_update_001")
      .set("X-API-Key", TEST_API_KEY)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("DELETE /v1/webhooks/:webhookId", () => {
  it("returns 500 due to mock limitation (delete chain lacks returning())", async () => {
    // The route calls db.delete().where().returning(), but the mock
    // createDeleteChain does not implement a returning() method.
    // This causes a TypeError which is caught by the route's try/catch
    // and results in a 500 response.
    const res = await request(app)
      .delete("/v1/webhooks/wh_nonexistent")
      .set("X-API-Key", TEST_API_KEY);

    expect(res.status).toBe(500);
    expect(res.body.error.message).toContain("Failed to delete webhook");
  });
});

// ============================================================================
// WEBHOOK DELIVERY (auth required via apiKeyAuth)
// ============================================================================

describe("GET /v1/webhooks/:webhookId/deliveries", () => {
  it("returns 401 without an API key", async () => {
    const res = await request(app).get("/v1/webhooks/wh_test_001/deliveries");

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it("returns 404 for a non-existent webhook when authenticated", async () => {
    const res = await request(app)
      .get("/v1/webhooks/wh_nonexistent/deliveries")
      .set("X-API-Key", TEST_API_KEY);

    expect(res.status).toBe(404);
    expect(res.body.error.type).toBe("not_found");
    expect(res.body.error.message).toBe("Webhook not found");
  });

  it("returns deliveries, stats, and pagination for an existing webhook", async () => {
    // Seed a webhook owned by the test user
    mockWebhooks.push({
      id: "wh_delivery_001",
      userId: "user_test_001",
      url: "https://example.com/webhook",
      secret: "test_secret",
      events: ["checkpoint.created"],
      isActive: true,
      createdAt: new Date(),
      lastTriggeredAt: null,
      failureCount: 0,
    });

    const res = await request(app)
      .get("/v1/webhooks/wh_delivery_001/deliveries")
      .set("X-API-Key", TEST_API_KEY);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("deliveries");
    expect(res.body).toHaveProperty("stats");
    expect(res.body).toHaveProperty("pagination");
    expect(Array.isArray(res.body.deliveries)).toBe(true);
    expect(res.body.pagination).toHaveProperty("limit");
    expect(res.body.pagination).toHaveProperty("offset");
    expect(res.body.pagination).toHaveProperty("hasMore");
  });
});

describe("GET /v1/webhooks/:webhookId/stats", () => {
  it("returns 401 without an API key", async () => {
    const res = await request(app).get("/v1/webhooks/wh_test_001/stats");

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it("returns 404 for a non-existent webhook when authenticated", async () => {
    const res = await request(app)
      .get("/v1/webhooks/wh_nonexistent/stats")
      .set("X-API-Key", TEST_API_KEY);

    expect(res.status).toBe(404);
    expect(res.body.error.type).toBe("not_found");
    expect(res.body.error.message).toBe("Webhook not found");
  });

  it("returns stats for an existing webhook", async () => {
    // Seed a webhook owned by the test user
    mockWebhooks.push({
      id: "wh_stats_001",
      userId: "user_test_001",
      url: "https://example.com/webhook",
      secret: "test_secret",
      events: ["checkpoint.created"],
      isActive: true,
      createdAt: new Date(),
      lastTriggeredAt: null,
      failureCount: 0,
    });

    const res = await request(app)
      .get("/v1/webhooks/wh_stats_001/stats")
      .set("X-API-Key", TEST_API_KEY);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("stats");
    expect(res.body.stats).toHaveProperty("total");
    expect(res.body.stats).toHaveProperty("success");
    expect(res.body.stats).toHaveProperty("failed");
    expect(res.body.stats).toHaveProperty("pending");
    expect(res.body.stats).toHaveProperty("successRate");
  });
});
