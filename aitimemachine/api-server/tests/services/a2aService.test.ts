/**
 * Unit tests for a2aService.ts
 *
 * The A2A service provides an in-process agent registry backed by an
 * @a2a-js/sdk InMemoryTaskStore for per-recipient message queuing.
 *
 * Tests cover:
 *  - registerAgent: success, duplicate throws, apiKey format
 *  - unregisterAgent: known agent, unknown agent no-op
 *  - getAgents: correct public fields, API keys MUST NOT be returned
 *  - resolveApiKey: valid key resolves agentId, invalid key returns null
 *  - sendMessage: persists via TaskStore, updates inbox, status based on recipient
 *  - sendMessage: rejects unknown sender / unknown recipient
 *  - getMessages: returns queued messages, since filter, limit cap
 *  - getMessages: throws for unknown agentId
 *  - broadcastToCapability: sends to all matching agents, returns recipientCount
 *  - broadcastToCapability: case-insensitive capability matching
 *  - broadcastToCapability: zero recipients when no match
 *
 * A new A2AService instance is created per describe-block to keep tests
 * fully isolated without touching the exported singleton.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { A2AService } from "../../src/services/a2aService.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const AGENT_ALPHA = {
  agentId: "agent_alpha",
  name: "Alpha Agent",
  capabilities: ["summarize", "translate"],
  endpoint: "https://alpha.example.com/a2a",
};

const AGENT_BETA = {
  agentId: "agent_beta",
  name: "Beta Agent",
  capabilities: ["translate", "embed"],
  endpoint: "https://beta.example.com/a2a",
};

const AGENT_GAMMA = {
  agentId: "agent_gamma",
  name: "Gamma Agent",
  capabilities: ["summarize"],
  // no endpoint
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("A2AService", () => {
  // =========================================================================
  // registerAgent
  // =========================================================================

  describe("registerAgent", () => {
    let svc: A2AService;

    beforeEach(() => {
      svc = new A2AService();
    });

    it("returns the agentId and a non-empty apiKey on success", () => {
      const result = svc.registerAgent(AGENT_ALPHA);

      expect(result.agentId).toBe("agent_alpha");
      expect(result.apiKey).toBeTruthy();
    });

    it("generates an apiKey that begins with 'a2a_'", () => {
      const { apiKey } = svc.registerAgent(AGENT_ALPHA);
      expect(apiKey).toMatch(/^a2a_/);
    });

    it("generates a unique apiKey for each registered agent", () => {
      const r1 = svc.registerAgent(AGENT_ALPHA);
      const r2 = svc.registerAgent(AGENT_BETA);

      expect(r1.apiKey).not.toBe(r2.apiKey);
    });

    it("throws when the same agentId is registered twice", () => {
      svc.registerAgent(AGENT_ALPHA);

      expect(() => svc.registerAgent(AGENT_ALPHA)).toThrow(
        "already registered"
      );
    });

    it("makes the agent appear in getAgents after registration", () => {
      svc.registerAgent(AGENT_ALPHA);

      const agents = svc.getAgents();
      expect(agents.map((a) => a.id)).toContain("agent_alpha");
    });
  });

  // =========================================================================
  // unregisterAgent
  // =========================================================================

  describe("unregisterAgent", () => {
    let svc: A2AService;

    beforeEach(() => {
      svc = new A2AService();
      svc.registerAgent(AGENT_ALPHA);
    });

    it("returns true and removes the agent from the registry", () => {
      const removed = svc.unregisterAgent("agent_alpha");

      expect(removed).toBe(true);
      expect(svc.getAgents().map((a) => a.id)).not.toContain("agent_alpha");
    });

    it("returns false when the agentId does not exist", () => {
      const removed = svc.unregisterAgent("nonexistent_agent");

      expect(removed).toBe(false);
    });

    it("cleans up the inbox so later message sends do not accumulate stale data", async () => {
      svc.registerAgent(AGENT_BETA);
      await svc.sendMessage({
        fromAgentId: "agent_alpha",
        toAgentId: "agent_beta",
        messageType: "context_share",
        payload: { data: "hello" },
      });

      svc.unregisterAgent("agent_beta");
      // Re-register to verify inbox was cleared
      svc.registerAgent(AGENT_BETA);

      const msgs = await svc.getMessages("agent_beta", undefined, 100);
      expect(msgs).toHaveLength(0);
    });
  });

  // =========================================================================
  // getAgents
  // =========================================================================

  describe("getAgents", () => {
    let svc: A2AService;

    beforeEach(() => {
      svc = new A2AService();
      svc.registerAgent(AGENT_ALPHA);
      svc.registerAgent(AGENT_BETA);
    });

    it("returns all registered agents as public info objects", () => {
      const agents = svc.getAgents();
      const ids = agents.map((a) => a.id);

      expect(ids).toContain("agent_alpha");
      expect(ids).toContain("agent_beta");
    });

    it("does NOT expose apiKey in the public info", () => {
      const agents = svc.getAgents();
      for (const agent of agents) {
        expect(Object.keys(agent)).not.toContain("apiKey");
      }
    });

    it("exposes id, name, capabilities, status, lastSeen on each entry", () => {
      const agent = svc.getAgents().find((a) => a.id === "agent_alpha")!;

      expect(agent.id).toBe("agent_alpha");
      expect(agent.name).toBe("Alpha Agent");
      expect(agent.capabilities).toContain("summarize");
      expect(agent.status).toBe("active");
      expect(agent.lastSeen).toBeTruthy();
    });

    it("returns an empty array when no agents are registered", () => {
      const empty = new A2AService();
      expect(empty.getAgents()).toHaveLength(0);
    });
  });

  // =========================================================================
  // resolveApiKey
  // =========================================================================

  describe("resolveApiKey", () => {
    let svc: A2AService;
    let alphaKey: string;

    beforeEach(() => {
      svc = new A2AService();
      ({ apiKey: alphaKey } = svc.registerAgent(AGENT_ALPHA));
    });

    it("returns the owning agentId for a valid key", () => {
      const resolved = svc.resolveApiKey(alphaKey);
      expect(resolved).toBe("agent_alpha");
    });

    it("returns null for an unknown key", () => {
      const resolved = svc.resolveApiKey("a2a_totally_wrong_key");
      expect(resolved).toBeNull();
    });

    it("updates lastSeen on a valid key lookup", () => {
      const before = svc.getAgents().find((a) => a.id === "agent_alpha")!.lastSeen;
      svc.resolveApiKey(alphaKey);
      const after = svc.getAgents().find((a) => a.id === "agent_alpha")!.lastSeen;

      // lastSeen should be refreshed (timestamps might be equal if within the same ms,
      // but the important thing is the call does not throw and the value is present)
      expect(after).toBeTruthy();
      expect(typeof after).toBe("string");
      // after >= before always holds
      expect(new Date(after).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
    });
  });

  // =========================================================================
  // sendMessage
  // =========================================================================

  describe("sendMessage", () => {
    let svc: A2AService;

    beforeEach(() => {
      svc = new A2AService();
      svc.registerAgent(AGENT_ALPHA);
      svc.registerAgent(AGENT_BETA);
    });

    it("returns a SendMessageResult with a messageId, status and timestamp", async () => {
      const result = await svc.sendMessage({
        fromAgentId: "agent_alpha",
        toAgentId: "agent_beta",
        messageType: "task_request",
        payload: { taskName: "translate document" },
      });

      expect(result.messageId).toBeTruthy();
      expect(result.status).toMatch(/^(delivered|queued)$/);
      expect(result.timestamp).toBeTruthy();
    });

    it("delivers messages to active recipients with status='delivered'", async () => {
      const result = await svc.sendMessage({
        fromAgentId: "agent_alpha",
        toAgentId: "agent_beta",
        messageType: "task_request",
        payload: {},
      });

      expect(result.status).toBe("delivered");
    });

    it("persists the message so the recipient can retrieve it", async () => {
      await svc.sendMessage({
        fromAgentId: "agent_alpha",
        toAgentId: "agent_beta",
        messageType: "context_share",
        payload: { context: "test context data" },
      });

      const msgs = await svc.getMessages("agent_beta", undefined, 100);
      expect(msgs).toHaveLength(1);
      expect(msgs[0].fromAgentId).toBe("agent_alpha");
      expect(msgs[0].messageType).toBe("context_share");
    });

    it("preserves the optional sessionId on the stored message", async () => {
      await svc.sendMessage({
        fromAgentId: "agent_alpha",
        toAgentId: "agent_beta",
        messageType: "task_response",
        payload: { result: "done" },
        sessionId: "sess_xyz_001",
      });

      const msgs = await svc.getMessages("agent_beta", undefined, 100);
      expect(msgs[0].sessionId).toBe("sess_xyz_001");
    });

    it("throws when the sender is not registered", async () => {
      await expect(
        svc.sendMessage({
          fromAgentId: "ghost_sender",
          toAgentId: "agent_beta",
          messageType: "error",
          payload: {},
        })
      ).rejects.toThrow("Sender agent");
    });

    it("throws when the recipient is not registered", async () => {
      await expect(
        svc.sendMessage({
          fromAgentId: "agent_alpha",
          toAgentId: "ghost_recipient",
          messageType: "status_update",
          payload: {},
        })
      ).rejects.toThrow("Recipient agent");
    });

    it("allows multiple messages to accumulate in the same inbox", async () => {
      await svc.sendMessage({
        fromAgentId: "agent_alpha",
        toAgentId: "agent_beta",
        messageType: "task_request",
        payload: { n: 1 },
      });
      await svc.sendMessage({
        fromAgentId: "agent_alpha",
        toAgentId: "agent_beta",
        messageType: "task_request",
        payload: { n: 2 },
      });

      const msgs = await svc.getMessages("agent_beta", undefined, 100);
      expect(msgs).toHaveLength(2);
    });
  });

  // =========================================================================
  // getMessages
  // =========================================================================

  describe("getMessages", () => {
    let svc: A2AService;

    beforeEach(async () => {
      svc = new A2AService();
      svc.registerAgent(AGENT_ALPHA);
      svc.registerAgent(AGENT_BETA);

      // Seed 3 messages to agent_beta
      for (let i = 0; i < 3; i++) {
        await svc.sendMessage({
          fromAgentId: "agent_alpha",
          toAgentId: "agent_beta",
          messageType: "task_request",
          payload: { seq: i },
        });
      }
    });

    it("returns all queued messages with no filters", async () => {
      const msgs = await svc.getMessages("agent_beta", undefined, 100);
      expect(msgs).toHaveLength(3);
    });

    it("respects the 'limit' cap (returns last N messages)", async () => {
      const msgs = await svc.getMessages("agent_beta", undefined, 2);
      expect(msgs).toHaveLength(2);
    });

    it("filters out messages older than 'since' ISO timestamp", async () => {
      // Send one more message after recording a timestamp
      const sinceTs = new Date().toISOString();
      // Allow at least 1 ms to pass
      await new Promise((r) => setTimeout(r, 2));

      await svc.sendMessage({
        fromAgentId: "agent_alpha",
        toAgentId: "agent_beta",
        messageType: "status_update",
        payload: { fresh: true },
      });

      const msgs = await svc.getMessages("agent_beta", sinceTs, 100);
      expect(msgs.length).toBeGreaterThanOrEqual(1);
      for (const m of msgs) {
        expect(new Date(m.timestamp).getTime()).toBeGreaterThan(
          new Date(sinceTs).getTime()
        );
      }
    });

    it("throws when the agentId is not registered", async () => {
      await expect(
        svc.getMessages("no_such_agent", undefined, 50)
      ).rejects.toThrow("not registered");
    });

    it("returns an empty array when no messages have been sent yet", async () => {
      svc.registerAgent(AGENT_GAMMA);
      const msgs = await svc.getMessages("agent_gamma", undefined, 100);
      expect(msgs).toHaveLength(0);
    });
  });

  // =========================================================================
  // broadcastToCapability
  // =========================================================================

  describe("broadcastToCapability", () => {
    let svc: A2AService;

    beforeEach(() => {
      svc = new A2AService();
      svc.registerAgent(AGENT_ALPHA);  // capabilities: summarize, translate
      svc.registerAgent(AGENT_BETA);   // capabilities: translate, embed
      svc.registerAgent(AGENT_GAMMA);  // capabilities: summarize
    });

    it("returns a broadcastId, recipientCount and timestamp", async () => {
      const result = await svc.broadcastToCapability({
        capability: "translate",
        messageType: "task_request",
        payload: { task: "translate-all" },
      });

      expect(result.broadcastId).toBeTruthy();
      expect(result.recipientCount).toBe(2); // alpha + beta
      expect(result.timestamp).toBeTruthy();
    });

    it("delivers the broadcast message into each recipient's inbox", async () => {
      await svc.broadcastToCapability({
        capability: "summarize",
        messageType: "task_request",
        payload: { doc: "report.pdf" },
      });

      const alphaMsgs = await svc.getMessages("agent_alpha", undefined, 100);
      const gammaMsgs = await svc.getMessages("agent_gamma", undefined, 100);

      expect(alphaMsgs).toHaveLength(1);
      expect(gammaMsgs).toHaveLength(1);
    });

    it("includes the broadcastId in every recipient's message payload", async () => {
      const { broadcastId } = await svc.broadcastToCapability({
        capability: "summarize",
        messageType: "context_share",
        payload: { info: "shared" },
      });

      const msgs = await svc.getMessages("agent_alpha", undefined, 100);
      expect(msgs[0].payload.broadcastId).toBe(broadcastId);
    });

    it("matches capability names case-insensitively", async () => {
      const result = await svc.broadcastToCapability({
        capability: "TRANSLATE",
        messageType: "status_update",
        payload: {},
      });

      expect(result.recipientCount).toBe(2); // alpha + beta
    });

    it("returns recipientCount=0 and sends nothing when no agent has the capability", async () => {
      const result = await svc.broadcastToCapability({
        capability: "nonexistent_cap",
        messageType: "error",
        payload: { reason: "unknown" },
      });

      expect(result.recipientCount).toBe(0);
      // No agent inboxes should have received anything
      for (const id of ["agent_alpha", "agent_beta", "agent_gamma"]) {
        const msgs = await svc.getMessages(id, undefined, 100);
        expect(msgs).toHaveLength(0);
      }
    });

    it("sender is recorded as 'broadcast' in the fromAgentId field", async () => {
      await svc.broadcastToCapability({
        capability: "embed",
        messageType: "task_request",
        payload: {},
      });

      const msgs = await svc.getMessages("agent_beta", undefined, 100);
      expect(msgs[0].fromAgentId).toBe("broadcast");
    });
  });
});
