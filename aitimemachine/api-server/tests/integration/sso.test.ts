import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  seedTestData,
  createTestApp,
  TEST_API_KEY,
  mockOrganizations,
  mockOrgMembers,
  mockDomainVerifications,
  mockResolveTxt,
  mockUsers,
} from "../setup.js";

let app: Express;
let generateState: () => string;

beforeAll(async () => {
  app = await createTestApp();
  // Import generateState from the SSO route module to create valid CSRF tokens
  const ssoModule = await import("../../src/routes/sso.js");
  generateState = ssoModule.generateState;
});

beforeEach(() => {
  seedTestData();

  mockOrganizations.push({
    id: "org_test_001",
    name: "Test Enterprise Org",
    plan: "enterprise",
    ownerId: "user_test_001",
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  mockOrgMembers.push({
    id: "mem_test_001",
    orgId: "org_test_001",
    userId: "user_test_001",
    role: "owner",
    createdAt: new Date(),
  });

  mockResolveTxt.mockReset();
  mockResolveTxt.mockImplementation((_hostname: string, callback: Function) => {
    callback(null, []);
  });
});

describe("SSO Config", () => {
  describe("GET /v1/sso/config/:orgId", () => {
    it("returns SSO config for enterprise org", async () => {
      const res = await request(app)
        .get("/v1/sso/config/org_test_001")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("org_id", "org_test_001");
      expect(res.body).toHaveProperty("sso");
    });

    it("returns null sso for non-enterprise org", async () => {
      mockOrganizations.push({
        id: "org_free_001",
        name: "Free Tier Org",
        plan: "free",
        ownerId: "user_test_001",
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockOrgMembers.push({
        id: "mem_free_001",
        orgId: "org_free_001",
        userId: "user_test_001",
        role: "owner",
        createdAt: new Date(),
      });

      const res = await request(app)
        .get("/v1/sso/config/org_free_001")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.sso).toBeNull();
      expect(res.body.message).toMatch(/enterprise/i);
    });
  });

  describe("PUT /v1/sso/config/:orgId", () => {
    it("saves SSO config to organization metadata", async () => {
      const ssoConfig = {
        enabled: true,
        provider: "saml",
        enforceSSO: false,
        allowedDomains: ["example.com"],
      };

      const res = await request(app)
        .put("/v1/sso/config/org_test_001")
        .set("X-API-Key", TEST_API_KEY)
        .send(ssoConfig);

      expect(res.status).toBe(200);

      const updatedOrg = mockOrganizations.find(
        (o) => o.id === "org_test_001"
      );
      expect(updatedOrg).toBeDefined();
      expect(updatedOrg!.metadata).toBeDefined();
      expect(updatedOrg!.metadata.sso).toBeDefined();
      expect(updatedOrg!.metadata.sso.provider).toBe("saml");
      expect(updatedOrg!.metadata.sso.enabled).toBe(true);
    });

    it("returns updated config in response", async () => {
      const ssoConfig = {
        enabled: true,
        provider: "saml",
        allowedDomains: ["example.com"],
      };

      const res = await request(app)
        .put("/v1/sso/config/org_test_001")
        .set("X-API-Key", TEST_API_KEY)
        .send(ssoConfig);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("org_id", "org_test_001");
      expect(res.body).toHaveProperty("sso");
      expect(res.body.sso.provider).toBe("saml");
      expect(res.body.sso.enabled).toBe(true);
      expect(res.body).toHaveProperty("message");
    });
  });
});

describe("SSO Domain Verification", () => {
  describe("POST /v1/sso/verify-domain/:orgId", () => {
    it("creates domain verification record", async () => {
      const initialLength = mockDomainVerifications.length;

      const res = await request(app)
        .post("/v1/sso/verify-domain/org_test_001")
        .set("X-API-Key", TEST_API_KEY)
        .send({ domain: "enterprise-test.com" });

      expect(res.status).toBe(200);
      expect(mockDomainVerifications.length).toBe(initialLength + 1);

      const created = mockDomainVerifications.find(
        (v) => v.domain === "enterprise-test.com"
      );
      expect(created).toBeDefined();
      expect(created!.orgId).toBe("org_test_001");
      expect(created!.verified).toBe(false);
    });

    it("returns verification token and instructions", async () => {
      const res = await request(app)
        .post("/v1/sso/verify-domain/org_test_001")
        .set("X-API-Key", TEST_API_KEY)
        .send({ domain: "verify-test.com" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("verification_token");
      expect(res.body.verification_token).toBeTruthy();
      expect(res.body).toHaveProperty("instructions");
      expect(Array.isArray(res.body.instructions)).toBe(true);
    });
  });

  describe("POST /v1/sso/verify-domain/:orgId/check", () => {
    beforeEach(async () => {
      mockDomainVerifications.push({
        id: "dv_test_001",
        orgId: "org_test_001",
        domain: "check-test.com",
        verificationToken: "aitm-verify=abc123",
        verified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it("returns verified: false when DNS record is not found", async () => {
      mockResolveTxt.mockImplementation(
        (_hostname: string, callback: Function) => {
          callback(null, []);
        }
      );

      const res = await request(app)
        .post("/v1/sso/verify-domain/org_test_001/check")
        .set("X-API-Key", TEST_API_KEY)
        .send({ domain: "check-test.com" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("verified", false);
    });

    it("returns verified: true when DNS record matches token", async () => {
      const token = mockDomainVerifications.find(
        (v) => v.domain === "check-test.com"
      )!.verificationToken;

      mockResolveTxt.mockImplementation(
        (_hostname: string, callback: Function) => {
          callback(null, [[token]]);
        }
      );

      const res = await request(app)
        .post("/v1/sso/verify-domain/org_test_001/check")
        .set("X-API-Key", TEST_API_KEY)
        .send({ domain: "check-test.com" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("verified", true);

      const record = mockDomainVerifications.find(
        (v) => v.domain === "check-test.com"
      );
      expect(record).toBeDefined();
      expect(record!.verified).toBe(true);
    });
  });
});

describe("SSO SAML/OIDC Validation", () => {
  describe("PUT /v1/sso/config/:orgId — SAML metadata validation", () => {
    it("should accept valid SAML config without metadataUrl (no validation needed)", async () => {
      const res = await request(app)
        .put("/v1/sso/config/org_test_001")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          enabled: true,
          provider: "saml",
          saml: {
            entityId: "https://idp.example.com",
            acsUrl: "https://timemachine.gitgram.app/sso/acs",
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.sso.provider).toBe("saml");
    });

    it("should reject invalid domain format in allowedDomains", async () => {
      const res = await request(app)
        .put("/v1/sso/config/org_test_001")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          allowedDomains: ["not a domain!"],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("invalid_domain");
    });
  });

  describe("PUT /v1/sso/config/:orgId — OIDC validation", () => {
    it("should accept OIDC config without issuer (no validation needed)", async () => {
      const res = await request(app)
        .put("/v1/sso/config/org_test_001")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          enabled: true,
          provider: "oidc",
          oidc: {
            clientId: "my-client-id",
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.sso.provider).toBe("oidc");
    });
  });
});

describe("SSO JIT Provisioning", () => {
  describe("POST /v1/sso/callback/enterprise/:orgId", () => {
    beforeEach(() => {
      // Set up enterprise org with SSO enabled and JIT enabled
      const org = mockOrganizations.find((o: any) => o.id === "org_test_001");
      if (org) {
        org.metadata = {
          sso: {
            enabled: true,
            provider: "saml",
            enforceSSO: false,
            allowedDomains: ["example.com"],
            jitProvisioning: true,
            defaultRole: "member",
          },
        };
      }
    });

    it("should return existing user if already a member", async () => {
      const state = generateState();
      const res = await request(app)
        .post("/v1/sso/callback/enterprise/org_test_001")
        .set("X-API-Key", TEST_API_KEY)
        .send({ email: "test@example.com", name: "Test User", state });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("provisioned", false);
      expect(res.body.message).toMatch(/already exists/);
    });

    it("should provision a new user via JIT when user doesn't exist", async () => {
      const initialUserCount = mockUsers.length;
      const state = generateState();
      const res = await request(app)
        .post("/v1/sso/callback/enterprise/org_test_001")
        .set("X-API-Key", TEST_API_KEY)
        .send({ email: "newuser@example.com", name: "New User", state });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("provisioned", true);
      expect(res.body.user).toHaveProperty("email", "newuser@example.com");
      expect(mockUsers.length).toBeGreaterThan(initialUserCount);
    });

    it("should add existing user to org via JIT if not already a member", async () => {
      // Add a user who exists but is not a member of org_test_001
      mockUsers.push({
        id: "user_external_001",
        email: "external@example.com",
        name: "External User",
        plan: "free",
        polarCustomerId: null,
        storageUsedBytes: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const state = generateState();
      const res = await request(app)
        .post("/v1/sso/callback/enterprise/org_test_001")
        .set("X-API-Key", TEST_API_KEY)
        .send({ email: "external@example.com", name: "External User", state });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("provisioned", true);
      expect(res.body.message).toMatch(/Existing user added/);
    });

    it("should return 403 when JIT is disabled and user doesn't exist", async () => {
      const org = mockOrganizations.find((o: any) => o.id === "org_test_001");
      if (org) {
        org.metadata.sso.jitProvisioning = false;
      }

      const state = generateState();
      const res = await request(app)
        .post("/v1/sso/callback/enterprise/org_test_001")
        .set("X-API-Key", TEST_API_KEY)
        .send({ email: "unknown@example.com", name: "Unknown", state });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("jit_disabled");
    });

    it("should return 403 when SSO is not enabled", async () => {
      const org = mockOrganizations.find((o: any) => o.id === "org_test_001");
      if (org) {
        org.metadata.sso.enabled = false;
      }

      const state = generateState();
      const res = await request(app)
        .post("/v1/sso/callback/enterprise/org_test_001")
        .set("X-API-Key", TEST_API_KEY)
        .send({ email: "test@example.com", state });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("sso_not_enabled");
    });

    it("should return 400 when email is missing", async () => {
      const state = generateState();
      const res = await request(app)
        .post("/v1/sso/callback/enterprise/org_test_001")
        .set("X-API-Key", TEST_API_KEY)
        .send({ state });

      expect(res.status).toBe(400);
    });

    it("should return 404 for non-existent organization", async () => {
      const state = generateState();
      const res = await request(app)
        .post("/v1/sso/callback/enterprise/org_nonexistent")
        .set("X-API-Key", TEST_API_KEY)
        .send({ email: "test@example.com", state });

      expect(res.status).toBe(404);
    });

    it("should return 403 for non-enterprise org", async () => {
      mockOrganizations.push({
        id: "org_free_jit",
        name: "Free Org",
        plan: "free",
        ownerId: "user_test_001",
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const state = generateState();
      const res = await request(app)
        .post("/v1/sso/callback/enterprise/org_free_jit")
        .set("X-API-Key", TEST_API_KEY)
        .send({ email: "test@example.com", state });

      expect(res.status).toBe(403);
    });
  });
});
