import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { saveConsent } from "../src/auth/consent-policy.js";

type ApiServerModule = {
  httpServer: {
    listening: boolean;
    address: () => string | AddressInfo | null;
    once: (event: string, listener: () => void) => void;
    close: (cb: (err?: Error) => void) => void;
  };
};

describe("api-server authz", () => {
  let moduleRef: ApiServerModule;
  let baseUrl = "";
  let token = "";
  let projectDir = "";
  let homeDir = "";
  let originalCwd = process.cwd();
  let originalHome: string | undefined;
  let originalPort: string | undefined;
  let skipReason: string | null = null;

  async function requestJson(
    route: string,
    init: RequestInit = {}
  ): Promise<{ status: number; body: any }> {
    const response = await fetch(`${baseUrl}${route}`, init);
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: response.status, body };
  }

  beforeAll(async () => {
    if (process.env.AITM_DISABLE_AUTOLISTEN === "1") {
      skipReason = "AITM_DISABLE_AUTOLISTEN=1 prevents network-bound API authz tests";
      return;
    }

    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-api-authz-project-"));
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-api-authz-home-"));
    originalCwd = process.cwd();
    originalHome = process.env.HOME;
    originalPort = process.env.PORT;

    process.chdir(projectDir);
    process.env.HOME = homeDir;
    process.env.PORT = "0";

    try {
      moduleRef = (await import("../src/api-server.js")) as ApiServerModule;
      if (!moduleRef.httpServer.listening) {
        await new Promise<void>((resolve) => {
          moduleRef.httpServer.once("listening", resolve);
        });
      }

      const address = moduleRef.httpServer.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${address.port}`;

      const register = await requestJson("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "authz@test.local",
          password: "Password123!",
        }),
      });

      expect(register.status).toBe(200);
      expect(typeof register.body?.token).toBe("string");
      token = register.body.token;
    } catch (error: any) {
      const message = String(error?.message || error);
      if (message.includes("EPERM") && message.includes("listen")) {
        skipReason = message;
        return;
      }
      throw error;
    }
  }, 30000);

  afterAll(async () => {
    if (moduleRef?.httpServer?.listening) {
      await new Promise<void>((resolve, reject) => {
        moduleRef.httpServer.close((err?: Error) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }
    if (originalCwd) {
      process.chdir(originalCwd);
    }
    process.env.HOME = originalHome;
    process.env.PORT = originalPort;
    if (projectDir) {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
    if (homeDir) {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("returns 401 for protected route groups without auth", async () => {
    if (skipReason) return;

    const checks: Array<{ method: string; route: string; body?: Record<string, unknown> }> = [
      { method: "GET", route: "/api/checkpoints" },
      { method: "POST", route: "/api/restore", body: {} },
      { method: "GET", route: "/api/diff/advanced?from=x&filePath=a.ts" },
      { method: "GET", route: "/api/search?q=test" },
      { method: "GET", route: "/api/timeline" },
      { method: "GET", route: "/api/cloud/status" },
      { method: "GET", route: "/api/retention/sla" },
      { method: "GET", route: "/api/compliance/license" },
    ];

    for (const check of checks) {
      const result = await requestJson(check.route, {
        method: check.method,
        headers: check.body ? { "content-type": "application/json" } : undefined,
        body: check.body ? JSON.stringify(check.body) : undefined,
      });
      expect(result.status, `${check.method} ${check.route}`).toBe(401);
      expect(result.body?.error).toBe("Unauthorized");
    }
  });

  it("returns 401 for route hardening additions without auth", async () => {
    if (skipReason) return;

    const checks: Array<{ method: string; route: string; body?: Record<string, unknown> }> = [
      { method: "POST", route: "/api/checkpoints", body: { description: "unauthorized" } },
      { method: "POST", route: "/api/restore/undo", body: { steps: 1 } },
      { method: "POST", route: "/api/restore/to-time", body: { minutesAgo: 5 } },
      { method: "POST", route: "/api/restore/file", body: { checkpointId: "x", filePath: "a.ts" } },
      { method: "POST", route: "/api/restore/files", body: { checkpointId: "x", patterns: ["**/*"] } },
      { method: "GET", route: "/api/before/action/test" },
      { method: "GET", route: "/api/browse/test" },
      { method: "GET", route: "/api/browse/test/file?path=a.ts" },
      { method: "POST", route: "/api/refresh", body: {} },
    ];

    for (const check of checks) {
      const result = await requestJson(check.route, {
        method: check.method,
        headers: { "content-type": "application/json" },
        body: check.body ? JSON.stringify(check.body) : undefined,
      });
      expect(result.status, `${check.method} ${check.route}`).toBe(401);
      expect(result.body?.error).toBe("Unauthorized");
    }
  });

  it("allows protected API access when authenticated", async () => {
    if (skipReason) return;

    const result = await requestJson("/api/checkpoints", {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(result.status).toBe(200);
    expect(Array.isArray(result.body?.checkpoints)).toBe(true);
  });

  it("returns 403 with CONSENT_REQUIRED when capture consent is disabled", async () => {
    if (skipReason) return;

    saveConsent(projectDir, {
      policy: {
        operational_capture: false,
        training_export: false,
      },
    });

    const result = await requestJson("/api/checkpoints", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ description: "blocked by consent" }),
    });

    expect(result.status).toBe(403);
    expect(result.body?.code).toBe("CONSENT_REQUIRED");
  });

  it("returns 403 with CONSENT_REQUIRED on cloud capture/export routes when operational consent is disabled", async () => {
    if (skipReason) return;

    saveConsent(projectDir, {
      policy: {
        operational_capture: false,
        training_export: false,
      },
    });

    const checks: Array<{ method: string; route: string; body?: Record<string, unknown> }> = [
      { method: "POST", route: "/api/cloud/messages", body: { role: "user", content: "blocked", sessionId: "s1" } },
      { method: "POST", route: "/api/cloud/sessions", body: { sessionId: "s1" } },
      { method: "POST", route: "/api/cloud/events", body: { type: "checkpoint.created", sessionId: "s1" } },
      { method: "POST", route: "/api/cloud/sync", body: {} },
      { method: "GET", route: "/api/cloud/timeline" },
      { method: "GET", route: "/api/cloud/changes?since=2024-01-01T00:00:00.000Z" },
    ];

    for (const check of checks) {
      const result = await requestJson(check.route, {
        method: check.method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(check.body ? { "content-type": "application/json" } : {}),
        },
        body: check.body ? JSON.stringify(check.body) : undefined,
      });
      expect(result.status, `${check.method} ${check.route}`).toBe(403);
      expect(result.body?.code, `${check.method} ${check.route}`).toBe("CONSENT_REQUIRED");
    }
  });

  it("returns 401 for cloud mutation endpoints without auth", async () => {
    if (skipReason) return;

    const checks: Array<{ method: string; route: string; body?: Record<string, unknown> }> = [
      { method: "POST", route: "/api/cloud/connect", body: { connectionString: "postgres://fake" } },
      { method: "POST", route: "/api/cloud/disconnect", body: {} },
      { method: "POST", route: "/api/cloud/sync", body: {} },
      { method: "POST", route: "/api/cloud/branch", body: { name: "test" } },
      { method: "POST", route: "/api/cloud/messages", body: { role: "user", content: "test", sessionId: "s1" } },
      { method: "POST", route: "/api/cloud/sessions", body: { sessionId: "s1" } },
      { method: "POST", route: "/api/cloud/events", body: { type: "test", sessionId: "s1" } },
    ];

    for (const check of checks) {
      const result = await requestJson(check.route, {
        method: check.method,
        headers: { "content-type": "application/json" },
        body: check.body ? JSON.stringify(check.body) : undefined,
      });
      expect(result.status, `${check.method} ${check.route}`).toBe(401);
      expect(result.body?.error).toBe("Unauthorized");
    }
  });

  it("returns 401 for cloud read endpoints without auth", async () => {
    if (skipReason) return;

    const checks: Array<{ method: string; route: string }> = [
      { method: "GET", route: "/api/cloud/projects" },
      { method: "GET", route: "/api/cloud/stats" },
      { method: "GET", route: "/api/cloud/timeline" },
      { method: "GET", route: "/api/cloud/messages" },
      { method: "GET", route: "/api/cloud/events" },
      { method: "GET", route: "/api/cloud/changes?since=2024-01-01" },
      { method: "GET", route: "/api/cloud/search?query=test" },
    ];

    for (const check of checks) {
      const result = await requestJson(check.route, {
        method: check.method,
      });
      expect(result.status, `${check.method} ${check.route}`).toBe(401);
      expect(result.body?.error).toBe("Unauthorized");
    }
  });

  it("returns 401 for sync/neon endpoints without auth", async () => {
    if (skipReason) return;

    const checks: Array<{ method: string; route: string; body: Record<string, unknown> }> = [
      { method: "POST", route: "/api/sync/checkpoint", body: { projectId: "p1", checkpoint: {} } },
      { method: "POST", route: "/api/sync/blob", body: { hash: "abc", size: 100 } },
      { method: "POST", route: "/api/sync/status", body: { projectId: "p1" } },
      { method: "POST", route: "/api/sync/message", body: { projectId: "p1", message: {} } },
      { method: "POST", route: "/api/sync/tool-call", body: { projectId: "p1", toolCall: {} } },
    ];

    for (const check of checks) {
      const result = await requestJson(check.route, {
        method: check.method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(check.body),
      });
      expect(result.status, `${check.method} ${check.route}`).toBe(401);
      expect(result.body?.error).toBe("Unauthorized");
    }
  });

  it("returns 401 for search sub-routes without auth", async () => {
    if (skipReason) return;

    const checks: Array<{ method: string; route: string }> = [
      { method: "GET", route: "/api/search/conversations?q=test" },
      { method: "GET", route: "/api/search/checkpoints?q=test" },
    ];

    for (const check of checks) {
      const result = await requestJson(check.route, {
        method: check.method,
      });
      expect(result.status, `${check.method} ${check.route}`).toBe(401);
      expect(result.body?.error).toBe("Unauthorized");
    }
  });

  it("returns 401 for timeline sub-routes without auth", async () => {
    if (skipReason) return;

    const checks: Array<{ method: string; route: string }> = [
      { method: "GET", route: "/api/timeline/3d" },
      { method: "GET", route: "/api/timeline/by-file?path=src/main.ts" },
      { method: "GET", route: "/api/timeline/by-directory?path=src" },
      { method: "GET", route: "/api/timeline/by-date-range?start=2024-01-01&end=2024-12-31" },
    ];

    for (const check of checks) {
      const result = await requestJson(check.route, {
        method: check.method,
      });
      expect(result.status, `${check.method} ${check.route}`).toBe(401);
      expect(result.body?.error).toBe("Unauthorized");
    }
  });

  it("returns 401 for diff sub-routes without auth", async () => {
    if (skipReason) return;

    const checks: Array<{ method: string; route: string }> = [
      { method: "GET", route: "/api/diff/summary" },
    ];

    for (const check of checks) {
      const result = await requestJson(check.route, {
        method: check.method,
      });
      expect(result.status, `${check.method} ${check.route}`).toBe(401);
      expect(result.body?.error).toBe("Unauthorized");
    }
  });

  it("returns 401 for merge and resolve endpoints without auth", async () => {
    if (skipReason) return;

    const mergeResult = await requestJson("/api/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filePath: "a.ts" }),
    });
    expect(mergeResult.status).toBe(401);
    expect(mergeResult.body?.error).toBe("Unauthorized");

    const resolveResult = await requestJson("/api/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filePath: "a.ts", resolution: "ours" }),
    });
    expect(resolveResult.status).toBe(401);
    expect(resolveResult.body?.error).toBe("Unauthorized");
  });

  it("returns 403 for internal API without X-Internal-Secret", async () => {
    if (skipReason) return;

    const checks: Array<{ method: string; route: string; body?: Record<string, unknown> }> = [
      { method: "POST", route: "/api/internal/keys", body: { id: "k1", userId: "u1", keyHash: "h", keyPrefix: "p", name: "n" } },
      { method: "GET", route: "/api/internal/keys?userId=u1" },
    ];

    for (const check of checks) {
      const result = await requestJson(check.route, {
        method: check.method,
        headers: check.body ? { "content-type": "application/json" } : undefined,
        body: check.body ? JSON.stringify(check.body) : undefined,
      });
      // Returns 503 when INTERNAL_SECRET not configured, or 403 when wrong secret
      expect(
        [403, 503].includes(result.status),
        `${check.method} ${check.route} should be 403 or 503 but got ${result.status}`
      ).toBe(true);
    }
  });

  it("public routes remain accessible without auth", async () => {
    if (skipReason) return;

    // Health check - always public
    const healthResult = await requestJson("/health");
    expect(healthResult.status).toBe(200);
    expect(healthResult.body?.status).toBe("ok");

    // Root endpoint - always public
    const rootResult = await requestJson("/");
    expect(rootResult.status).toBe(200);
    expect(rootResult.body?.name).toBe("Gitgram TimeMachine API");

    // Auth login - public
    const loginResult = await requestJson("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "nobody@test.local", password: "wrong" }),
    });
    // 401 for bad credentials is correct; not the 401 from auth middleware
    expect(loginResult.status).toBe(401);
    expect(loginResult.body?.error).not.toBe("Unauthorized");
  });

  it("consent GET/POST routes require auth", async () => {
    if (skipReason) return;

    const getResult = await requestJson("/api/consent");
    // Consent is behind requireAuth
    expect(getResult.status).toBe(401);
    expect(getResult.body?.error).toBe("Unauthorized");

    const postResult = await requestJson("/api/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ policy: { operational_capture: true } }),
    });
    expect(postResult.status).toBe(401);
    expect(postResult.body?.error).toBe("Unauthorized");
  });
});
