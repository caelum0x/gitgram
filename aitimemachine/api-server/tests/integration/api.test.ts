/**
 * API Integration Tests
 * Tests error handling, rate limiting, and core endpoints
 *
 * NOTE: These tests use fetch() against a live server (API_BASE) and are
 * NOT compatible with the mock DB / supertest test setup. They are skipped
 * by default and only run when a real server is running at the configured
 * API_BASE URL (default: http://localhost:3000).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Test configuration
const API_BASE = process.env.API_BASE || "http://localhost:3000";
const API_KEY = process.env.TEST_API_KEY || "test-api-key";

// Check if a real server is running
let serverAvailable = false;
beforeAll(async () => {
  try {
    const response = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2000) });
    serverAvailable = response.ok;
  } catch {
    serverAvailable = false;
  }
});

// Helper for making requests
async function apiRequest(
  path: string,
  options: RequestInit = {}
): Promise<{ status: number; data: any }> {
  const url = `${API_BASE}${path}`;
  const headers = {
    "Content-Type": "application/json",
    "X-API-Key": API_KEY,
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => null);

  return { status: response.status, data };
}

// Skip helper: skip test if server is not available
function skipIfNoServer() {
  if (!serverAvailable) {
    return true;
  }
  return false;
}

describe.skipIf(!process.env.API_BASE)("API Error Handling", () => {
  describe("Authentication Errors", () => {
    it("should return 401 for missing API key", async () => {
      const response = await fetch(`${API_BASE}/v1/projects`, {
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.type).toBe("authentication_error");
      expect(data.error.code).toBe("missing_api_key");
    });

    it("should return 401 for invalid API key", async () => {
      const response = await fetch(`${API_BASE}/v1/projects`, {
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "invalid-key",
        },
      });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.type).toBe("authentication_error");
    });
  });

  describe("Validation Errors", () => {
    it("should return 400 for missing required parameters", async () => {
      const { status, data } = await apiRequest("/v1/universal-search", {
        method: "POST",
        body: JSON.stringify({}),
      });

      expect(status).toBe(400);
      expect(data.error.type).toBe("validation_error");
      expect(data.error.param).toBe("query");
    });

    it("should return 400 for invalid JSON", async () => {
      const response = await fetch(`${API_BASE}/v1/universal-search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
        },
        body: "{ invalid json }",
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.type).toBe("invalid_request_error");
    });
  });

  describe("Not Found Errors", () => {
    it("should return 404 for non-existent endpoint", async () => {
      const { status, data } = await apiRequest("/v1/nonexistent");

      expect(status).toBe(404);
      expect(data.error.type).toBe("not_found");
    });

    it("should return 404 for non-existent resource", async () => {
      const { status, data } = await apiRequest("/v1/projects/nonexistent-id");

      expect(status).toBe(404);
      expect(data.error.code).toContain("not_found");
    });
  });
});

describe.skipIf(!process.env.API_BASE)("Rate Limiting", () => {
  it("should include rate limit headers", async () => {
    const response = await fetch(`${API_BASE}/v1/projects`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
    });

    expect(response.headers.get("X-RateLimit-Limit")).toBeDefined();
    expect(response.headers.get("X-RateLimit-Remaining")).toBeDefined();
  });

  it("should decrement remaining count", async () => {
    const r1 = await fetch(`${API_BASE}/v1/projects`, {
      headers: { "X-API-Key": API_KEY },
    });
    const remaining1 = parseInt(r1.headers.get("X-RateLimit-Remaining") || "0");

    const r2 = await fetch(`${API_BASE}/v1/projects`, {
      headers: { "X-API-Key": API_KEY },
    });
    const remaining2 = parseInt(r2.headers.get("X-RateLimit-Remaining") || "0");

    // Remaining should decrease (or be the same if we hit a new window)
    expect(remaining2).toBeLessThanOrEqual(remaining1);
  });

  // Note: Burst rate limit test would require many rapid requests
  // which is not suitable for regular test runs
});

describe.skipIf(!process.env.API_BASE)("Universal Search", () => {
  it("should return results for valid query", async () => {
    const { status, data } = await apiRequest("/v1/universal-search", {
      method: "POST",
      body: JSON.stringify({ query: "test" }),
    });

    expect(status).toBe(200);
    expect(data).toHaveProperty("data");
    expect(data).toHaveProperty("pagination");
  });

  it("should handle query variants (camelCase)", async () => {
    const { status, data } = await apiRequest("/v1/universal-search", {
      method: "POST",
      body: JSON.stringify({ query: "createCheckpoint" }),
    });

    expect(status).toBe(200);
    // Should match snake_case variants too
  });

  it("should handle query variants (snake_case)", async () => {
    const { status, data } = await apiRequest("/v1/universal-search", {
      method: "POST",
      body: JSON.stringify({ query: "create_checkpoint" }),
    });

    expect(status).toBe(200);
  });

  it("should support hybrid search mode", async () => {
    const { status, data } = await apiRequest("/v1/universal-search", {
      method: "POST",
      body: JSON.stringify({
        query: "restore state",
        search_mode: "hybrid",
      }),
    });

    expect(status).toBe(200);
  });

  it("should respect source filters", async () => {
    const { status, data } = await apiRequest("/v1/universal-search", {
      method: "POST",
      body: JSON.stringify({
        query: "test",
        sources: ["code"],
      }),
    });

    expect(status).toBe(200);
    // All results should be from 'code' source
    if (data.data?.length > 0) {
      expect(data.data.every((r: any) => r.source === "code")).toBe(true);
    }
  });
});

describe.skipIf(!process.env.API_BASE)("Knowledge Base", () => {
  describe("Files", () => {
    it("should list files", async () => {
      const { status, data } = await apiRequest("/v1/knowledge-base/files");

      expect(status).toBe(200);
      expect(data).toHaveProperty("files");
      expect(data).toHaveProperty("total");
    });

    it("should support pagination", async () => {
      const { status, data } = await apiRequest(
        "/v1/knowledge-base/files?limit=10&offset=0"
      );

      expect(status).toBe(200);
      expect(data.limit).toBe(10);
      expect(data.offset).toBe(0);
    });
  });

  describe("Embeddings Status", () => {
    it("should return embedding coverage status", async () => {
      const { status, data } = await apiRequest(
        "/v1/knowledge-base/embeddings/status"
      );

      expect(status).toBe(200);
      expect(data).toHaveProperty("files");
      expect(data).toHaveProperty("artifacts");
      expect(data).toHaveProperty("overall");
      expect(data.overall).toHaveProperty("coverage");
      expect(data.overall).toHaveProperty("meets_threshold");
    });
  });

  describe("Stats", () => {
    it("should return storage statistics", async () => {
      const { status, data } = await apiRequest("/v1/knowledge-base/stats");

      expect(status).toBe(200);
      expect(data).toHaveProperty("files");
      expect(data).toHaveProperty("artifacts");
      expect(data).toHaveProperty("totalSize");
    });
  });

  describe("Unified Search", () => {
    it("should search across all KB sources", async () => {
      const { status, data } = await apiRequest(
        "/v1/knowledge-base/unified-search?query=test"
      );

      expect(status).toBe(200);
      expect(data).toHaveProperty("files");
      expect(data).toHaveProperty("artifacts");
      expect(data).toHaveProperty("embeddings");
    });
  });
});

describe.skipIf(!process.env.API_BASE)("Health Check", () => {
  it("should return healthy status", async () => {
    const response = await fetch(`${API_BASE}/health`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("ok");
  });
});
