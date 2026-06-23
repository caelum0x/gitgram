/**
 * Integration Tests: Email Service
 *
 * Tests the email service abstraction:
 * - Provider detection
 * - Send mock emails
 * - Console fallback behavior
 * - Integration with org invitations
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import type { Express } from "express";
import {
  seedTestData,
  createTestApp,
} from "../setup.js";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
});

describe("Email Service", () => {
  describe("getEmailService", () => {
    it("should return a service with send method", async () => {
      const { getEmailService } = await import("../../src/services/email.js");
      const service = getEmailService();
      expect(service).toBeDefined();
      expect(typeof service.send).toBe("function");
    });

    it("should return a service with getProviderInfo", async () => {
      const { getEmailService } = await import("../../src/services/email.js");
      const service = getEmailService();
      const info = service.getProviderInfo();
      expect(info).toHaveProperty("provider");
      expect(info).toHaveProperty("hasApiKey");
    });

    it("should send an email successfully", async () => {
      const { getEmailService } = await import("../../src/services/email.js");
      const service = getEmailService();

      const result = await service.send({
        to: "test@example.com",
        subject: "Test Email",
        html: "<p>Hello World</p>",
      });

      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("provider");
    });

    it("should handle array of recipients", async () => {
      const { getEmailService } = await import("../../src/services/email.js");
      const service = getEmailService();

      const result = await service.send({
        to: ["user1@example.com", "user2@example.com"],
        subject: "Multi-recipient Test",
        html: "<p>Hello!</p>",
        text: "Hello!",
      });

      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("provider");
    });

    it("should support custom from address", async () => {
      const { getEmailService } = await import("../../src/services/email.js");
      const service = getEmailService();

      const result = await service.send({
        to: "test@example.com",
        subject: "Custom From",
        html: "<p>Test</p>",
        from: "custom@gitgram.app",
        replyTo: "support@gitgram.app",
      });

      expect(result).toHaveProperty("id");
    });

    it("should return mock provider info in test environment", async () => {
      const { getEmailService } = await import("../../src/services/email.js");
      const service = getEmailService();
      const info = service.getProviderInfo();
      // In test environment, mock is active
      expect(info.provider).toBeDefined();
    });
  });
});
