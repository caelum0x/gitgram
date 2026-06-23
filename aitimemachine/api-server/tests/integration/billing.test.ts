/**
 * Integration Tests: Billing Routes
 *
 * Tests the billing/subscription endpoints:
 * - POST /v1/billing/webhooks/polar - Polar webhook handling
 * - GET /v1/billing/subscription - Get subscription (internal auth)
 * - POST /v1/billing/customers - Create customer (internal auth)
 * - POST /v1/billing/checkout - Create checkout (internal auth)
 * - POST /v1/billing/portal - Create portal session (internal auth)
 * - GET /v1/billing/me - Get user's billing info (API key auth)
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  seedTestData,
  createTestApp,
  TEST_API_KEY,
  mockUsers,
  mockSubscriptions,
  mockValidatePolarEvent,
  MockWebhookVerificationError,
} from "../setup.js";

const INTERNAL_SECRET = "test-internal-secret";
process.env.INTERNAL_SECRET = INTERNAL_SECRET;
process.env.POLAR_WEBHOOK_SECRET = "test-polar-webhook-secret";
process.env.POLAR_ACCESS_TOKEN = "test-polar-token";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
  mockValidatePolarEvent.mockReset();
  mockValidatePolarEvent.mockImplementation((payload: Buffer | string) => {
    const serialized = Buffer.isBuffer(payload) ? payload.toString("utf8") : String(payload);
    return JSON.parse(serialized);
  });
});

describe("Billing Routes", () => {
  // ==========================================================================
  // GET /v1/billing/subscription - Internal auth
  // ==========================================================================
  describe("GET /v1/billing/subscription", () => {
    it("should return subscription info for a user", async () => {
      const res = await request(app)
        .get("/v1/billing/subscription")
        .set("X-Internal-Secret", INTERNAL_SECRET)
        .query({ userId: "user_test_001" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("subscription");
      expect(res.body).toHaveProperty("user");
      expect(res.body.user.id).toBe("user_test_001");
    });

    it("should return 400 without userId parameter", async () => {
      const res = await request(app)
        .get("/v1/billing/subscription")
        .set("X-Internal-Secret", INTERNAL_SECRET);

      expect(res.status).toBe(400);
    });

    it("should return 404 for non-existent user", async () => {
      const res = await request(app)
        .get("/v1/billing/subscription")
        .set("X-Internal-Secret", INTERNAL_SECRET)
        .query({ userId: "user_nonexistent" });

      expect(res.status).toBe(404);
    });

    it("should return 401 without internal auth", async () => {
      const res = await request(app)
        .get("/v1/billing/subscription")
        .query({ userId: "user_test_001" });

      expect(res.status).toBe(401);
    });
  });

  // ==========================================================================
  // POST /v1/billing/customers - Internal auth
  // ==========================================================================
  describe("POST /v1/billing/customers", () => {
    it("should create a customer when user has no polar customer ID", async () => {
      const res = await request(app)
        .post("/v1/billing/customers")
        .set("X-Internal-Secret", INTERNAL_SECRET)
        .send({
          userId: "user_test_001",
          email: "test@example.com",
          name: "Test User",
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("customerId");
    });

    it("should return existing customer ID if already set", async () => {
      // Set a polar customer ID on the test user
      const user = mockUsers.find((u) => u.id === "user_test_001");
      if (user) user.polarCustomerId = "polar_existing_cust";

      const res = await request(app)
        .post("/v1/billing/customers")
        .set("X-Internal-Secret", INTERNAL_SECRET)
        .send({
          userId: "user_test_001",
          email: "test@example.com",
        });

      expect(res.status).toBe(200);
      expect(res.body.customerId).toBe("polar_existing_cust");
    });

    it("should return 400 for missing required fields", async () => {
      const res = await request(app)
        .post("/v1/billing/customers")
        .set("X-Internal-Secret", INTERNAL_SECRET)
        .send({ userId: "user_test_001" });

      expect(res.status).toBe(400);
    });
  });

  // ==========================================================================
  // POST /v1/billing/checkout - Internal auth
  // ==========================================================================
  describe("POST /v1/billing/checkout", () => {
    it("should create a checkout session", async () => {
      const res = await request(app)
        .post("/v1/billing/checkout")
        .set("X-Internal-Secret", INTERNAL_SECRET)
        .send({
          userId: "user_test_001",
          email: "test@example.com",
          productId: "prod_test",
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("checkoutUrl");
      expect(res.body).toHaveProperty("checkoutId");
    });

    it("should return 400 for missing required fields", async () => {
      const res = await request(app)
        .post("/v1/billing/checkout")
        .set("X-Internal-Secret", INTERNAL_SECRET)
        .send({ userId: "user_test_001" });

      expect(res.status).toBe(400);
    });

    it("should return 404 for non-existent user", async () => {
      const res = await request(app)
        .post("/v1/billing/checkout")
        .set("X-Internal-Secret", INTERNAL_SECRET)
        .send({
          userId: "user_nonexistent",
          email: "x@example.com",
          productId: "prod_test",
        });

      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // POST /v1/billing/portal - Internal auth
  // ==========================================================================
  describe("POST /v1/billing/portal", () => {
    it("should create a portal session for user with customer ID", async () => {
      const user = mockUsers.find((u) => u.id === "user_test_001");
      if (user) user.polarCustomerId = "polar_portal_cust";

      const res = await request(app)
        .post("/v1/billing/portal")
        .set("X-Internal-Secret", INTERNAL_SECRET)
        .send({ userId: "user_test_001" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("portalUrl");
    });

    it("should return 404 for user without customer ID", async () => {
      const res = await request(app)
        .post("/v1/billing/portal")
        .set("X-Internal-Secret", INTERNAL_SECRET)
        .send({ userId: "user_test_001" });

      expect(res.status).toBe(404);
    });

    it("should return 400 for missing userId", async () => {
      const res = await request(app)
        .post("/v1/billing/portal")
        .set("X-Internal-Secret", INTERNAL_SECRET)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ==========================================================================
  // GET /v1/billing/me - API key auth
  // ==========================================================================
  describe("GET /v1/billing/me", () => {
    it("should return billing info for authenticated user", async () => {
      const res = await request(app)
        .get("/v1/billing/me")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("plan");
    });

    it("should include subscription if user has one", async () => {
      mockSubscriptions.push({
        id: "sub_test_001",
        userId: "user_test_001",
        polarCustomerId: "polar_cust_001",
        polarProductId: "prod_001",
        status: "active",
        plan: "pro",
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
      });

      const res = await request(app)
        .get("/v1/billing/me")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.subscription).not.toBeNull();
    });

    it("should return 401 without authentication", async () => {
      const res = await request(app).get("/v1/billing/me");

      expect(res.status).toBe(401);
    });
  });

  // ==========================================================================
  // Polar Webhook Handling
  // ==========================================================================
  describe("POST /v1/billing/webhooks/polar", () => {
    it("should accept a valid subscription.created webhook", async () => {
      const event = {
        type: "subscription.created",
        data: {
          id: "sub_polar_001",
          customer_id: "polar_cust_001",
          product_id: "",
          status: "active",
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
          cancel_at_period_end: false,
          metadata: { user_id: "user_test_001" },
        },
      };
      const payload = JSON.stringify(event);

      const res = await request(app)
        .post("/v1/billing/webhooks/polar")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("received", true);
    });

    it("should accept a valid subscription.canceled webhook", async () => {
      // First seed a subscription
      mockSubscriptions.push({
        id: "sub_cancel_001",
        userId: "user_test_001",
        polarCustomerId: "polar_cust_cancel",
        polarProductId: "prod_001",
        status: "active",
        plan: "pro",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const event = {
        type: "subscription.canceled",
        data: {
          id: "sub_cancel_001",
          canceled_at: new Date().toISOString(),
        },
      };
      const payload = JSON.stringify(event);

      const res = await request(app)
        .post("/v1/billing/webhooks/polar")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("received", true);
    });

    it("should return 401 for missing signature", async () => {
      mockValidatePolarEvent.mockImplementationOnce(() => {
        throw new MockWebhookVerificationError("Missing signature");
      });

      const res = await request(app)
        .post("/v1/billing/webhooks/polar")
        .set("Content-Type", "application/json")
        .send(JSON.stringify({ type: "test" }));

      expect(res.status).toBe(401);
    });

    it("should return 401 for invalid signature", async () => {
      mockValidatePolarEvent.mockImplementationOnce(() => {
        throw new MockWebhookVerificationError("Invalid signature");
      });

      const payload = JSON.stringify({ type: "test" });

      const res = await request(app)
        .post("/v1/billing/webhooks/polar")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(401);
    });

    it("should handle checkout.created event gracefully", async () => {
      const event = {
        type: "checkout.created",
        data: { id: "checkout_001" },
      };
      const payload = JSON.stringify(event);

      const res = await request(app)
        .post("/v1/billing/webhooks/polar")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("received", true);
    });

    it("should handle unrecognized event types gracefully", async () => {
      const event = {
        type: "unknown.event",
        data: {},
      };
      const payload = JSON.stringify(event);

      const res = await request(app)
        .post("/v1/billing/webhooks/polar")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("received", true);
    });
  });
});
