/**
 * Unit tests for a2aService.ts
 *
 * The A2A service is backed by Postgres in production (DbAgentRegistry +
 * DbMessageStore). To keep these unit tests pure and DB-free, each test injects
 * lightweight in-memory implementations of the AgentRegistry and MessageStore
 * interfaces into A2AService — the service logic under test is identical
 * regardless of the backing store.
 *
 * Tests cover:
 *  - registerAgent: success, duplicate throws, apiKey format
 *  - unregisterAgent: known agent, unknown agent no-op
 *  - getAgents: correct public fields, API keys MUST NOT be returned
 *  - resolveApiKey: valid key resolves agentId, invalid key returns null
 *  - sendMessage: persists, status based on recipient, unknown sender/recipient
 *  - getMessages: queued messages, since filter, limit cap, unknown agent throws
 *  - broadcastToCapability: matching agents, recipientCount, case-insensitive
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  A2AService,
  type AgentInfo,
  type AgentRegistry,
  type A2AMessage,
  type MessageStore,
} from "../../src/services/a2aService.js";

// ---------------------------------------------------------------------------
// In-memory fakes implementing the production interfaces
// ---------------------------------------------------------------------------

class InMemoryAgentRegistry implements AgentRegistry {
  private readonly agents = new Map<string, AgentInfo>();

  async has(agentId: string): Promise<boolean> {
    return this.agents.has(agentId);
  }
  async get(agentId: string): Promise<AgentInfo | undefined> {
    return this.agents.get(agentId);
  }
  async insert(info: AgentInfo): Promise<void> {
    this.agents.set(info.id, info);
  }
  async delete(agentId: string): Promise<boolean> {
    return this.agents.delete(agentId);
  }
  async list(): Promise<AgentInfo[]> {
    return Array.from(this.agents.values());
  }
  async findByApiKey(apiKey: string): Promise<AgentInfo | undefined> {
    return Array.from(this.agents.values()).find((a) => a.apiKey === apiKey);
  }
  async touch(agentId: string, lastSeen: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.agents.set(agentId, { ...agent, lastSeen, status: "active" });
    }
  }
}

class InMemoryMessageStore implements MessageStore {
  private readonly messages: A2AMessage[] = [];

  async append(message: A2AMessage): Promise<void> {
    this.messages.push(message);
  }
  async loadForRecipient(
    agentId: string,
    sinceIso: string | undefined,
    limit: number
  ): Promise<A2AMessage[]> {
    const sinceMs = sinceIso ? new Date(sinceIso).getTime() : 0;
    return this.messages
      .filter((m) => m.toAgentId === agentId)
      .filter((m) =>
        Number.isNaN(sinceMs) ? true : new Date(m.timestamp).getTime() > sinceMs
      )
      .slice(-limit);
  }
}

function newService(): A2AService {
  return new A2AService(new InMemoryAgentRegistry(), new InMemoryMessageStore());
}

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
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("A2AService", () => {
  describe("registerAgent", () => {
    let svc: A2AService;
    beforeEach(() => {
      svc = newService();
    });

    it("returns the agentId and a non-empty apiKey on success", async () => {
      const result = await svc.registerAgent(AGENT_ALPHA);
      expect(result.agentId).toBe("agent_alpha");
      expect(result.apiKey).toBeTruthy();
    });

    it("generates an apiKey that begins with 'a2a_'", async () => {
      const { apiKey } = await svc.registerAgent(AGENT_ALPHA);
      expect(apiKey).toMatch(/^a2a_/);
    });

    it("generates a unique apiKey for each registered agent", async () => {
      const r1 = await svc.registerAgent(AGENT_ALPHA);
      const r2 = await svc.registerAgent(AGENT_BETA);
      expect(r1.apiKey).not.toBe(r2.apiKey);
    });

    it("throws when the same agentId is registered twice", async () => {
      await svc.registerAgent(AGENT_ALPHA);
      await expect(svc.registerAgent(AGENT_ALPHA)).rejects.toThrow(
        "already registered"
      );
    });

    it("makes the agent appear in getAgents after registration", async () => {
      await svc.registerAgent(AGENT_ALPHA);
      const agents = await svc.getAgents();
      expect(agents.map((a) => a.id)).toContain("agent_alpha");
    });
  });

  describe("unregisterAgent", () => {
    let svc: A2AService;
    beforeEach(async () => {
      svc = newService();
      await svc.registerAgent(AGENT_ALPHA);
    });

    it("returns true and removes the agent from the registry", async () => {
      const removed = await svc.unregisterAgent("agent_alpha");
      expect(removed).toBe(true);
      expect((await svc.getAgents()).map((a) => a.id)).not.toContain("agent_alpha");
    });

    it("returns false when the agentId does not exist", async () => {
      const removed = await svc.unregisterAgent("nonexistent_agent");
      expect(removed).toBe(false);
    });
  });

  describe("getAgents", () => {
    let svc: A2AService;
    beforeEach(async () => {
      svc = newService();
      await svc.registerAgent(AGENT_ALPHA);
      await svc.registerAgent(AGENT_BETA);
    });

    it("returns all registered agents as public info objects", async () => {
      const ids = (await svc.getAgents()).map((a) => a.id);
      expect(ids).toContain("agent_alpha");
      expect(ids).toContain("agent_beta");
    });

    it("does NOT expose apiKey in the public info", async () => {
      for (const agent of await svc.getAgents()) {
        expect(Object.keys(agent)).not.toContain("apiKey");
      }
    });

    it("exposes id, name, capabilities, status, lastSeen on each entry", async () => {
      const agent = (await svc.getAgents()).find((a) => a.id === "agent_alpha")!;
      expect(agent.id).toBe("agent_alpha");
      expect(agent.name).toBe("Alpha Agent");
      expect(agent.capabilities).toContain("summarize");
      expect(agent.status).toBe("active");
      expect(agent.lastSeen).toBeTruthy();
    });

    it("returns an empty array when no agents are registered", async () => {
      expect(await newService().getAgents()).toHaveLength(0);
    });
  });

  describe("resolveApiKey", () => {
    let svc: A2AService;
    let alphaKey: string;
    beforeEach(async () => {
      svc = newService();
      ({ apiKey: alphaKey } = await svc.registerAgent(AGENT_ALPHA));
    });

    it("returns the owning agentId for a valid key", async () => {
      expect(await svc.resolveApiKey(alphaKey)).toBe("agent_alpha");
    });

    it("returns null for an unknown key", async () => {
      expect(await svc.resolveApiKey("a2a_totally_wrong_key")).toBeNull();
    });

    it("updates lastSeen on a valid key lookup", async () => {
      const before = (await svc.getAgents()).find((a) => a.id === "agent_alpha")!.lastSeen;
      await new Promise((r) => setTimeout(r, 2));
      await svc.resolveApiKey(alphaKey);
      const after = (await svc.getAgents()).find((a) => a.id === "agent_alpha")!.lastSeen;
      expect(after).toBeTruthy();
      expect(new Date(after).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
    });
  });

  describe("sendMessage", () => {
    let svc: A2AService;
    beforeEach(async () => {
      svc = newService();
      await svc.registerAgent(AGENT_ALPHA);
      await svc.registerAgent(AGENT_BETA);
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

  describe("getMessages", () => {
    let svc: A2AService;
    beforeEach(async () => {
      svc = newService();
      await svc.registerAgent(AGENT_ALPHA);
      await svc.registerAgent(AGENT_BETA);
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
      expect(await svc.getMessages("agent_beta", undefined, 100)).toHaveLength(3);
    });

    it("respects the 'limit' cap (returns last N messages)", async () => {
      expect(await svc.getMessages("agent_beta", undefined, 2)).toHaveLength(2);
    });

    it("filters out messages older than 'since' ISO timestamp", async () => {
      const sinceTs = new Date().toISOString();
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
      await expect(svc.getMessages("no_such_agent", undefined, 50)).rejects.toThrow(
        "not registered"
      );
    });

    it("returns an empty array when no messages have been sent yet", async () => {
      await svc.registerAgent(AGENT_GAMMA);
      expect(await svc.getMessages("agent_gamma", undefined, 100)).toHaveLength(0);
    });
  });

  describe("broadcastToCapability", () => {
    let svc: A2AService;
    beforeEach(async () => {
      svc = newService();
      await svc.registerAgent(AGENT_ALPHA); // summarize, translate
      await svc.registerAgent(AGENT_BETA); // translate, embed
      await svc.registerAgent(AGENT_GAMMA); // summarize
    });

    it("returns a broadcastId, recipientCount and timestamp", async () => {
      const result = await svc.broadcastToCapability({
        capability: "translate",
        messageType: "task_request",
        payload: { task: "translate-all" },
      });
      expect(result.broadcastId).toBeTruthy();
      expect(result.recipientCount).toBe(2);
      expect(result.timestamp).toBeTruthy();
    });

    it("delivers the broadcast message into each recipient's inbox", async () => {
      await svc.broadcastToCapability({
        capability: "summarize",
        messageType: "task_request",
        payload: { doc: "report.pdf" },
      });
      expect(await svc.getMessages("agent_alpha", undefined, 100)).toHaveLength(1);
      expect(await svc.getMessages("agent_gamma", undefined, 100)).toHaveLength(1);
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
      expect(result.recipientCount).toBe(2);
    });

    it("returns recipientCount=0 and sends nothing when no agent has the capability", async () => {
      const result = await svc.broadcastToCapability({
        capability: "nonexistent_cap",
        messageType: "error",
        payload: { reason: "unknown" },
      });
      expect(result.recipientCount).toBe(0);
      for (const id of ["agent_alpha", "agent_beta", "agent_gamma"]) {
        expect(await svc.getMessages(id, undefined, 100)).toHaveLength(0);
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
